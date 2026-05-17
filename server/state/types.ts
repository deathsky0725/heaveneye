import type { AgentId } from '../config.ts';

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
  blockReason?: string;
}

export type ServerEvent =
  | { type: 'snapshot'; agents: AgentSnapshot[] }
  | { type: 'patch'; agent: AgentSnapshot }
  | { type: 'inbox_append'; entry: InboxEntry }
  | { type: 'kanban_event'; event: KanbanEventEntry }
  | { type: 'system_health'; health: SystemHealth };

export interface KanbanEventEntry {
  id: number;       // monotonic counter — NOT the kanban event id
  ts: string;      // ISO8601
  agent: AgentId;
  kind: 'claimed' | 'spawned' | 'completed' | 'blocked' | 'heartbeat' | 'decomposed' | 'unblocked';
  task_id: string;
  task_title?: string;
  payload?: Record<string, any>;
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
}

export interface SystemHealth {
  checkedAt: string;
  gateways: GatewayHealth[];
}
