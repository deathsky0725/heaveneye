import { join } from 'node:path';
import { AGENTS, AGENT_IDS, type AgentId, HOME } from '../config.ts';
import type { AgentSnapshot, AgentStatus, TokenUsage, ServerEvent, KanbanEventEntry, NotificationEntry, CrashNotificationEntry } from './types.js';
import { modelToProvider } from './types.js';

type Listener = (event: ServerEvent) => void;

const blankUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });

/** A single token event with timestamp + model for rolling window accounting */
interface TokenEvent {
  ts: number;        // Unix ms
  model: string;     // model name (e.g. 'claude-opus-4-5')
  usage: TokenUsage;
}

interface SessionEntry {
  sessionId: string;
  startTs: number;   // Unix ms
  endTs: number | null; // null = still active
  totalEvents: number;
  totalTokens: number;
}

function blankSnapshot(id: AgentId): AgentSnapshot {
  const p = AGENTS[id];
  return {
    id,
    name: p.name,
    role: p.role,
    color: p.color,
    team: p.team,
    status: 'idle',
    currentModel: p.defaultModel,
    tokensToday: blankUsage(),
  };
}

const IDLE_TIMEOUT_MS = 30_000;
const DONE_LINGER_MS = 60_000;

class StateEngine {
  private agents = new Map<AgentId, AgentSnapshot>();
  private listeners = new Set<Listener>();
  private doneTimers = new Map<AgentId, ReturnType<typeof setTimeout>>();
  private lastTokenAt = new Map<AgentId, number>();
  private eventIdCounter = 0;
  private kanbanBuffer: KanbanEventEntry[] = [];
  private static readonly KANBAN_BUFFER_CAPACITY = 200;

  /** Rolling 5h window of per-agent token events */
  private tokenEvents = new Map<AgentId, TokenEvent[]>();
  private static readonly WINDOW_MS = 5 * 60 * 60 * 1000;

  /** Rolling 24h window of per-agent token events (separate storage for 24h endpoint) */
  private tokenEvents24h = new Map<AgentId, TokenEvent[]>();
  private static readonly WINDOW24H_MS = 24 * 60 * 60 * 1000;

  /** Active + recent sessions per agent */
  private sessions = new Map<AgentId, SessionEntry[]>();
  private static readonly MAX_SESSIONS = 10;

  private currentSessionId = new Map<AgentId, string>();

  private static readonly TOOL_WINDOW_MS = 24 * 60 * 60 * 1000;

  // === Crash notification queue (Phase D.2) ===
  private crashNotifications: CrashNotificationEntry[] = [];
  private static readonly CRASH_NOTIFICATION_MAX = 50;

  constructor() {
    for (const id of AGENT_IDS) this.agents.set(id, blankSnapshot(id));
    setInterval(() => { this.sweepIdle(); this.pruneWindows(); }, 5_000);
  }

  private sweepIdle() {
    const now = Date.now();
    for (const id of AGENT_IDS) {
      const a = this.agents.get(id)!;
      if (a.status !== 'working' && a.status !== 'thinking') continue;
      const last = this.lastTokenAt.get(id) ?? 0;
      if (now - last > IDLE_TIMEOUT_MS) {
        this.patch(id, { status: 'idle', currentBoard: undefined, lastTool: undefined });
      }
    }
  }

  private pruneWindows() {
    const cutoff5h = Date.now() - StateEngine.WINDOW_MS;
    const cutoff24h = Date.now() - StateEngine.WINDOW24H_MS;
    for (const id of AGENT_IDS) {
      // 5h window
      const events5h = this.tokenEvents.get(id) ?? [];
      this.tokenEvents.set(id, events5h.filter((e) => e.ts > cutoff5h));
      // 24h window
      const events24h = this.tokenEvents24h.get(id) ?? [];
      this.tokenEvents24h.set(id, events24h.filter((e) => e.ts > cutoff24h));
      // Prune sessions: remove ended sessions beyond MAX_SESSIONS, keep active ones
      const sessions = this.sessions.get(id) ?? [];
      const cutoffSession = Date.now() - (StateEngine.WINDOW24H_MS * 2);
      this.sessions.set(id, sessions.filter(
        (s) => s.endTs === null || s.endTs > cutoffSession
      ).slice(-StateEngine.MAX_SESSIONS));
    }
  }

