import chokidar from 'chokidar';
import { join } from 'node:path';
import { HOME } from '../config.ts';
import type { AgentId } from '../config.ts';
import { state } from '../state/engine.ts';
import { JsonlTail } from './jsonl-tail.ts';

const ROOT = join(HOME, '.claude', 'projects');

interface ClaudeMessageLine {
  type?: string;
  cwd?: string;
  sessionId?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: {
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    content?: any;
  };
}

// === Path-based attribution: which agent owns which files ===
const FILE_OWNER: Array<{ test: RegExp; agent: AgentId }> = [
  { test: /\b(script\.md|metadata\.ya?ml)$/i,                  agent: 'wenshu' },
  { test: /\b(overlays\.json|chapters\.txt)$/i,                agent: 'yanxin' },
  { test: /\/thumbnail\/.*\.md$/i,                             agent: 'yanxin' },
  { test: /\b(render|cut|edit)\b.*\.(mp4|mov|fcpxml|prproj)$/i, agent: 'jianfeng' },
  { test: /\.(mp4|mov|fcpxml|prproj)$/i,                       agent: 'jianfeng' },
  { test: /\/orchestration\/plan\.md$/i,                       agent: 'anmaioyi' },
  { test: /\/orchestration\/tasks\/.*\.task\.md$/i,            agent: 'anmaioyi' },
];

function inspectToolUses(content: any): { tool?: string; ownerHint?: AgentId } {
  if (!Array.isArray(content)) return {};
  let tool: string | undefined;
  let ownerHint: AgentId | undefined;
  for (const part of content) {
    if (part?.type !== 'tool_use') continue;
    if (typeof part.name === 'string') tool ??= part.name;
    const path: string | undefined = part.input?.file_path ?? part.input?.path;
    if (path) {
      for (const rule of FILE_OWNER) {
        if (rule.test.test(path)) { ownerHint = rule.agent; break; }
      }
      if (ownerHint) break;
    }
  }
  return { tool, ownerHint };
}

// sessionId → agentId cache (sticky until session idle for SESSION_TTL_MS)
const SESSION_TTL_MS = 5 * 60_000;
const sessionMap = new Map<string, { agent: AgentId; lastSeen: number }>();

function rememberSession(sessionId: string | undefined, agent: AgentId) {
  if (!sessionId) return;
  sessionMap.set(sessionId, { agent, lastSeen: Date.now() });
}
function recallSession(sessionId: string | undefined): AgentId | undefined {
  if (!sessionId) return undefined;
  const entry = sessionMap.get(sessionId);
  if (!entry) return undefined;
  if (Date.now() - entry.lastSeen > SESSION_TTL_MS) { sessionMap.delete(sessionId); return undefined; }
  entry.lastSeen = Date.now();
  return entry.agent;
}

/** Attribution for Claude Code transcripts.
 *  Hermes side now flows through ~/.hermes/heaveneye-events.jsonl (authoritative),
 *  so the Claude watcher only owns main-session attribution.
 *
 *    1. yt-deathskylife cwd → skip (Hermes hook handles these)
 *    2. isSidechain=true     → เมี่ยวอี (Plan/Agent subagent spawned by main session)
 *    3. otherwise            → จื่อเยว่ (main session)
 */
function attributeAgent(row: ClaudeMessageLine, _ownerHint: AgentId | undefined): AgentId | null {
  if (row.cwd?.includes('yt-deathskylife')) return null;
  if (row.isSidechain) return 'anmaioyi';
  return 'ziyue';
}

export async function startClaudeWatcher(opts: { replayHistory?: boolean } = {}) {
  const tails = new Map<string, JsonlTail>();
  console.log(`[claude] init — ROOT=${ROOT}, replayHistory=${opts.replayHistory}`);

  const handleLine = (line: string, file: string) => {
    let row: ClaudeMessageLine;
    try { row = JSON.parse(line); } catch { return; }
    if (row.type !== 'assistant') return;
    const usage = row.message?.usage;
    if (!usage) return;

    const { tool, ownerHint } = inspectToolUses(row.message?.content);
    const agentId = attributeAgent(row, ownerHint);
    if (!agentId) return;
    console.log(`[claude] token usage: agent=${agentId} tool=${tool ?? 'none'} session=${row.sessionId}`);
    state.onTokenUsage(
      agentId,
      {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheCreate: usage.cache_creation_input_tokens ?? 0,
      },
      tool,
    );
  };

  const processFile = async (file: string) => {
    let tail = tails.get(file);
    if (!tail) {
      tail = new JsonlTail();
      tails.set(file, tail);
      if (opts.replayHistory) tail.seekToBeginning(file);
      else await tail.seekToEnd(file);
    }
    const lines = await tail.readNew(file);
    if (lines.length > 0) console.log(`[claude] ${file}: read ${lines.length} new line(s)`);
    for (const line of lines) handleLine(line, file);
  };

  const onPath = (file: string) => {
    if (!file.endsWith('.jsonl')) return;
    console.log(`[claude] file discovered: ${file}`);
    processFile(file);
  };

  const watcher = chokidar.watch(ROOT, {
    ignoreInitial: !opts.replayHistory,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('add', onPath);
  watcher.on('change', (path) => { console.log(`[claude] file changed: ${path}`); processFile(path); });
  watcher.on('error', (err) => console.warn('[claude] watcher error:', err));

  console.log(`[claude] watching ${ROOT} (filter: *.jsonl)`);
  return () => watcher.close();
}
