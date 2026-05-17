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
  | { type: 'patch'; agent: AgentSnapshot };

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
