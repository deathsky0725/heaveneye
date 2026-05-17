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
  blockReason?: string;
}

export type ServerEvent =
  | { type: 'snapshot'; agents: AgentSnapshot[] }
  | { type: 'patch'; agent: AgentSnapshot }
  | { type: 'inbox_append'; entry: InboxEntry }
  | { type: 'inbox_reset' };

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