  /**
   * Returns aggregated 5h window usage per model for each agent.
   * Response shape:
   *   { model, input, output, cacheRead, cacheCreate, windowStartedAt, nextResetAt }[]
   * windowStartedAt / nextResetAt are null if the window has expired (no recent events).
   */
  getUsage5h() {
    const now = Date.now();
    const cutoff = now - StateEngine.WINDOW_MS;
    const result: Array<{
      agent: AgentId;
      model: string;
      input: number;
      output: number;
      cacheRead: number;
      cacheCreate: number;
      windowStartedAt: number | null;
      nextResetAt: number | null;
    }> = [];

    for (const id of AGENT_IDS) {
      const events = this.tokenEvents.get(id) ?? [];
      // Find the oldest event still inside the window
      const valid = events.filter((e) => e.ts > cutoff);
      if (valid.length === 0) continue;

      // windowStartedAt = timestamp of the oldest event still inside the window
      // (i.e. the first event that opened the current 5h rolling window)
      const windowStartedAt = Math.min(...valid.map((e) => e.ts));
      const nextResetAt = windowStartedAt + StateEngine.WINDOW_MS;

      // Aggregate by model
      const byModel = new Map<string, TokenUsage>();
      for (const ev of valid) {
        const cur = byModel.get(ev.model) ?? blankUsage();
        byModel.set(ev.model, {
          input: cur.input + ev.usage.input,
          output: cur.output + ev.usage.output,
          cacheRead: cur.cacheRead + ev.usage.cacheRead,
          cacheCreate: cur.cacheCreate + ev.usage.cacheCreate,
        });
      }

      for (const [model, usage] of byModel) {
        result.push({ agent: id, model, ...usage, windowStartedAt, nextResetAt });
      }
    }

    return result;
  }

  /**
   * 24h hourly buckets for a single agent — used by /api/usage/24h.
   * Returns 24 buckets (most recent hour last), each summing all token
   * components (input + output + cacheRead) for that hour.
   */
  getUsage24h(agentId: AgentId): Array<{ hour: string; total: number; input: number; output: number; cacheRead: number }> {
    if (!AGENTS[agentId]) return [];
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const buckets: Array<{ hour: string; total: number; input: number; output: number; cacheRead: number }> = [];

    const events = this.tokenEvents24h.get(agentId) ?? [];
    for (let i = 23; i >= 0; i--) {
      const start = now - (i + 1) * hourMs;
      const end = now - i * hourMs;
      const inBucket = events.filter((e) => e.ts >= start && e.ts < end);
      const sum = inBucket.reduce(
        (acc, e) => ({
          input: acc.input + e.usage.input,
          output: acc.output + e.usage.output,
          cacheRead: acc.cacheRead + e.usage.cacheRead,
        }),
        { input: 0, output: 0, cacheRead: 0 }
      );
      buckets.push({
        hour: new Date(start).toISOString(),
        total: sum.input + sum.output + sum.cacheRead,
        ...sum,
      });
    }
    return buckets;
  }

  getUsageLastMinute(agentId: AgentId): number {
    if (!AGENTS[agentId]) return 0;
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const events = this.tokenEvents.get(agentId) ?? [];
    let sum = 0;
    for (const e of events) {
      if (e.ts > oneMinAgo) {
        sum += (e.usage.input ?? 0) + (e.usage.output ?? 0) + (e.usage.cacheRead ?? 0) + (e.usage.cacheCreate ?? 0);
      }
    }
    return sum;
  }

  /**
   * 7d daily buckets for a single agent — used by /api/usage/7d.
   * Returns 7 buckets (oldest first, today last), each summing all token
   * components for that calendar day (local time).
   */
  getUsage7d(agentId: AgentId): Array<{ day: string; total: number; input: number; output: number; cacheRead: number }> {
    return this._getUsageNdays(agentId, 7);
  }

  /**
   * 30d daily buckets for a single agent — used by /api/usage/30d.
   * Returns 30 buckets (oldest first, today last), each summing all token
   * components for that calendar day (local time).
   */
  getUsage30d(agentId: AgentId): Array<{ day: string; total: number; input: number; output: number; cacheRead: number }> {
    return this._getUsageNdays(agentId, 30);
  }

