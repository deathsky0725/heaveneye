/**
 * crashDetector — watches HERMES_STATUS_PATH for status:dead events
 * and triggers crash notifications (console + Discord).
 *
 * Per-agent enable/disable is stored in:
 *   ~/.heaveneye/crash-notifications.json
 *   { "<agentId>": true | false }
 *
 * No Tauri dependency — works with plain `bun run dev:server`.
 */
import chokidar from 'chokidar';
import { HERMES_STATUS_PATH, AGENTS, HOME, type AgentId } from '../config.ts';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { JsonlTail } from '../watchers/jsonl-tail.ts';

interface CrashConfig {
  [agentId: string]: boolean;
}

const CONFIG_PATH = join(HOME, '.heaveneye', 'crash-notifications.json');

function loadConfig(): CrashConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  // Default: all agents have notifications enabled
  const default_: CrashConfig = {};
  for (const id of Object.keys(AGENTS) as AgentId[]) {
    default_[id] = true;
  }
  return default_;
}

function saveConfig(config: CrashConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.warn('[crashDetector] failed to save config:', e);
  }
}

export function isNotificationEnabled(agentId: AgentId): boolean {
  return loadConfig()[agentId] ?? true;
}

export function setNotificationEnabled(agentId: AgentId, enabled: boolean): void {
  const config = loadConfig();
  config[agentId] = enabled;
  saveConfig(config);
}

export function getCrashNotificationConfig(): CrashConfig {
  return loadConfig();
}

/**
 * Notify crash to console.
 */
function notifyCrash(agentName: string, agentId: string): void {
  const msg = `[crashDetector] 💥 ${agentName} died`;
  console.error(msg);
}

interface StatusLine {
  agent: string;
  status: string;
  [key: string]: unknown;
}

export async function startCrashDetector(): Promise<() => void> {
  const tail = new JsonlTail();
  console.log(`[crashDetector] init — watching ${HERMES_STATUS_PATH}`);

  // If file exists, start from end (only watch new events)
  await tail.seekToEnd(HERMES_STATUS_PATH);

  const handle = async () => {
    try {
      const lines = await tail.readNew(HERMES_STATUS_PATH);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as StatusLine;
          if (ev.status === 'dead' && ev.agent) {
            const agentId = ev.agent as AgentId;
            if (!AGENTS[agentId]) continue;
            if (!isNotificationEnabled(agentId)) continue;

            const agentName = AGENTS[agentId]?.name ?? agentId;
            notifyCrash(agentName, agentId);
          }
        } catch {
          // ignore malformed lines
        }
      }
    } catch (err) {
      console.warn('[crashDetector] handle error:', err);
    }
  };

  await handle();

  // If file doesn't exist yet, chokidar will pick it up on 'add'
  const watcher = chokidar.watch(HERMES_STATUS_PATH, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 40 },
    persistent: true,
    usePolling: false,
  });

  watcher.on('add', (path) => { console.log(`[crashDetector] file discovered: ${path}`); handle(); });
  watcher.on('change', (path) => { console.log(`[crashDetector] file changed: ${path}`); handle(); });
  watcher.on('error', (err) => console.warn('[crashDetector] watcher error:', err));

  console.log(`[crashDetector] watching ${HERMES_STATUS_PATH}`);
  return () => watcher.close();
}