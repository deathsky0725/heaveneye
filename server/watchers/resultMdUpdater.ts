/**
 * resultMdUpdater — appends structured JSON events to result.events.log when kanban events fire.
 *
 * Board slug → project path mapping:
 *   heaveneye-ui → ~/Documents/Agentic-OS/Projects/heaveneye/
 *   ytdsl-ep001  → ~/Documents/Agentic-OS/Projects/ytdsl-ep001/
 *   _other_      → ~/Documents/Agentic-OS/Projects/{slug}/ (heuristic)
 *
 * Tracked events: completed, blocked, unblocked, crashed, gave_up, timed_out
 * (NOT claimed/spawned/heartbeat — too noisy)
 *
 * Output: result.events.log (one JSON object per line, appended)
 */

import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HOME } from '../config.ts';

const RESULT_MD_MAP: Record<string, string> = {
  'heaveneye-ui': 'Documents/Agentic-OS/Projects/heaveneye/',
  'ytdsl-ep001':  'Documents/Agentic-OS/Projects/ytdsl-ep001/',
};

/** Resolve board slug → absolute result.events.log path. Returns null if not resolvable. */
export function resolveBoardResultPath(boardSlug: string): string | null {
  const rel = RESULT_MD_MAP[boardSlug];
  if (rel) {
    const abs = join(HOME, rel, 'result.events.log');
    if (existsSync(dirname(abs))) return abs;
  }
  // Heuristic: try Projects/{slug}/result.events.log
  const fallback = join(HOME, 'Documents/Agentic-OS/Projects', boardSlug, 'result.events.log');
  if (existsSync(dirname(fallback))) return fallback;
  return null;
}

export interface ResultMdEntry {
  timestamp: string;   // ISO 8601
  agent: string;
  event: string;      // completed | blocked | unblocked | crashed | gave_up | timed_out
  taskId: string;
  taskTitle: string;
  boardSlug: string;
  extra?: string;      // reason for blocked/failed
}

/** Append a JSON event line to result.events.log atomically. */
export function appendResultMdEntry(entry: ResultMdEntry): void {
  const resultPath = resolveBoardResultPath(entry.boardSlug);
  if (!resultPath) return; // silently skip unknown boards

  const jsonLine = JSON.stringify(entry) + '\n';

  try {
    // Ensure parent dir
    const dir = dirname(resultPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Create with header if file doesn't exist
    if (!existsSync(resultPath)) {
      const header = '# Heaveneye event log (auto-appended by resultMdUpdater)\n';
      writeFileSync(resultPath, header, 'utf8');
    }

    // Append the event line
    appendFileSync(resultPath, jsonLine, 'utf8');
  } catch (err) {
    console.warn('[resultMd] write error:', err);
  }
}