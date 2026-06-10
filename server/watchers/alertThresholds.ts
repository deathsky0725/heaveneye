/**
 * alertThresholds.ts — configurable alert threshold checker
 *
 * Checks RAM usage, blocked-task age, and agent inactivity every 30s.
 * When a threshold is breached, fires a notification via state.onNotificationEntry().
 * The notification flows into the SSE stream → DiscordPanel.
 *
 * Config: ~/.heaveneye/alert-config.json
 */

import { Database } from 'bun:sqlite';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { state } from '../state/engine.ts';
import { readAlertConfig } from '../lib/alertConfig.ts';
import { AGENT_IDS, AGENTS, type AgentId } from '../config.ts';
import { HOME } from '../config.ts';

const POLL_INTERVAL_MS = 30_000;

/** Map from agentId → last event timestamp (ms) for inactivity detection */
const lastEventAt = new Map<AgentId, number>();

/** Set of agentIds currently in breach state (to avoid repeated notifications) */
const inBreach = new Set<AgentId>();

/** Remembered last-known RAM so we only fire on the transition upward */
let lastRamBreach = false;

/** Keep-alive: track blocked tasks we've already alerted on (taskId → alreadyAlerted) */
const blockedTaskAlerted = new Map<string, true>();

/** Set of agentIds currently in token burn rate breach state */
const inBurnBreach = new Set<AgentId>();

function getSystemRamBytes(): number {
  // macOS: sysctl hw.memsize
  try {
    const { execSync } = require('node:child_process');
    const out = execSync('sysctl -n hw.memsize', { encoding: 'utf8' });
    return parseInt(out.trim(), 10);
  } catch {
    // Fallback: use os.totalmem() from Node
    try {
      const { totalmem } = require('node:os');
      return totalmem();
    } catch {
      return 0;
    }
  }
}

function getUsedRamBytes(): number {
  // macOS: vm_stat + pagesize gives free + active + inactive + wired
  // Simpler: use os.freemem() and subtract from total
  try {
    const { freemem, totalmem } = require('node:os');
    return totalmem() - freemem();
  } catch {
    return 0;
  }
}

