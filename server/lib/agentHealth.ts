/**
 * Agent health score computation.
 *
 * Score = (uptime_hours / total_hours × 0.4)
 *       + (tasks_completed / tasks_spawned × 0.4)
 *       + (1 - error_rate × 0.2)
 *
 * Components (for tooltip breakdown):
 *   uptime_score  = uptime_hours / total_hours × 0.4   (0–0.4)
 *   completion_score = tasks_completed / tasks_spawned × 0.4  (0–0.4)
 *   error_score   = (1 - error_rate) × 0.2             (0–0.2)
 *
 * All metrics use a 24-hour rolling window anchored at query time.
 * "Uptime" here means the agent has been observed active (had a kanban event)
 * within the window — not a continuous process uptime.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, AGENTS, type AgentId } from '../config.ts';

const BOARDS_ROOT = join(HOME, '.hermes/kanban/boards');

export interface AgentHealthScore {
  agent: AgentId;
  score: number;          // 0–100 composite
  uptimeHours: number;    // hours agent was active in window
  totalHours: number;      // rolling window size (≈24)
  tasksCompleted: number;
  tasksSpawned: number;
  errorsCount: number;
  errorRate: number;       // errorsCount / tasksSpawned
  uptimeScore: number;     // component 0–0.4
  completionScore: number; // component 0–0.4
  errorScore: number;      // component 0–0.2
  windowStart: string;    // ISO8601 of window start
  windowEnd: string;      // ISO8601 of window end
}

function listBoardDbs(): { slug: string; path: string }[] {
  if (!existsSync(BOARDS_ROOT)) return [];
  const out: { slug: string; path: string }[] = [];
  for (const entry of readdirSync(BOARDS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    const dbPath = join(BOARDS_ROOT, entry.name, 'kanban.db');
    if (existsSync(dbPath)) out.push({ slug: entry.name, path: dbPath });
  }
  return out;
}

function isKnownAgent(name: string | null | undefined): name is AgentId {
  return !!name && name in AGENTS;
}

/**
 * Compute health score for one agent across all boards.
 * Uses a 24-hour rolling window.
 */
export function getAgentHealthScore(agentId: AgentId): AgentHealthScore {
  const now = Date.now();
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const windowStartMs = now - WINDOW_MS;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEnd = new Date(now).toISOString();
  const totalHours = WINDOW_MS / (1000 * 60 * 60); // 24

  // Count kanban events per agent in the 24h window
  let tasksSpawned = 0;
  let tasksCompleted = 0;
  let errorsCount = 0;
  let firstEventMs: number | null = null;
  let lastEventMs = 0;

  for (const { path } of listBoardDbs()) {
    // Dynamic import to avoid top-level side-effects
    const { Database } = require('bun:sqlite');
    let db: import('bun:sqlite').Database;
    try {
      db = new Database(path, { readonly: true });
    } catch {
      continue;
    }

    let rows: { kind: string; created_at: number }[] = [];
    try {
      rows = db.query(`
      SELECT e.kind, e.created_at
      FROM task_events e
      JOIN tasks t ON t.id = e.task_id
      WHERE t.assignee = ?
        AND e.created_at * 1000 >= ?
      ORDER BY e.created_at ASC
    `).all(agentId, Math.floor(windowStartMs / 1000)) as { kind: string; created_at: number }[];
    } catch {
      // corrupted board db — skip it
      db.close();
      continue;
    }

    for (const row of rows) {
      const tsMs = row.created_at * 1000;
      if (firstEventMs === null) firstEventMs = tsMs;
      lastEventMs = Math.max(lastEventMs, tsMs);

      switch (row.kind) {
        case 'spawned':  tasksSpawned++; break;
        case 'completed': tasksCompleted++; break;
        case 'crashed':
        case 'gave_up':
        case 'timed_out': errorsCount++; break;
      }
    }

    db.close();
  }

  // Uptime: hours between first event in window and last event (or now if active)
  const lastEventForUptime = lastEventMs > 0 ? lastEventMs : now;
  const uptimeMs = firstEventMs !== null
    ? Math.min(lastEventForUptime - firstEventMs, WINDOW_MS)
    : 0;
  const uptimeHours = uptimeMs / (1000 * 60 * 60);

  // Scores
  const clampedTotalHours = Math.max(totalHours, 0.01);
  const uptimeScore = Math.min(uptimeHours / clampedTotalHours, 1) * 0.4;

  const completionScore = tasksSpawned > 0
    ? Math.min(tasksCompleted / tasksSpawned, 1) * 0.4
    : 0;

  const errorRate = tasksSpawned > 0 ? errorsCount / tasksSpawned : 0;
  const errorScore = (1 - Math.min(errorRate, 1)) * 0.2;

  const score = Math.round((uptimeScore + completionScore + errorScore) * 100);

  return {
    agent: agentId,
    score,
    uptimeHours: Math.round(uptimeHours * 100) / 100,
    totalHours,
    tasksCompleted,
    tasksSpawned,
    errorsCount,
    errorRate: Math.round(errorRate * 100) / 100,
    uptimeScore: Math.round(uptimeScore * 1000) / 1000,
    completionScore: Math.round(completionScore * 1000) / 1000,
    errorScore: Math.round(errorScore * 1000) / 1000,
    windowStart,
    windowEnd,
  };
}