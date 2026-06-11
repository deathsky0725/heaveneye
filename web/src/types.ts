export type AgentId = 'ziyue' | 'anmaioyi' | 'wenshu' | 'yanxin' | 'jianfeng' | 'shihao' | 'yefan';
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'done' | 'failed' | 'blocked';

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
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
}

export interface KanbanEventEntry {
  id: number;
  ts: string;
  agent: AgentId;
  // C3 — 'handoff' fires when a task completes and the engine resolves
  // a downstream assignee via task_links. `from_agent` = the completing
  // agent, `to_agent` = the next assignee (or null → fallback anmaioyi).
  kind: 'claimed' | 'spawned' | 'completed' | 'blocked' | 'heartbeat' | 'decomposed' | 'unblocked' | 'handoff' | 'qa_start' | 'qa_verdict';
  task_id: string;
  task_title?: string;
  payload?: Record<string, unknown>;
  from_agent?: AgentId;
  to_agent?: AgentId | null;
  parent_task_id?: string;
  // Phase D — QA verdict: 'pass' | 'fail' (set on qa_verdict events)
  verdict?: 'pass' | 'fail';
}

export type ServerEvent =
  | { type: 'snapshot'; agents: AgentSnapshot[] }
  | { type: 'patch'; agent: AgentSnapshot }
  | { type: 'inbox_append'; entry: InboxEntry }
  | { type: 'inbox_reset' }
  | { type: 'kanban_event'; event: KanbanEventEntry }
  | { type: 'system_health'; health: SystemHealth }
  | { type: 'notification'; entry: NotificationEntry }
  | { type: 'agent_activity'; agentId: AgentId; event: 'message' | 'task_done' | 'error' };

export interface Usage5hEntry {
  agent: AgentId;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  windowStartedAt: number | null;
  nextResetAt: number | null;
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'normal';

/**
 * Canonical schema — must match Context/INBOX_PROTOCOL.md
 * Hermes profiles append JSONL entries with these fields.
 */
export interface InboxEntry {
  ts: string;              // ISO-8601 (canonical name, not `timestamp`)
  from: string;            // profile slug or 'system' or 'ji-ziyue'
  event?: string;          // e.g. 'completion', 'block_handoff', 'inbox_init', 'processed'
  priority?: Priority;     // default 'medium' when missing (handled in UI)
  message: string;
  action_required?: string; // free-text describing what ji-ziyue should do (only present on actionable entries)
  task_id?: string;        // kanban task reference
  refs?: string[];         // for 'processed' entries — task_ids closed
  /** UI-only synthetic id (composite ts+from) — never sent by backend */
  _key?: string;
}

export type InboxEvent = { type: 'inbox_append'; entry: InboxEntry } | { type: 'inbox_reset' };

export interface GatewayHealth {
  profile: AgentId;
  pid: number | null;
  startedAt: string | null;
  alive: boolean;
  lastCheckedAt: string;
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
  message: string;
}

export interface RelayStatus {
  hasPendingReport: boolean;
  lastRelayTime: string | null;
  relayCount: number;
}

// ── Dependency DAG (Phase A.1) ──────────────────────────────────────────────

export interface DagNode {
  id: string;
  title: string;
  status: string;
  priority: number;
  blockedBy: string[];
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  consecutiveFailures: number;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface DagApiResponse {
  nodes: DagNode[];
  edges: DagEdge[];
  meta: {
    totalTasks: number;
    doneCount: number;
    runningCount: number;
    blockedCount: number;
    stuckCount: number;
  };
}

// ── Cost Estimation ─────────────────────────────────────────────────────

export interface CostAgentEntry {
  agent: AgentId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costToday: number;
  cost7d: number;
}

export interface CostAggregate {
  costToday: number;
  costWeek: number;
  trend7d: number[];
}

export interface CostApiResponse {
  agents: CostAgentEntry[];
  aggregate: CostAggregate;
}

// ── Crash Notifications (Phase D.2) ────────────────────────────────────────

export interface CrashNotificationEntry {
  ts: number;
  title: string;
  body: string;
}