async function checkThresholds(): Promise<void> {
  const config = readAlertConfig();
  if (!config.enabled) return;

  const now = Date.now();
  const { thresholds } = config;

  // --- RAM check ---
  const usedRam = getUsedRamBytes();
  const ramBreach = usedRam > thresholds.ramBytes;
  if (ramBreach && !lastRamBreach) {
    const usedGB = (usedRam / (1024 ** 3)).toFixed(1);
    const limitGB = (thresholds.ramBytes / (1024 ** 3)).toFixed(1);
    state.onNotificationEntry({
      ts: new Date().toISOString(),
      platform: 'discord',
      chat_id: 'alert-thresholds',
      task_id: 'alert-thresholds',
      task_title: undefined,
      event_kind: 'ram_breach',
      agent: 'shihao' as AgentId,
      message: `🚨 RAM breach: using ${usedGB} GB (limit ${limitGB} GB)`,
    });
    // Also push a crash notification so the frontend dispatches a macOS notification
    state.pushCrashNotification({
      ts: Date.now(),
      title: 'RAM Alert',
      body: `System RAM usage (${usedGB} GB) exceeds limit (${limitGB} GB)`,
    });
  }
  lastRamBreach = ramBreach;

  // --- Inactivity check ---
  for (const id of AGENT_IDS) {
    const last = lastEventAt.get(id) ?? 0;
    const inactive = (now - last) > thresholds.inactivityTimeoutMs;
    if (inactive && !inBreach.has(id)) {
      const agentName = AGENTS[id]?.name ?? id;
      state.onNotificationEntry({
        ts: new Date().toISOString(),
        platform: 'discord',
        chat_id: 'alert-thresholds',
        task_id: 'alert-thresholds',
        task_title: undefined,
        event_kind: 'inactivity_timeout',
        agent: id,
        message: `⏰ Agent "${agentName}" inactive for > ${Math.round(thresholds.inactivityTimeoutMs / 60000)} min`,
      });
      inBreach.add(id);
      // Also push a crash notification so the frontend dispatches a macOS notification
      state.pushCrashNotification({
        ts: Date.now(),
        title: 'Agent Inactivity Alert',
        body: `Agent "${agentName}" has been inactive for more than ${Math.round(thresholds.inactivityTimeoutMs / 60000)} minutes`,
      });
    } else if (!inactive && inBreach.has(id)) {
      inBreach.delete(id);
    }
  }

  // --- Blocked task age check ---
  const BOARDS_ROOT = join(HOME, '.hermes/kanban/boards');
  if (existsSync(BOARDS_ROOT)) {
    const now = Date.now();
    for (const entry of readdirSync(BOARDS_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const dbPath = join(BOARDS_ROOT, entry.name, 'kanban.db');
      if (!existsSync(dbPath)) continue;
      try {
        const db = new Database(dbPath, { readonly: true });
        const rows = db.query(`
          SELECT t.id AS task_id, t.title, t.status, t.created_at
          FROM tasks t
          WHERE t.status = 'blocked'
        `).all() as { task_id: string; title: string | null; status: string; created_at: number }[];
        db.close();
        for (const task of rows) {
          const age = now - task.created_at;
          if (age > thresholds.blockedTaskAgeMs && !blockedTaskAlerted.has(task.task_id)) {
            const title = task.title ?? task.task_id;
            state.onNotificationEntry({
              ts: new Date().toISOString(),
              platform: 'discord',
              chat_id: 'alert-thresholds',
              task_id: task.task_id,
              task_title: title,
              event_kind: 'blocked_task_age',
              agent: 'shihao' as AgentId,
              message: `⏰ Blocked task \`${title}\` (${entry.name}) has been stuck for ${Math.round(age / 60000)} min`,
            });
            blockedTaskAlerted.set(task.task_id, true);
            // Also push a crash notification so the frontend dispatches a macOS notification
            state.pushCrashNotification({
              ts: Date.now(),
              title: 'Blocked Task Alert',
              body: `Task "${title}" on board "${entry.name}" has been blocked for more than ${Math.round(age / 60000)} minutes`,
            });
          }
          if (age <= thresholds.blockedTaskAgeMs && blockedTaskAlerted.has(task.task_id)) {
            blockedTaskAlerted.delete(task.task_id);
          }
        }
      } catch {
        // Non-critical — skip this board on error
      }
    }
  }

  // --- Token burn rate check ---
  for (const id of AGENT_IDS) {
    const tokensLastMin = state.getUsageLastMinute(id);
    const limit = thresholds.burnRateLimitTokensPerMin || 50000;
    const isBurnBreached = tokensLastMin > limit;
    if (isBurnBreached && !inBurnBreach.has(id)) {
      const agentName = AGENTS[id]?.name ?? id;
      state.onNotificationEntry({
        ts: new Date().toISOString(),
        platform: 'discord',
        chat_id: 'alert-thresholds',
        task_id: 'alert-thresholds',
        task_title: undefined,
        event_kind: 'burn_rate_breach',
        agent: id,
        message: `🚨 Burn Rate Alert: Agent "${agentName}" consumed ${tokensLastMin.toLocaleString()} tokens in 1 minute (limit ${limit.toLocaleString()} tokens/min)`,
      });
      inBurnBreach.add(id);
      // Also push a crash notification so the frontend dispatches a macOS notification
      state.pushCrashNotification({
        ts: Date.now(),
        title: 'Token Burn Rate Alert',
        body: `Agent "${agentName}" token consumption is at ${tokensLastMin.toLocaleString()} tokens/min (limit ${limit.toLocaleString()})`,
      });
    } else if (!isBurnBreached && inBurnBreach.has(id)) {
      inBurnBreach.delete(id);
    }
  }
}

export function recordAgentEvent(id: AgentId): void {
  lastEventAt.set(id, Date.now());
}

export async function startAlertThresholds(): Promise<() => void> {
  // Seed lastEventAt with current time for all agents
  for (const id of AGENT_IDS) {
    lastEventAt.set(id, Date.now());
  }

  console.log('[alert-thresholds] starting (poll every', POLL_INTERVAL_MS / 1000, 's)');

  // Initial check
  await checkThresholds();

  const timer = setInterval(checkThresholds, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}