  private _getUsageNdays(agentId: AgentId, days: number): Array<{ day: string; total: number; input: number; output: number; cacheRead: number }> {
    if (!AGENTS[agentId]) return [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const buckets: Array<{ day: string; total: number; input: number; output: number; cacheRead: number }> = [];

    // Collect historical daily files
    const historical = this._loadHistoricalDays(agentId, days);

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const start = dayStart.getTime();
      const end = start + dayMs;

      // Check if this is today (partial window)
      const isToday = i === 0;

      if (isToday) {
        // Today: aggregate from in-memory tokenEvents24h
        const events = this.tokenEvents24h.get(agentId) ?? [];
        const inBucket = events.filter((e) => e.ts >= start && e.ts < Date.now());
        const sum = inBucket.reduce(
          (acc, e) => ({
            input: acc.input + e.usage.input,
            output: acc.output + e.usage.output,
            cacheRead: acc.cacheRead + e.usage.cacheRead,
          }),
          { input: 0, output: 0, cacheRead: 0 }
        );
        buckets.push({
          day: dayStart.toISOString().split('T')[0]!,
          total: sum.input + sum.output + sum.cacheRead,
          ...sum,
        });
      } else {
        // Historical: use daily file
        const dateStr = dayStart.toISOString().split('T')[0]!;
        const sum = historical.get(dateStr) ?? { input: 0, output: 0, cacheRead: 0 };
        buckets.push({
          day: dateStr,
          total: sum.input + sum.output + sum.cacheRead,
          ...sum,
        });
      }
    }
    return buckets;
  }

