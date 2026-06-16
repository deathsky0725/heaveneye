/**
 * alerts.ts — L1 Proactive Alert Engine
 *
 * Detects 4 event types, deduplicates within 10 min, throttles Discord
 * notifications to 1 per 30 s, reads enabled channels from alertConfig,
 * respects L3 RemoteAlertSettings toggles (per event-type Discord/Tauri),
 * fires Discord via webhook (server-side) and surfaces Tauri notifications
 * via a server-side queue read by the browser.
 *
 * Data sources (all from L-STEP0 verdict A):
 *   cap 80%/90%  → /api/quota → cap5hPercent, capWeeklyPercent
 *   stuck agent  → /api/agents → last_heartbeat_at (via state.snapshot())
 *   epic done     → ~/Agentic-OS/Context/anmaioyi-outbox.jsonl kind=epic_complete
 *   parked card   → kanban [PARKED] scan (already implemented in /api/autopilot)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { state } from '../state/engine.ts';
import { readAlertConfig } from './alertConfig.ts';
import { readRemoteAlertSettings, discordToggleForType, tauriToggleForType } from './remoteAlertSettings.ts';
import { fireDiscordNotification } from './discordNotifier.ts';
import { AGENT_IDS, AGENTS, HOME, type AgentId } from '../config.ts';
import type { AlertEntry, AlertSeverity } from '../state/types.ts';

// ── Constants ────────────────────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 10 * 60 * 1000;   // 10 min — same event won't re-fire
const THROTTLE_WINDOW_MS = 30 * 1000;     // 30 s — global Discord throttle
const STUCK_AGENT_THRESHOLD_MS = 25 * 60 * 1000; // 25 min heartbeat age

// ── Dedup state ─────────────────────────────────────────────────────────────

/** dedupKey → last-fired timestamp (ms) */
const dedupLog = new Map<string, number>();

// ── Throttle state ─────────────────────────────────────────────────────────

let lastDiscordFireMs = 0;

// ── Tauri notification queue ─────────────────────────────────────────────────

/** In-memory queue of pending Tauri notifications for the browser to poll */
const pendingTauriNotifications: TauriAlertEntry[] = [];
const TAURI_QUEUE_MAX = 50;

export interface TauriAlertEntry {
  ts: string;
  title: string;
  body: string;
}

/** Get and clear all pending Tauri alert entries since `since` (Unix ms) */
export function popTauriAlertEntries(since: number): TauriAlertEntry[] {
  const sinceDate = new Date(since);
  const result = pendingTauriNotifications.filter((e) => new Date(e.ts) > sinceDate);
  // Remove returned entries
  const returnedKeys = new Set(result.map((e) => e.ts + e.title));
  const remaining = pendingTauriNotifications.filter((e) => !returnedKeys.has(e.ts + e.title));
  pendingTauriNotifications.length = 0;
  pendingTauriNotifications.push(...remaining);
  return result;
}

