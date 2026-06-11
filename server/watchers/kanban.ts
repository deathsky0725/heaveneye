/**
 * Kanban watcher — polls Hermes kanban SQLite DBs and translates task events
 * into agent state updates.
 *
 * Why: Hermes kanban-worker mode (`hermes chat -q work kanban task ...`) does
 * NOT fire the shell hook subsystem, so agents working through kanban are
 * invisible to the heaveneye-events.jsonl pipeline. This watcher closes that
 * gap by reading kanban events directly.
 *
 * Event mapping (kind → agent state):
 *   claimed      → status thinking, currentTask {id, title}
 *   spawned      → status working
 *   heartbeat    → lastTool = payload.note (truncated)
 *   completed    → status done (lingers 60s, then idle)
 *   crashed | gave_up | timed_out | blocked → status failed
 */
import { Database } from 'bun:sqlite';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, AGENTS, type AgentId } from '../config.ts';
import { state } from '../state/engine.ts';
import { appendResultMdEntry } from './resultMdUpdater.ts';
import { relayStore } from '../state/relayStore.ts';
import { recordAgentEvent } from './alertThresholds.ts';

/** Phase E6 — stuck-worker detector config */
interface StuckConfig {
  /** Minutes after last heartbeat before flagging 'stuck' (default 20) */
  stuckThresholdMin: number;
  /** Consecutive failures threshold before flagging 'crash-loop' (default 3) */
  crashLoopThreshold: number;
}
const DEFAULT_STUCK_CONFIG: StuckConfig = {
  stuckThresholdMin: 20,
  crashLoopThreshold: 3,
};

const BOARDS_ROOT = join(HOME, '.hermes/kanban/boards');
const POLL_INTERVAL_MS = 1_000;

interface KanbanEventRow {
  id: number;
  task_id: string;
  kind: string;
  payload: string | null;
  created_at: number;
  assignee: string | null;
  title: string | null;
}

interface BoardState {
  slug: string;
  db: Database;
  lastEventId: number;
}

