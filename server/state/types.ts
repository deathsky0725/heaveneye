import type { AgentId } from '../config.ts';

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'done' | 'failed' | 'blocked';

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

/**
 * Derive provider name from a model string.
 * Used by both BE (engine.ts) and FE (ProviderPanel) — kept in one place
 * so the mapping logic is never duplicated.
 */
export function modelToProvider(model: string): string {
  if (!model) return 'unknown';
  if (model.startsWith('MiniMax-M')) return 'minimax';
  if (model.startsWith('claude-') || model.startsWith('Claude')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'unknown';
}

export interface AgentSnapshot {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  team: 'core' | 'hermes';
  status: AgentStatus;
  currentTask?: { id: string; title?: string };
  currentBoard?: string;
  lastTool?: string;
  tokensToday: TokenUsage;
  lastEventAt?: string;
  currentModel?: string;
  /** Provider derived from currentModel — 'minimax' | 'anthropic' | 'gemini' | 'unknown' */
  provider?: string;
  blockReason?: string;
  /** Phase E6 — worker health flag derived from kanban run data.
   *  'stuck' = no heartbeat / long elapsed with no completion.
   *  'crash-loop' = consecutive_failures threshold exceeded.
   *  'iteration-exhausted' = run timed out or gave_up.
   *  undefined = healthy / idle. */
  healthFlag?: 'stuck' | 'crash-loop' | 'iteration-exhausted';
}

export type ServerEvent =
  | { type: 'snapshot'; agents: AgentSnapshot[] }
  | { type: 'patch'; agent: AgentSnapshot }
  | { type: 'inbox_append'; entry: InboxEntry }
  | { type: 'kanban_event'; event: KanbanEventEntry }
  | { type: 'notification'; entry: NotificationEntry }
  | { type: 'system_health'; health: SystemHealth };

export interface KanbanEventEntry {
  id: number;       // monotonic counter — NOT the kanban event id
  ts: string;      // ISO8601
  agent: AgentId;
  kind: 'claimed' | 'spawned' | 'completed' | 'blocked' | 'heartbeat' | 'decomposed' | 'unblocked' | 'handoff' | 'qa_start' | 'qa_verdict';
  task_id: string;
  task_title?: string;
  payload?: Record<string, any>;
  // Phase C — handoff routing. `from_agent` = the agent whose work just
  // ended. `to_agent` = the next assignee resolved from task_links (child
  // task with status=ready/running), or null when there is no downstream
  // task and the work flows back to the orchestrator (anmaioyi).
  from_agent?: AgentId;
  to_agent?: AgentId | null;
  // C3 — parent task whose completion triggered this handoff (informational)
  parent_task_id?: string;
  // Phase D — QA verdict: 'pass' | 'fail' (set on qa_verdict events)
  verdict?: 'pass' | 'fail';
}

export interface InboxEntry {
  ts: string;
  from: string;
  message: string;
  action_required: string;
  priority?: 'high' | 'normal' | 'low';
  event: string;
  task_id?: string;
}

export interface GatewayHealth {
  profile: AgentId;
  pid: number | null;
  startedAt: string | null;   // ISO8601 — process lstart
  alive: boolean;
  lastCheckedAt: string;       // ISO8601 — when this status was sampled
  cpuPercent?: number | null;
  ramBytes?: number | null;
}

export interface SystemHealth {
  checkedAt: string;
  gateways: GatewayHealth[];
}

export interface NotificationEntry {
  id: number;
  ts: string;
  platform: 'discord';
  chat_id: string;
  thread_id?: string;
  task_id: string;
  task_title?: string;
  event_kind: string;
  agent: AgentId;
  message: string;     // simulated Discord embed text
}

export interface CrashNotificationEntry {
  ts: number;    // Unix ms timestamp
  title: string;
  body: string;
}