function enqueueTauriNotification(title: string, body: string): void {
  if (pendingTauriNotifications.length >= TAURI_QUEUE_MAX) {
    pendingTauriNotifications.shift();
  }
  pendingTauriNotifications.push({ ts: new Date().toISOString(), title, body });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDedupKey(type: AlertEntry['type'], target: string): string {
  return `${type}::${target}`;
}

function isDeduped(key: string): boolean {
  const last = dedupLog.get(key);
  if (last !== undefined && Date.now() - last < DEDUP_WINDOW_MS) return true;
  dedupLog.set(key, Date.now());
  return false;
}

function canThrottleFire(): boolean {
  const now = Date.now();
  if (now - lastDiscordFireMs < THROTTLE_WINDOW_MS) return false;
  lastDiscordFireMs = now;
  return true;
}

function severityForCap(pct: number): AlertSeverity {
  return pct >= 90 ? 'critical' : 'warning';
}

// ── Notification dispatch ────────────────────────────────────────────────────

/**
 * Fire Discord webhook (server-side) and enqueue a Tauri notification
 * for the browser, if the respective channel is enabled.
 */
async function fireAlert(alert: AlertEntry): Promise<void> {
  // Check L3 RemoteAlertSettings toggles
  const settings = readRemoteAlertSettings();
  const discordKey = discordToggleForType(alert.type);
  const tauriKey = tauriToggleForType(alert.type);

  // --- Discord ---
  if (discordKey !== null) {
    const discordEnabled = settings.toggles[discordKey] ?? true;
    if (discordEnabled && canThrottleFire()) {
      // Emit SSE event
      state.onNotificationEntry({
        ts: alert.ts,
        platform: 'discord',
        chat_id: 'hermes-agent',
        task_id: alert.dedupKey,
        task_title: alert.target,
        event_kind: alert.type,
        agent: 'yefan' as AgentId,
        message: alert.message,
      });
      // Fire actual Discord webhook
      await fireDiscordNotification(alert.type, alert.severity, alert.target, alert.message, alert.ts);
    }
  }

  // --- Tauri (browser-side macOS notification) ---
  if (tauriKey !== null) {
    const tauriEnabled = settings.toggles[tauriKey] ?? false;
    if (tauriEnabled) {
      // Enqueue for browser polling
      const emoji = alert.severity === 'critical' ? '[!]' : '[i]';
      const title = `${emoji} heaveneye: ${alert.type.replace(/_/g, ' ')}`;
      enqueueTauriNotification(title, alert.message);
    }
  }
}

// ── Event detectors ────────────────────────────────────────────────────────

/**
 * Detect cap 80% / 90% events.
 * Fires once per threshold crossing (dedup handles this).
 */
function detectCapAlerts(currentAlerts: AlertEntry[]): void {
  const config = readAlertConfig();
  if (!config.enabled) return;

  // 5h window cap
  const usage5h = state.getUsage5h();
  let totalTokens5h = 0;
  for (const u of usage5h) {
    totalTokens5h += u.input + u.output + u.cacheRead + u.cacheCreate;
  }
  const CAP_5H = 2_500_000;
  const cap5hPercent = (totalTokens5h / CAP_5H) * 100;

  const targets: Array<{ type: AlertEntry['type']; pct: number; label: string }> = [
    { type: 'cap_80', pct: 80, label: '5h-window' },
    { type: 'cap_90', pct: 90, label: '5h-window' },
  ];

  for (const t of targets) {
    if (cap5hPercent >= t.pct) {
      const key = makeDedupKey(t.type, t.label);
      if (isDeduped(key)) continue;
      const severity = severityForCap(cap5hPercent);
      const entry: AlertEntry = {
        type: t.type,
        target: t.label,
        severity,
        ts: new Date().toISOString(),
        message: `⚠️  MiniMax 5h cap at ${cap5hPercent.toFixed(1)}% (${t.pct}% threshold)`,
        dedupKey: key,
      };
      currentAlerts.push(entry);
      fireAlert(entry).catch(console.warn);
    }
  }

  // Weekly cap
  let totalTokens7d = 0;
  for (const id of AGENT_IDS) {
    const buckets = state.getUsage7d(id);
    for (const b of buckets) totalTokens7d += b.total;
  }
  const CAP_WEEKLY = 10_000_000;
  const capWeeklyPercent = (totalTokens7d / CAP_WEEKLY) * 100;

  const weeklyTargets: Array<{ type: AlertEntry['type']; pct: number; label: string }> = [
    { type: 'cap_80', pct: 80, label: 'weekly' },
    { type: 'cap_90', pct: 90, label: 'weekly' },
  ];

  for (const t of weeklyTargets) {
    if (capWeeklyPercent >= t.pct) {
      const key = makeDedupKey(t.type, t.label);
      if (isDeduped(key)) continue;
      const severity = severityForCap(capWeeklyPercent);
      const entry: AlertEntry = {
        type: t.type,
        target: t.label,
        severity,
        ts: new Date().toISOString(),
        message: `⚠️  MiniMax weekly cap at ${capWeeklyPercent.toFixed(1)}% (${t.pct}% threshold)`,
        dedupKey: key,
      };
      currentAlerts.push(entry);
      fireAlert(entry).catch(console.warn);
    }
  }
}

/**
 * Detect stuck agents (>25 min since last heartbeat).
 */
function detectStuckAgents(currentAlerts: AlertEntry[]): void {
  const config = readAlertConfig();
  if (!config.enabled) return;

  const now = Date.now();
  const agents = state.snapshot();

  for (const id of AGENT_IDS) {
    const snap = agents.find((a) => a.id === id);
    if (!snap) continue;
    const lastAt = snap.lastEventAt;
    if (!lastAt) continue;

    const ageMs = now - new Date(lastAt).getTime();
    if (ageMs > STUCK_AGENT_THRESHOLD_MS) {
      const key = makeDedupKey('stuck_agent', id);
      if (isDeduped(key)) continue;

      const agentName = AGENTS[id]?.name ?? id;
      const ageMin = Math.round(ageMs / 60000);
      const entry: AlertEntry = {
        type: 'stuck_agent',
        target: agentName,
        severity: 'warning',
        ts: new Date().toISOString(),
        message: `🤖 Agent "${agentName}" stuck for ${ageMin} min (no heartbeat > 25 min)`,
        dedupKey: key,
      };
      currentAlerts.push(entry);
      fireAlert(entry).catch(console.warn);
    }
  }
}

/**
 * Detect epic done events — scan anmaioyi-outbox.jsonl for kind=epic_complete
 * entries that arrived since last check.
 */
function detectEpicDone(currentAlerts: AlertEntry[]): void {
  const config = readAlertConfig();
  if (!config.enabled) return;

  const outboxPath = join(HOME, 'Agentic-OS', 'Context', 'anmaioyi-outbox.jsonl');
  if (!existsSync(outboxPath)) return;

  try {
    const content = readFileSync(outboxPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.kind !== 'epic_complete') continue;

        const epicId: string = entry.epic ?? entry.project ?? entry.topic ?? 'unknown';
        const key = makeDedupKey('epic_done', epicId);
        if (isDeduped(key)) continue;

        const entry2: AlertEntry = {
          type: 'epic_done',
          target: epicId,
          severity: 'warning',
          ts: new Date().toISOString(),
          message: `🎉 Epic "${epicId}" marked done (CHECKPOINT 2)`,
          dedupKey: key,
        };
        currentAlerts.push(entry2);
        fireAlert(entry2).catch(console.warn);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip unreadable outbox
  }
}

/**
 * Detect [PARKED] cards — scan kanban boards for status=blocked with [PARKED] comment.
 * Already implemented in /api/autopilot — reuse the same SQL + logic.
 */
function detectParkedCards(currentAlerts: AlertEntry[]): void {
  const config = readAlertConfig();
  if (!config.enabled) return;

  const boardsRoot = join(HOME, '.hermes', 'kanban', 'boards');
  if (!existsSync(boardsRoot)) return;

  for (const entry of readdirSync(boardsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const dbPath = join(boardsRoot, entry.name, 'kanban.db');
    if (!existsSync(dbPath)) continue;
    try {
      const db = new Database(dbPath, { readonly: true });
      const parked = db.query(`
        SELECT t.id, t.title, c.body as reason
        FROM tasks t
        JOIN task_comments c ON c.task_id = t.id
        WHERE t.status = 'blocked'
          AND c.body LIKE '%[PARKED]%'
        GROUP BY t.id
      `).all() as { id: string; title: string | null; reason: string }[];
      db.close();

      for (const row of parked) {
        const key = makeDedupKey('parked_card', row.id);
        if (isDeduped(key)) continue;

        const title = row.title ?? row.id;
        const match = row.reason.match(/\[PARKED\]\s*(.*)/);
        const reason = match?.[1] ?? '';

        const entry3: AlertEntry = {
          type: 'parked_card',
          target: title,
          severity: 'warning',
          ts: new Date().toISOString(),
          message: reason
            ? `🅿️  Card [PARKED]: "${title}" — ${reason}`
            : `🅿️  Card [PARKED]: "${title}"`,
          dedupKey: key,
        };
        currentAlerts.push(entry3);
        fireAlert(entry3).catch(console.warn);
      }
    } catch {
      // skip individual board errors
    }
  }
}

// ── Main scan function ─────────────────────────────────────────────────────

/**
 * Scan all 4 event sources and return the list of triggered alerts.
 * Each alert is deduped within DEDUP_WINDOW_MS; Discord fires are
 * throttled to 1 per THROTTLE_WINDOW_MS.
 */
export function scanAlerts(): AlertEntry[] {
  const alerts: AlertEntry[] = [];
  detectCapAlerts(alerts);
  detectStuckAgents(alerts);
  detectEpicDone(alerts);
  detectParkedCards(alerts);
  return alerts;
}