function listBoardDbs(): { slug: string; path: string }[] {
  if (!existsSync(BOARDS_ROOT)) return [];
  const out: { slug: string; path: string }[] = [];
  for (const entry of readdirSync(BOARDS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue; // skip _archived/
    const dbPath = join(BOARDS_ROOT, entry.name, 'kanban.db');
    if (existsSync(dbPath)) out.push({ slug: entry.name, path: dbPath });
  }
  return out;
}

function isKnownAgent(name: string | null | undefined): name is AgentId {
  return !!name && name in AGENTS;
}

/** Phase D — detect QA tasks (yanxin doing QA review) */
function isQaTask(agent: AgentId, taskTitle: string): boolean {
  return agent === 'yanxin' && /qa/i.test(taskTitle);
}

/**
 * Phase D — resolve QA verdict from task_comments.
 * yanxin comments the verdict (PASS/FAIL) on the QA task when done.
 * Returns 'pass' | 'fail' | null (no verdict found yet).
 */
function resolveQaVerdict(db: Database, taskId: string): 'pass' | 'fail' | null {
  // Match yanxin's documented verdict line: "QA VERDICT: PASS|FAIL"
  // (may be prefixed with a markdown heading like "## ", so match anywhere)
  const rows = db.query(`
    SELECT body FROM task_comments
    WHERE task_id = ? AND author = 'yanxin'
    ORDER BY id DESC LIMIT 3
  `).all(taskId) as { body: string }[];
  for (const row of rows) {
    const m = (row.body ?? '').toUpperCase().match(/QA VERDICT:\s*(PASS|FAIL)/);
    if (m) return m[1] === 'PASS' ? 'pass' : 'fail';
  }
  return null;
}

function handleEvent(row: KanbanEventRow, boardSlug: string, db: Database): void {
  if (!isKnownAgent(row.assignee)) return;
  const agent = row.assignee;
  const taskTitle = row.title ?? row.task_id;
  let payload: Record<string, unknown> = {};
  if (row.payload) {
    try { payload = JSON.parse(row.payload); } catch { /* ignore */ }
  }

  switch (row.kind) {
    case 'claimed':
      recordAgentEvent(agent);
      state.onKanbanActive(agent, boardSlug, row.task_id, taskTitle);
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'claimed', task_id: row.task_id, task_title: taskTitle, payload });
      dispatchNotification(db, row.task_id, taskTitle, 'claimed', agent);
      // Phase D — emit qa_start so the frontend can show yanxin's "testing" indicator
      if (isQaTask(agent, taskTitle)) {
        state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'qa_start', task_id: row.task_id, task_title: taskTitle, payload });
      }
      return;

    case 'spawned':
      recordAgentEvent(agent);
      state.onHermesToolUse(agent, 'spawn');
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'spawned', task_id: row.task_id, task_title: taskTitle, payload });
      return;

    case 'heartbeat': {
      recordAgentEvent(agent);
      const note = typeof payload.note === 'string' ? payload.note.slice(0, 60) : 'heartbeat';
      state.onHermesToolUse(agent, note);
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'heartbeat', task_id: row.task_id, task_title: taskTitle, payload });
      return;
    }

    case 'completed':
      recordAgentEvent(agent);
      state.onKanbanIdle(agent);
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'completed', task_id: row.task_id, task_title: taskTitle, payload });
      dispatchNotification(db, row.task_id, taskTitle, 'completed', agent);
      relayStore.onRelayFired(agent, row.task_id);
      appendResultMdEntry({ timestamp: new Date().toISOString(), agent, event: 'completed', taskId: row.task_id, taskTitle, boardSlug });

      // Phase C — dependency-aware handoff.
      // Resolve the next assignee from task_links(child of this task) so the
      // office can route the delivery walk to the right desk. Emit a
      // sibling `handoff` event the frontend can listen for.
      try {
        const toAgent = state.resolveHandoff(boardSlug, row.task_id);
        // toAgent may be null → frontend falls back to anmaioyi.
        state.onKanbanEvent({
          ts: new Date().toISOString(),
          agent,
          kind: 'handoff',
          task_id: row.task_id,
          task_title: taskTitle,
          from_agent: agent,
          to_agent: toAgent,
          parent_task_id: row.task_id,
          payload: { source: 'completed' },
        });
      } catch (e) {
        console.warn(`[kanban] handoff resolve failed for ${row.task_id}:`, e);
      }

      // Phase D — emit qa_verdict when yanxin completes a QA task.
      // The verdict is read from yanxin's latest task_comment (PASS/FAIL).
      if (isQaTask(agent, taskTitle)) {
        const verdict = resolveQaVerdict(db, row.task_id);
        if (verdict) {
          state.onKanbanEvent({
            ts: new Date().toISOString(),
            agent,
            kind: 'qa_verdict',
            task_id: row.task_id,
            task_title: taskTitle,
            verdict,
            payload: { source: 'completed' },
          });
        }
      }
      return;

    case 'crashed':
    case 'gave_up':
    case 'timed_out':
      recordAgentEvent(agent);
      state.onKanbanIdle(agent);
      state.onHermesEvent({ agent, task_id: row.task_id, event: 'failed', payload });
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'blocked', task_id: row.task_id, task_title: taskTitle, payload: { reason: row.kind } });
      appendResultMdEntry({ timestamp: new Date().toISOString(), agent, event: row.kind as string, taskId: row.task_id, taskTitle, boardSlug });
      return;

    case 'blocked': {
      // Extract reason: prefer payload.reason, else fall back to latest agent comment
      let reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      if (!reason) {
        // Query latest comment by this agent on this task
        const rows = db.query(`
          SELECT body FROM task_comments
          WHERE task_id = ? AND author = ?
          ORDER BY id DESC LIMIT 1
        `).all(row.task_id, agent) as { body: string }[];
        const firstRow = rows[0];
        if (firstRow && firstRow.body) {
          const body = firstRow.body.trim();
          reason = body.length > 120 ? body.slice(0, 120) + '…' : body;
        }
      }
      if (!reason) reason = 'blocked';
      state.onKanbanBlocked(agent, reason, row.task_id, taskTitle, boardSlug);
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'blocked', task_id: row.task_id, task_title: taskTitle, payload: { reason, ...payload } });
      appendResultMdEntry({ timestamp: new Date().toISOString(), agent, event: 'blocked', taskId: row.task_id, taskTitle, boardSlug, extra: reason });
      return;
    }

    case 'unblocked':
      state.onKanbanUnblocked(agent);
      state.onKanbanEvent({ ts: new Date().toISOString(), agent, kind: 'unblocked', task_id: row.task_id, task_title: taskTitle, payload });
      appendResultMdEntry({ timestamp: new Date().toISOString(), agent, event: 'unblocked', taskId: row.task_id, taskTitle, boardSlug });
      return;
  }
}

