import { homedir } from 'node:os';
import { join } from 'node:path';

// If running inside a profile home (~ = ~/.hermes/profiles/<profile>/home),
// use the real user home for user-level paths. Otherwise use standard homedir().
const REAL_HOME = process.env.HERMES_HOME
  ? join(process.env.HERMES_HOME, '..', '..', '..')
  : homedir();

export const PORT = 7878;

export const HOME = REAL_HOME;

export const HERMES_STATUS_PATH = join(
  HOME,
  'Documents/Agentic-OS/Projects/yt-deathskylife/orchestration/status.jsonl'
);

export const HEAVENEYE_EVENT_FILE = process.env.HEAVENEYE_EVENT_FILE
  ?? join(HOME, '.hermes', 'heaveneye-events.jsonl');

export const INBOX_PATH = join(
  HOME,
  'Documents/Agentic-OS/Context/ji-ziyue-inbox.jsonl'
);

export const INBOX_STATUS_PATH = join(
  HOME,
  'Documents/Agentic-OS/Context/status.jsonl'
);

export const CLAUDE_PROJECTS_ROOT = join(HOME, '.claude', 'projects');

export type AgentId = 'ziyue' | 'anmaioyi' | 'wenshu' | 'yanxin' | 'jianfeng' | 'shihao' | 'yefan';

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  team: 'core' | 'hermes';
  defaultModel: string;
}

export const AGENTS: Record<AgentId, AgentProfile> = {
  ziyue:    { id: 'ziyue',    name: 'จื่อเยว่',    role: 'เลขาส่วนตัว',    color: '#f9a8d4', team: 'core',   defaultModel: 'Claude Opus 4.7' },
  anmaioyi: { id: 'anmaioyi', name: 'เมี่ยวอี',   role: 'Hermes Lead',     color: '#c4b5fd', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
  wenshu:   { id: 'wenshu',   name: 'เหวินซู',    role: 'Script + SEO',    color: '#7dd3fc', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
  yanxin:   { id: 'yanxin',   name: 'เหยียนซิน',  role: 'Copy & Overlays', color: '#fdba74', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
  jianfeng: { id: 'jianfeng', name: 'เจี้ยนเฟิง', role: 'Edit & Render',   color: '#86efac', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
  shihao:   { id: 'shihao',   name: 'สือฮ่าว',    role: 'Frontend Dev',    color: '#fde68a', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
  yefan:    { id: 'yefan',    name: 'เย่ฝาน',     role: 'Backend Dev',     color: '#a5b4fc', team: 'hermes', defaultModel: 'MiniMax-M2.7' },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];
