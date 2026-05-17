/**
 * Primary Hermes data source — tails ~/.hermes/heaveneye-events.jsonl
 * which is populated by the Hermes hook installed at ~/.hermes/hooks/heaveneye-hook.py
 *
 * Event schema (set by เมี่ยวอี — Hermes Lead):
 *   - session_start { session_id, profile, kanban_task, kanban_run_id, model, pid }
 *   - tool_use      { session_id, tool_name, duration_ms }
 *   - api_request   { session_id, model, tokens{input,output,cache_read,cache_create}, api_duration, finish_reason }
 *   - session_end   { session_id, end_reason ∈ {finalize, reset, end}, tokens (often null), cost }
 *
 * Known quirk: session_end tokens are usually null — derive from api_request aggregation.
 */
import chokidar from 'chokidar';
import { HEAVENEYE_EVENT_FILE, type AgentId, AGENTS } from '../config.ts';
import { state } from '../state/engine.ts';
import { JsonlTail } from './jsonl-tail.ts';

interface HermesHookEvent {
  event: 'session_start' | 'tool_use' | 'api_request' | 'session_end';
  ts: string;
  session_id: string;
  profile: string | null;
  // session_start
  kanban_task?: string | null;
  kanban_run_id?: string | null;
  model?: string | null;
  pid?: number;
  // tool_use
  tool_name?: string;
  duration_ms?: number;
  // api_request
  tokens?: {
    input?: number | null;
    output?: number | null;
    cache_read?: number | null;
    cache_create?: number | null;
  };
  api_duration?: number;
  finish_reason?: string;
  // session_end
  end_reason?: 'finalize' | 'reset' | 'end';
  cost?: number | null;
}

// session_id → profile mapping (so tool_use/api_request without `profile` can resolve)
const sessionProfile = new Map<string, AgentId>();

function resolveAgent(ev: HermesHookEvent): AgentId | undefined {
  const raw = ev.profile ?? sessionProfile.get(ev.session_id);
  if (raw && AGENTS[raw as AgentId]) return raw as AgentId;
  return undefined;
}

function handleEvent(ev: HermesHookEvent) {
  switch (ev.event) {
    case 'session_start': {
      const agent = resolveAgent(ev);
      if (!agent) return; // un-attributed session (no profile, no kanban dispatch) — ignore
      sessionProfile.set(ev.session_id, agent);
      state.onHermesSessionStart(agent, {
        sessionId: ev.session_id,
        taskId: ev.kanban_task ?? undefined,
        model: ev.model ?? undefined,
      });
      return;
    }
    case 'tool_use': {
      const agent = resolveAgent(ev);
      if (!agent || !ev.tool_name) return;
      state.onHermesToolUse(agent, ev.tool_name);
      return;
    }
    case 'api_request': {
      const agent = resolveAgent(ev);
      if (!agent) return;
      const t = ev.tokens ?? {};
      state.onTokenUsage(agent, {
        input:       t.input       ?? 0,
        output:      t.output      ?? 0,
        cacheRead:   t.cache_read  ?? 0,
        cacheCreate: t.cache_create ?? 0,
      });
      return;
    }
    case 'session_end': {
      const agent = resolveAgent(ev);
      if (!agent) return;
      state.onHermesSessionEnd(agent, ev.session_id);
      sessionProfile.delete(ev.session_id);
      return;
    }
  }
}

export async function startHermesEventWatcher(opts: { replayHistory?: boolean } = {}) {
  const tail = new JsonlTail();
  console.log(`[heaveneye-events] init — replayHistory=${opts.replayHistory}, file=${HEAVENEYE_EVENT_FILE}`);

  if (opts.replayHistory) tail.seekToBeginning(HEAVENEYE_EVENT_FILE);
  else await tail.seekToEnd(HEAVENEYE_EVENT_FILE);

  const handle = async () => {
    try {
      const lines = await tail.readNew(HEAVENEYE_EVENT_FILE);
      if (lines.length > 0) console.log(`[heaveneye-events] read ${lines.length} new line(s)`);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as HermesHookEvent;
          handleEvent(ev);
        } catch {
          // ignore malformed lines
        }
      }
    } catch (err) {
      console.warn(`[heaveneye-events] handle error:`, err);
    }
  };

  await handle();

  // Watch the single file. If it doesn't exist yet, chokidar will pick it up on 'add'.
  // (Watching the parent dir is unsafe — ~/.hermes/ contains huge subdirs like venv/, cache/, etc.)
  const watcher = chokidar.watch(HEAVENEYE_EVENT_FILE, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
    persistent: true,
    usePolling: false,
  });

  watcher.on('add', (path) => { console.log(`[heaveneye-events] file discovered: ${path}`); handle(); });
  watcher.on('change', (path) => { console.log(`[heaveneye-events] file changed: ${path}`); handle(); });
  watcher.on('error', (err) => console.warn('[heaveneye-events] watcher error:', err));

  console.log(`[heaveneye-events] watching ${HEAVENEYE_EVENT_FILE}`);
  return () => watcher.close();
}