interface NotifySub {
  platform: string;
  chat_id: string;
  thread_id: string;
  user_id: string | null;
}

function dispatchNotification(db: Database, taskId: string, taskTitle: string | undefined, eventKind: string, agent: AgentId) {
  const subs = db.query(`
    SELECT platform, chat_id, thread_id, user_id
    FROM kanban_notify_subs
    WHERE task_id = ?
  `).all(taskId) as NotifySub[];

  for (const sub of subs) {
    const embedText = buildDiscordEmbed(eventKind, agent, taskId, taskTitle);
    state.onNotificationEntry({
      ts: new Date().toISOString(),
      platform: 'discord',
      chat_id: sub.chat_id,
      thread_id: sub.thread_id || undefined,
      task_id: taskId,
      task_title: taskTitle,
      event_kind: eventKind,
      agent,
      message: embedText,
    });
  }
}

function buildDiscordEmbed(eventKind: string, agent: AgentId, taskId: string, taskTitle?: string): string {
  const agentName = AGENTS[agent]?.name ?? agent;
  const title = taskTitle ?? taskId;
  switch (eventKind) {
    case 'claimed':
      return `**${agentName}** เริ่มทำงานแล้ว → \`${title}\``;
    case 'completed':
      return `✅ **${agentName}** ทำเสร็จแล้ว → \`${title}\``;
    default:
      return `\`${eventKind}\` · **${agentName}** · \`${title}\``;
  }
}

function checkStuckWorkers(b: BoardState, config: StuckConfig = DEFAULT_STUCK_CONFIG): void {
  const now = Math.floor(Date.now() / 1000); // unix seconds
  const stuckThresholdSec = config.stuckThresholdMin * 60;

  // Query running tasks with their run data: elapsed, heartbeat, consecutive failures
  const rows = b.db.query(`
    SELECT
      t.id          AS task_id,
      t.assignee,
      t.title,
      t.consecutive_failures,
      r.started_at,
      r.last_heartbeat_at,
      r.ended_at,
      r.outcome,
      r.status      AS run_status,
      (CASE
        WHEN r.ended_at   IS NOT NULL THEN r.ended_at   - r.started_at
        WHEN r.started_at IS NOT NULL THEN ?            - r.started_at
        ELSE 0
       END)        AS elapsed_s
    FROM tasks t
    LEFT JOIN task_runs r ON r.id = t.current_run_id
    WHERE t.status IN ('running', 'claimed')
  `).all(now) as {
    task_id: string;
    assignee: string | null;
    title: string | null;
    consecutive_failures: number;
    started_at: number | null;
    last_heartbeat_at: number | null;
    ended_at: number | null;
    outcome: string | null;
    run_status: string | null;
    elapsed_s: number;
  }[];

  for (const row of rows) {
    if (!isKnownAgent(row.assignee)) continue;

    // --- crash-loop: too many consecutive failures ---
    if (row.consecutive_failures >= config.crashLoopThreshold) {
      state.patchHealthFlag(row.assignee, 'crash-loop');
      continue;
    }

    // --- iteration-exhausted: timed-out or gave_up run ---
    if (row.outcome === 'timed_out' || row.outcome === 'gave_up') {
      state.patchHealthFlag(row.assignee, 'iteration-exhausted');
      continue;
    }

    // --- stuck: elapsed > threshold AND no recent heartbeat ---
    // Only flag if we actually have run data (started_at not null).
    if (row.started_at != null) {
      const hbAge = row.last_heartbeat_at != null
        ? now - row.last_heartbeat_at
        : now - row.started_at; // fallback to start time if no heartbeat yet

      if (row.elapsed_s > stuckThresholdSec && hbAge > stuckThresholdSec) {
        state.patchHealthFlag(row.assignee, 'stuck');
        continue;
      }
    }

    // --- healthy: clear any stale flag ---
    state.patchHealthFlag(row.assignee, undefined);
  }
}