  private _loadHistoricalDays(agentId: AgentId, days: number): Map<string, { input: number; output: number; cacheRead: number }> {
    const result = new Map<string, { input: number; output: number; cacheRead: number }>();
    try {
      const { readFileSync, existsSync, readdirSync } = require('node:fs');
      const usageDir = `${HOME}/.heaveneye/usage`;
      if (!existsSync(usageDir)) return result;
      const files = readdirSync(usageDir).filter((f: string) => f.startsWith(`${agentId}-`) && f.endsWith('.json'));
      for (const file of files) {
        const dateStr = file.replace(`${agentId}-`, '').replace('.json', '');
        // Only load if within requested window
        const fileDate = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - fileDate.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays >= days) continue;
        const content = readFileSync(`${usageDir}/${file}`, 'utf8');
        const lines = content.trim().split('\n');
        const sum = { input: 0, output: 0, cacheRead: 0 };
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            sum.input += ev.input ?? 0;
            sum.output += ev.output ?? 0;
            sum.cacheRead += ev.cacheRead ?? 0;
          } catch { /* skip malformed lines */ }
        }
        result.set(dateStr, sum);
      }
    } catch { /* no historical data or dir not accessible */ }
    return result;
  }

  snapshot(): AgentSnapshot[] {
    return AGENT_IDS.map((id) => {
      const agent = this.agents.get(id)!;
      // Derive provider lazily so it always reflects currentModel regardless
      // of how the agent was initialized (blankSnapshot vs patch vs mock)
      return { ...agent, provider: modelToProvider(agent.currentModel ?? '') };
    });
  }

  /** Phase E2 — per-provider rollup of agent snapshots + today's token totals */
  getProviders(): Array<{ provider: string; agents: AgentId[]; tokensTodayTotal: number }> {
    const snapshots = this.snapshot();
    const map = new Map<string, { agents: AgentId[]; tokensTodayTotal: number }>();

    for (const snap of snapshots) {
      const prov = snap.provider ?? 'unknown';
      let entry = map.get(prov);
      if (!entry) {
        entry = { agents: [], tokensTodayTotal: 0 };
        map.set(prov, entry);
      }
      entry.agents.push(snap.id);
      const t = snap.tokensToday;
      entry.tokensTodayTotal += t.input + t.output + t.cacheRead + t.cacheCreate;
    }

    return Array.from(map.entries()).map(([provider, { agents, tokensTodayTotal }]) => ({
      provider,
      agents,
      tokensTodayTotal,
    }));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(agent: AgentSnapshot) {
    for (const l of this.listeners) l({ type: 'patch', agent });
  }

  private patch(id: AgentId, partial: Partial<AgentSnapshot>) {
    const cur = this.agents.get(id)!;
    // Derive provider from currentModel whenever currentModel is part of the patch
    const provider = partial.currentModel !== undefined
      ? modelToProvider(partial.currentModel)
      : cur.provider;
    const next: AgentSnapshot = { ...cur, ...partial, provider, lastEventAt: new Date().toISOString() };
    this.agents.set(id, next);
    this.emit(next);
  }

  private setStatus(id: AgentId, status: AgentStatus) {
    this.patch(id, { status });
    const existing = this.doneTimers.get(id);
    if (existing) clearTimeout(existing);
    if (status === 'done' || status === 'failed') {
      const t = setTimeout(() => {
        this.patch(id, { status: 'idle', currentTask: undefined, lastTool: undefined, blockReason: undefined });
        this.doneTimers.delete(id);
      }, DONE_LINGER_MS);
      this.doneTimers.set(id, t);
    }
    // 'blocked' stays until explicitly cleared (no linger timer)
  }

  /**
   * DEV/TEST ONLY — force an agent's status (and optionally a current-task
   * title) so liveness poses (thinking / working / away) can be triggered
   * on demand for visual QA. Gated behind /api/test/status (dev only).
   */
  debugSetStatus(id: AgentId, status: AgentStatus, taskTitle?: string, idleMinutes?: number, healthFlag?: AgentSnapshot['healthFlag']) {
    if (!AGENTS[id]) return;
    if (taskTitle !== undefined) {
      this.patch(id, { currentTask: { id: 'debug', title: taskTitle } });
    }
    if (healthFlag !== undefined) {
      // force a health flag for visual QA of E8 — on an idle agent it persists
      // (checkStuckWorkers only processes running/claimed tasks, won't clobber).
      this.patch(id, { healthFlag });
    }
    this.setStatus(id, status);
    // Backdate lastEventAt so D3 idle→away can be triggered without waiting
    // (patch() always stamps lastEventAt = now, so override it afterwards).
    if (idleMinutes !== undefined) {
      const cur = this.agents.get(id)!;
      const next: AgentSnapshot = {
        ...cur,
        lastEventAt: new Date(Date.now() - idleMinutes * 60_000).toISOString(),
      };
      this.agents.set(id, next);
      this.emit(next);
    }
  }

  // === Kanban events ===
  onKanbanActive(id: AgentId, board: string, taskId: string, taskTitle?: string) {
    if (!AGENTS[id]) return;
    const cur = this.agents.get(id)!;
    // Stale blocked state guard: if this active call refers to a different task
    // than the one that blocked, the block is no longer relevant — clear it.
    if (cur.status === 'blocked') {
      if (cur.currentTask?.id === taskId) return;
      this.patch(id, { blockReason: undefined });
    }
    this.patch(id, {
      currentBoard: board,
      currentTask: { id: taskId, title: taskTitle ?? taskId },
    });
    this.setStatus(id, 'working');
    this.lastTokenAt.set(id, Date.now());
  }

  onKanbanIdle(id: AgentId) {
    if (!AGENTS[id]) return;
    const cur = this.agents.get(id);
    if (cur?.status === 'blocked') {
      this.patch(id, { currentBoard: undefined, currentTask: undefined, blockReason: undefined });
      this.setStatus(id, 'idle');
      return;
    }
    this.patch(id, { currentBoard: undefined, currentTask: undefined });
  }

  onKanbanUnblocked(id: AgentId) {
    if (!AGENTS[id]) return;
    const cur = this.agents.get(id);
    if (cur?.status !== 'blocked') return;
    this.patch(id, { blockReason: undefined });
    this.setStatus(id, 'idle');
  }

  onKanbanBlocked(id: AgentId, reason: string, taskId: string, taskTitle: string, board: string) {
    if (!AGENTS[id]) return;
    this.patch(id, {
      currentBoard: board,
      currentTask: { id: taskId, title: taskTitle },
      blockReason: reason,
    });
    this.setStatus(id, 'blocked');
    this.lastTokenAt.set(id, Date.now());
  }

  // === Hermes hook events (heaveneye-events.jsonl) ===
  onHermesSessionStart(id: AgentId, info: { sessionId: string; taskId?: string; model?: string; ts?: string }) {
    if (!AGENTS[id]) return;
    this.patch(id, {
      currentTask: info.taskId ? { id: info.taskId } : undefined,
      currentModel: info.model,
    });
    this.setStatus(id, 'thinking');
    // Create session entry — use event timestamp from watcher, fallback to Date.now()
    const sessions = this.sessions.get(id) ?? [];
    const startTs = info.ts ? new Date(info.ts).getTime() : (() => {
      console.warn(`[engine] onHermesSessionStart(${id}) missing ts — falling back to Date.now(). ` +
        `sessionId=${info.sessionId}, taskId=${info.taskId ?? 'none'}`);
      return Date.now();
    })();
    sessions.push({ sessionId: info.sessionId, startTs, endTs: null, totalEvents: 0, totalTokens: 0 });
    this.sessions.set(id, sessions);
    this.currentSessionId.set(id, info.sessionId);
  }

  onHermesSessionEnd(id: AgentId, _sessionId: string, ts?: string) {
    if (!AGENTS[id]) return;
    this.patch(id, { currentModel: AGENTS[id].defaultModel });
    this.setStatus(id, 'done');
    // Only set endTs on the session that was actually ended — skip nested replays
    const sessions = this.sessions.get(id) ?? [];
    const entry = this.currentSessionId.get(id) === _sessionId
      ? sessions.find((s) => s.sessionId === _sessionId)
      : undefined;
    if (entry) {
      entry.endTs = ts ? new Date(ts).getTime() : Date.now();
    }
    // Only clean up currentSessionId if it still points to this session
    if (this.currentSessionId.get(id) === _sessionId) {
      this.currentSessionId.delete(id);
    }
  }

  // === Hermes status.jsonl events (legacy / supplementary) ===
  onHermesEvent(ev: { agent: string; task_id: string; event: string; payload?: any }) {
    const id = ev.agent as AgentId;
    if (!AGENTS[id]) return;

    const event = ev.event;

    // claimed / started (rare, but supported)
    if (event === 'claimed' || event === 'started') {
      this.patch(id, { currentTask: { id: ev.task_id, title: ev.payload?.title } });
      this.setStatus(id, 'thinking');
      return;
    }

    // decomposed: parent emits this with a list of children + assignees.
    // We light up every assignee with their pending task.
    if (event === 'decomposed') {
      this.patch(id, { currentTask: { id: ev.task_id, title: 'แตกงาน' } });
      this.setStatus(id, 'working');
      const children: Array<{ id?: string; title?: string; assignee?: string }> = ev.payload?.children ?? [];
      for (const child of children) {
        const cid = child.assignee as AgentId | undefined;
        if (!cid || !AGENTS[cid]) continue;
        this.patch(cid, { currentTask: { id: child.id ?? ev.task_id, title: child.title } });
        this.setStatus(cid, 'thinking');
      }
      return;
    }

    // Treat any event matching *completed* (e.g. completed, fix_completed, overlay_fix_completed)
    if (event.endsWith('completed')) {
      this.setStatus(id, 'done');
      return;
    }

    // Failure variants
    if (event === 'failed' || event.endsWith('_failed')) {
      this.setStatus(id, 'failed');
      return;
    }

    if (event === 'plan_updated') {
      this.patch(id, {});
      return;
    }
  }

  // === Claude transcript events ===
  onTokenUsage(id: AgentId, usage: TokenUsage, tool?: string, tsMs?: number) {
    if (!AGENTS[id]) return;
    const cur = this.agents.get(id)!;

    // Record rolling window events (5h + 24h)
    const model = cur.currentModel ?? 'unknown';
    const entry = { ts: tsMs ?? Date.now(), model, usage };

    // 5h window
    const events5h = this.tokenEvents.get(id) ?? [];
    events5h.push(entry);
    this.tokenEvents.set(id, events5h);

    // 24h window
    const events24h = this.tokenEvents24h.get(id) ?? [];
    events24h.push(entry);
    this.tokenEvents24h.set(id, events24h);

    // Accumulate tokens on current session
    const sid = this.currentSessionId.get(id);
    if (sid) {
      const sessions = this.sessions.get(id) ?? [];
      const sentry = sessions.find((s) => s.sessionId === sid);
      if (sentry) {
        sentry.totalTokens += (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheCreate ?? 0);
      }
    }

    // Persist to daily JSONL for 7d/30d window support
    this.writeDailyUsage(id, usage);

    const t = cur.tokensToday;
    const merged: TokenUsage = {
      input: t.input + usage.input,
      output: t.output + usage.output,
      cacheRead: t.cacheRead + usage.cacheRead,
      cacheCreate: t.cacheCreate + usage.cacheCreate,
    };
    const patch: Partial<AgentSnapshot> = { tokensToday: merged };
    if (tool) patch.lastTool = tool;
    this.patch(id, patch);
    this.lastTokenAt.set(id, Date.now());
    if (cur.status === 'idle' || cur.status === 'thinking' || cur.status === 'done') {
      this.setStatus(id, 'working');
    }
  }

  // === Mock helper for dev ===
  mock(id: AgentId, partial: Partial<AgentSnapshot>) {
    const cur = this.agents.get(id)!;
    // Preserve lastEventAt if provided in partial (don't auto-overwrite during mock)
    const withLastEvent = partial.lastEventAt !== undefined
      ? partial
      : { ...partial, lastEventAt: new Date().toISOString() };
    const next: AgentSnapshot = { ...cur, ...withLastEvent };
    this.agents.set(id, next);
    this.emit(next);
  }

  // === Inbox events ===
  onInboxEntry(entry: import('../state/types.js').InboxEntry) {
    for (const l of this.listeners) l({ type: 'inbox_append', entry });
  }

  // === Kanban event feed ===
  onKanbanEvent(entry: Omit<KanbanEventEntry, 'id'>) {
    // Deduplication: if the last buffered event has the same task_id, kind, and ts within 5 seconds, ignore it.
    // ts is ISO string (e.g. "2026-05-19T13:30:30.123Z") — must convert to ms via Date.parse().
    const last = this.kanbanBuffer[this.kanbanBuffer.length - 1];
    if (last && last.task_id === entry.task_id && last.kind === entry.kind) {
      const lastMs = new Date(last.ts).getTime();
      const entryMs = new Date(entry.ts).getTime();
      if (Number.isFinite(lastMs) && Number.isFinite(entryMs) && Math.abs(entryMs - lastMs) <= 5000) {
        // Duplicate within 5 seconds – skip adding.
        return;
      }
    }
    const e: KanbanEventEntry = { ...entry, id: ++this.eventIdCounter };
    if (this.kanbanBuffer.length >= StateEngine.KANBAN_BUFFER_CAPACITY) {
      this.kanbanBuffer.shift();
    }
    this.kanbanBuffer.push(e);
    for (const l of this.listeners) l({ type: 'kanban_event', event: e });
  }

  getKanbanEvents(limit = 50): KanbanEventEntry[] {
    const n = Math.min(limit, StateEngine.KANBAN_BUFFER_CAPACITY);
    return this.kanbanBuffer.slice(-n);
  }

  /**
   * Phase C — handoff resolution.
   *
   * When a task transitions to `completed`, figure out the next assignee so
   * the office can route the delivery walk to the right desk instead of
   * always going to anmaioyi.
   *
   * Strategy: query the board's kanban.db for any *child* tasks linked via
   * `task_links(parent_id → child_id)`. Among children, prefer one that is
   * already running/claimed (i.e. the work has already been picked up — the
   * walk should target THAT desk, because the handoff is "from upstream to
   * downstream"). Fall back to a `ready` child. If there is no child, return
   * `null` and the caller falls back to the orchestrator (anmaioyi).
   *
   * Why a method (not inline in the watcher):
   *   - Centralised so any future call site (e.g. an unblock-driven handoff)
   *     uses the same query shape.
   *   - Keeps the watcher focused on translation; resolution policy lives
   *     with the engine.
   *
   * Returns: AgentId of the next assignee, or null (fallback to anmaioyi).
   */
  resolveHandoff(board: string, parentTaskId: string): AgentId | null {
    try {
      const dbPath = join(HOME, '.hermes', 'kanban', 'boards', board, 'kanban.db');
      if (!require('node:fs').existsSync(dbPath)) return null;
      const db = new (require('bun:sqlite').Database)(dbPath, { readonly: true });
      try {
        // Prefer a child that is already active (running/claimed) — the
        // delivery walk should target the agent who has already picked the
        // work up. Fall back to `ready` (queued, not yet claimed).
        const rows = db.query(`
          SELECT t.assignee, t.status FROM task_links l
          JOIN tasks t ON t.id = l.child_id
          WHERE l.parent_id = ?
            AND t.assignee IS NOT NULL
            AND t.status IN ('running', 'claimed', 'ready', 'todo')
          ORDER BY
            CASE t.status
              WHEN 'running' THEN 0
              WHEN 'claimed' THEN 1
              WHEN 'ready'   THEN 2
              WHEN 'todo'    THEN 3
              ELSE 4
            END ASC
          LIMIT 1
        `).all(parentTaskId) as { assignee: string; status: string }[];
        if (rows.length === 0) return null;
        const assignee = rows[0]!.assignee;
        if (assignee in AGENTS) return assignee as AgentId;
        return null;
      } finally {
        db.close();
      }
    } catch (e) {
      // Non-fatal — caller will fall back to anmaioyi
      console.warn(`[engine] resolveHandoff(${board}, ${parentTaskId}) failed:`, e);
      return null;
    }
  }

  // === Notification log ===
  private notificationIdCounter = 0;
  private notificationBuffer: NotificationEntry[] = [];
  private static readonly NOTIFICATION_BUFFER_CAPACITY = 50;

  /** Write one token event to the daily JSONL file for persistence (7d+ window support) */
  private writeDailyUsage(id: AgentId, usage: TokenUsage) {
    try {
      const { appendFileSync, existsSync, mkdirSync } = require('node:fs');
      const dir = `${HOME}/.heaveneye/usage`;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const dateStr = new Date().toISOString().split('T')[0]!;
      const file = `${dir}/${id}-${dateStr}.json`;
      appendFileSync(file, JSON.stringify(usage) + '\n');
    } catch { /* non-critical — don't fail token accounting for disk errors */ }
  }

  onNotificationEntry(entry: Omit<NotificationEntry, 'id'>): void {
    const e: NotificationEntry = { ...entry, id: ++this.notificationIdCounter };
    if (this.notificationBuffer.length >= StateEngine.NOTIFICATION_BUFFER_CAPACITY) {
      this.notificationBuffer.shift();
    }
    this.notificationBuffer.push(e);
    for (const l of this.listeners) l({ type: 'notification', entry: e });
  }

  getNotifications(limit = 50): NotificationEntry[] {
    const n = Math.min(limit, StateEngine.NOTIFICATION_BUFFER_CAPACITY);
    return this.notificationBuffer.slice(-n);
  }

  // === Crash notification queue (Phase D.2) ===
  /** Phase E6 — patch healthFlag without affecting other agent fields.
   *  Call this from the kanban watcher after checking kanban run data.
   *  Pass undefined to clear the flag. */
  patchHealthFlag(id: AgentId, flag: AgentSnapshot['healthFlag']) {
    if (!AGENTS[id]) return;
    this.patch(id, { healthFlag: flag });
  }

  pushCrashNotification(entry: CrashNotificationEntry): void {
    if (this.crashNotifications.length >= StateEngine.CRASH_NOTIFICATION_MAX) {
      this.crashNotifications.shift();
    }
    this.crashNotifications.push(entry);
  }

  popCrashNotifications(since: number): CrashNotificationEntry[] {
    const pending = this.crashNotifications.filter((n) => n.ts > since);
    return pending;
  }

  // === System health ===
  private latestHealth: import('../state/types.js').SystemHealth | null = null;

  onSystemHealth(health: import('../state/types.js').SystemHealth) {
    this.latestHealth = health;
    for (const l of this.listeners) l({ type: 'system_health', health });
  }

  getSystemHealth(): import('../state/types.js').SystemHealth | null {
    return this.latestHealth;
  }

  // === Agent detail for side panel ===
  getAgentDetail(agentId: AgentId) {
    if (!AGENTS[agentId]) return null;

    // sessionTimeline: up to 10 recent sessions (ended or active)
    const sessions = this.sessions.get(agentId) ?? [];
    const sessionTimeline = sessions
      .slice(-StateEngine.MAX_SESSIONS)
      .map((s) => ({
        session_id: s.sessionId,
        start_ts: s.startTs,
        end_ts: s.endTs,
        total_events: s.totalEvents,
        total_tokens: s.totalTokens,
      }));

    // currentSession: active session (endTs === null)
    const active = sessions.find((s) => s.endTs === null) ?? null;
    const currentSession = active
      ? {
          session_id: active.sessionId,
          started_at: active.startTs,
          events_count: active.totalEvents,
          tokens_so_far: active.totalTokens,
        }
      : null;

    // toolBreakdown: from agentToolCounts (populated by onHermesToolUse calls in last 24h)
    const toolBreakdown = this.agentToolCounts.get(agentId)
      ? Array.from(this.agentToolCounts.get(agentId)!.entries()).map(([tool, count]) => ({ tool, count }))
      : [];

    return { toolBreakdown, sessionTimeline, currentSession };
  }

  /**
   * Agent timeline: merges session events, kanban events, and token usage
   * into a single chronological list (newest first).
   */
  getAgentTimeline(agentId: AgentId, limit = 30): Array<{
    ts: string;
    type: 'session_start' | 'session_end' | 'kanban_event' | 'token_usage';
    session_id?: string;
    session_tokens?: number;
    session_events?: number;
    kanban_event?: KanbanEventEntry;
    tokens?: { model: string; input: number; output: number; cacheRead: number; cacheCreate: number };
    tool_name?: string;
  }> {
    if (!AGENTS[agentId]) return [];

    const raw: Array<{ ts: number; entry: Omit<any, 'ts'> }> = [];

    // Session start/end events
    const sessions = this.sessions.get(agentId) ?? [];
    for (const s of sessions) {
      raw.push({
        ts: s.startTs,
        entry: { type: 'session_start', session_id: s.sessionId, session_tokens: s.totalTokens, session_events: s.totalEvents },
      });
      if (s.endTs) {
        raw.push({
          ts: s.endTs,
          entry: { type: 'session_end', session_id: s.sessionId, session_tokens: s.totalTokens, session_events: s.totalEvents },
        });
      }
    }

    // Kanban events for this agent
    for (const ev of this.kanbanBuffer) {
      if (ev.agent === agentId) {
        raw.push({ ts: new Date(ev.ts).getTime(), entry: { type: 'kanban_event', kanban_event: ev } });
      }
    }

    // Token usage events (24h window)
    const tokenEvents = this.tokenEvents24h.get(agentId) ?? [];
    for (const te of tokenEvents) {
      raw.push({
        ts: te.ts,
        entry: { type: 'token_usage', tokens: { model: te.model, input: te.usage.input, output: te.usage.output, cacheRead: te.usage.cacheRead, cacheCreate: te.usage.cacheCreate } },
      });
    }

    // Sort newest first
    raw.sort((a, b) => b.ts - a.ts);

    return raw.slice(0, limit).map((e) => ({ ...e.entry, ts: new Date(e.ts).toISOString() })) as Array<{
      ts: string;
      type: 'session_start' | 'session_end' | 'kanban_event' | 'token_usage';
      session_id?: string;
      session_tokens?: number;
      session_events?: number;
      kanban_event?: KanbanEventEntry;
      tokens?: { model: string; input: number; output: number; cacheRead: number; cacheCreate: number };
      tool_name?: string;
    }>;
  }

  /** Lightweight tool count tracking (populated by onHermesToolUse) */
  private agentToolCounts = new Map<AgentId, Map<string, number>>();

  onHermesToolUse(id: AgentId, toolName: string) {
    if (!AGENTS[id]) return;
    this.patch(id, { lastTool: toolName });
    this.lastTokenAt.set(id, Date.now());
    const cur = this.agents.get(id)!;
    if (cur.status === 'idle' || cur.status === 'thinking' || cur.status === 'done') {
      this.setStatus(id, 'working');
    }
    // Increment event count on current session
    const sid = this.currentSessionId.get(id);
    if (sid) {
      const sessions = this.sessions.get(id) ?? [];
      const entry = sessions.find((s) => s.sessionId === sid);
      if (entry) entry.totalEvents += 1;
    }
    // Track tool counts for breakdown
    const counts = this.agentToolCounts.get(id) ?? new Map();
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
    this.agentToolCounts.set(id, counts);
  }

  /**
   * Cross-board aggregate summary — queries kanban DBs directly.
   * Returns per-board: total tasks, done today, blocked, avg completion time (ms).
   */
  getBoardSummaries(): Array<{
    board: string;
    totalTasks: number;
    doneToday: number;
    blocked: number;
    avgCompletionMs: number | null;
  }> {
    const BOARDS_ROOT = join(HOME, '.hermes', 'kanban', 'boards');
    const result: Array<{
      board: string; totalTasks: number; doneToday: number; blocked: number; avgCompletionMs: number | null;
    }> = [];
    try {
      const { readdirSync, existsSync } = require('node:fs');
      if (!existsSync(BOARDS_ROOT)) return result;
      const nowMs = Date.now();
      const todayStart = (() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
      })();

      for (const entry of readdirSync(BOARDS_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
        const dbPath = join(BOARDS_ROOT, entry.name, 'kanban.db');
        if (!existsSync(dbPath)) continue;
        try {
          const db = new (require('bun:sqlite').Database)(dbPath, { readonly: true });

          // Total tasks (all statuses)
          const totalRow = db.query('SELECT COUNT(*) AS cnt FROM tasks').get() as { cnt: number };
          const totalTasks = totalRow.cnt;

          // Done today (completed events since today's midnight)
          const doneTodayRow = db.query(`
            SELECT COUNT(DISTINCT e.task_id) AS cnt FROM task_events e
            WHERE e.kind = 'completed'
              AND e.created_at >= ?
          `).get(todayStart / 1000) as { cnt: number };
          const doneToday = doneTodayRow.cnt;

          // Blocked (current tasks with status = 'blocked')
          const blockedRow = db.query(`
            SELECT COUNT(*) AS cnt FROM tasks WHERE status = 'blocked'
          `).get() as { cnt: number };
          const blocked = blockedRow.cnt;

          // Avg completion time: time between 'claimed' and 'completed' events on same task,
          // across all completed tasks in the last 30 days.
          const thirtyDaysAgo = (nowMs / 1000) - (30 * 24 * 60 * 60);
          const completedTasks = db.query(`
            SELECT e.task_id,
              MIN(CASE WHEN e.kind = 'claimed' THEN e.created_at END) AS claimed_at,
              MIN(CASE WHEN e.kind = 'completed' THEN e.created_at END) AS completed_at
            FROM task_events e
            WHERE e.kind IN ('claimed', 'completed')
              AND e.created_at >= ?
            GROUP BY e.task_id
            HAVING claimed_at IS NOT NULL AND completed_at IS NOT NULL
          `).all(thirtyDaysAgo) as { task_id: string; claimed_at: number; completed_at: number }[];

          let avgCompletionMs: number | null = null;
          if (completedTasks.length > 0) {
            const sumMs = completedTasks.reduce(
              (acc, t) => acc + (t.completed_at - t.claimed_at) * 1000, 0
            );
            avgCompletionMs = Math.round(sumMs / completedTasks.length);
          }

          db.close();
          result.push({ board: entry.name, totalTasks, doneToday, blocked, avgCompletionMs });
        } catch { /* skip unreadable board */ }
      }
    } catch { /* boards dir not accessible */ }
    return result;
  }
}

export const state = new StateEngine();
