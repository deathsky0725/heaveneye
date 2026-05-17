import { AGENTS, AGENT_IDS, type AgentId } from '../config.ts';
import type { AgentSnapshot, AgentStatus, TokenUsage, ServerEvent, KanbanEventEntry } from './types.ts';

type Listener = (event: ServerEvent) => void;

const blankUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });

/** A single token event with timestamp + model for rolling window accounting */
interface TokenEvent {
  ts: number;        // Unix ms
  model: string;     // model name (e.g. 'claude-opus-4-5')
  usage: TokenUsage;
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
    const cutoff = Date.now() - StateEngine.WINDOW_MS;
    for (const id of AGENT_IDS) {
      const events = this.tokenEvents.get(id) ?? [];
      const pruned = events.filter((e) => e.ts > cutoff);
      this.tokenEvents.set(id, pruned);
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

  snapshot(): AgentSnapshot[] {
    return AGENT_IDS.map((id) => this.agents.get(id)!);
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
    const next: AgentSnapshot = { ...cur, ...partial, lastEventAt: new Date().toISOString() };
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
      this.patch(id, { currentBoard: undefined, blockReason: undefined });
      this.setStatus(id, 'idle');
      return;
    }
    this.patch(id, { currentBoard: undefined });
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
  onHermesSessionStart(id: AgentId, info: { sessionId: string; taskId?: string; model?: string }) {
    if (!AGENTS[id]) return;
    this.patch(id, {
      currentTask: info.taskId ? { id: info.taskId } : undefined,
      currentModel: info.model,
    });
    this.setStatus(id, 'thinking');
  }

  onHermesToolUse(id: AgentId, toolName: string) {
    if (!AGENTS[id]) return;
    this.patch(id, { lastTool: toolName });
    this.lastTokenAt.set(id, Date.now());
    const cur = this.agents.get(id)!;
    if (cur.status === 'idle' || cur.status === 'thinking' || cur.status === 'done') {
      this.setStatus(id, 'working');
    }
  }

  onHermesSessionEnd(id: AgentId, _sessionId: string) {
    if (!AGENTS[id]) return;
    this.patch(id, { currentModel: AGENTS[id].defaultModel });
    this.setStatus(id, 'done');
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
  onTokenUsage(id: AgentId, usage: TokenUsage, tool?: string) {
    if (!AGENTS[id]) return;
    const cur = this.agents.get(id)!;

    // Record rolling window event (model from current session; unknown for legacy Claude watcher)
    const events = this.tokenEvents.get(id) ?? [];
    events.push({
      ts: Date.now(),
      model: cur.currentModel ?? 'unknown',
      usage,
    });
    this.tokenEvents.set(id, events);

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
    this.patch(id, partial);
  }

  // === Inbox events ===
  onInboxEntry(entry: import('../state/types.js').InboxEntry) {
    for (const l of this.listeners) l({ type: 'inbox_append', entry });
  }

  // === Kanban event feed ===
  onKanbanEvent(entry: Omit<KanbanEventEntry, 'id'>) {
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

  // === System health ===
  private latestHealth: import('../state/types.js').SystemHealth | null = null;

  onSystemHealth(health: import('../state/types.js').SystemHealth) {
    this.latestHealth = health;
    for (const l of this.listeners) l({ type: 'system_health', health });
  }

  getSystemHealth(): import('../state/types.js').SystemHealth | null {
    return this.latestHealth;
  }
}

export const state = new StateEngine();