function pollBoard(b: BoardState, config?: StuckConfig): void {
  const rows = b.db.query(`
    SELECT e.id, e.task_id, e.kind, e.payload, e.created_at,
           t.assignee, t.title
    FROM task_events e
    LEFT JOIN tasks t ON t.id = e.task_id
    WHERE e.id > ?
    ORDER BY e.id ASC
    LIMIT 200
  `).all(b.lastEventId) as KanbanEventRow[];

  for (const row of rows) {
    try { handleEvent(row, b.slug, b.db); }
    catch (e) { console.warn('[kanban] handle error:', e); }
    b.lastEventId = row.id;
  }
  if (rows.length > 0) {
    console.log(`[kanban] board=${b.slug} processed ${rows.length} new event(s), lastId=${b.lastEventId}`);
  }

  // Keep-alive: any task in 'running' or 'claimed' should look active in the
  // dashboard, even if heartbeats are sparse. Tickle each running agent's
  // last-activity so the engine doesn't sweep them to idle.
  const running = b.db.query(`
    SELECT id AS task_id, assignee, title FROM tasks
    WHERE status IN ('running', 'claimed')
  `).all() as { task_id: string; assignee: string | null; title: string | null }[];
  for (const r of running) {
    if (!isKnownAgent(r.assignee)) continue;
    state.onKanbanActive(r.assignee, b.slug, r.task_id, r.title ?? r.task_id);
  }

  // Phase E6 — stuck-worker detector: evaluate health flags from kanban run data
  checkStuckWorkers(b, config);
}

export async function startKanbanWatcher(opts: { replayHistory?: boolean } = {}) {
  const boards: BoardState[] = [];
  for (const { slug, path } of listBoardDbs()) {
    let db: Database;
    try {
      // Open readonly so we never lock against Hermes writers.
      db = new Database(path, { readonly: true });
    } catch (e) {
      console.warn(`[kanban] cannot open ${path} — skipping:`, e);
      continue;
    }
    let startId = 0;
    try {
      if (!opts.replayHistory) {
        const maxRow = db.query('SELECT COALESCE(MAX(id), 0) AS m FROM task_events').get() as { m: number };
        startId = maxRow.m;
        // Seed: any task currently running/claimed should appear active
        const running = db.query(`
          SELECT id AS task_id, assignee, title, status FROM tasks
          WHERE status IN ('running', 'claimed')
        `).all() as { task_id: string; assignee: string | null; title: string | null; status: string }[];
        for (const r of running) {
          if (!isKnownAgent(r.assignee)) continue;
          state.onKanbanActive(r.assignee, slug, r.task_id, r.title ?? r.task_id);
          console.log(`[kanban] seeded running task ${r.task_id} → ${r.assignee} on board ${slug}`);
        }
      }
    } catch (e) {
      console.warn(`[kanban] initial scan failed for ${path} — skipping:`, e);
      try { db.close(); } catch {}
      continue;
    }
    boards.push({ slug, db, lastEventId: startId });
    console.log(`[kanban] watching ${path} (start id=${startId}, replay=${!!opts.replayHistory})`);
  }

  if (boards.length === 0) {
    console.log('[kanban] no boards found under', BOARDS_ROOT);
    return () => {};
  }

  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    for (const b of boards) {
      try { pollBoard(b, DEFAULT_STUCK_CONFIG); }
      catch (e) {
        if (tick === 1 || tick % 60 === 0) {
          console.warn(`[kanban] poll error board=${b.slug}:`, e);
        }
      }
    }
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    for (const b of boards) b.db.close();
  };
}
