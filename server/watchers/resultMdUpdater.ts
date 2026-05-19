/**
 * resultMdUpdater — appends structured entries to result.md when kanban events fire.
 *
 * Board slug → result.md path mapping:
 *   heaveneye-ui → ~/Documents/Agentic-OS/Projects/heaveneye/result.md
 *   ytdsl-ep001  → ~/Documents/Agentic-OS/Projects/ytdsl-ep001/result.md
 *   _other_      → ~/Documents/Agentic-OS/Projects/{slug}/result.md (heuristic)
 *
 * Tracked events: completed, blocked, unblocked, crashed, gave_up, timed_out
 * (NOT claimed/spawned/heartbeat — too noisy)
 */

import { existsSync, mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { HOME } from '../config.ts';

const RESULT_MD_MAP: Record<string, string> = {
  'heaveneye-ui': 'Documents/Agentic-OS/Projects/heaveneye/result.md',
  'ytdsl-ep001':  'Documents/Agentic-OS/Projects/ytdsl-ep001/result.md',
};

/** Resolve board slug → absolute result.md path. Returns null if not resolvable. */
export function resolveBoardResultPath(boardSlug: string): string | null {
  const rel = RESULT_MD_MAP[boardSlug];
  if (rel) {
    const abs = join(HOME, rel);
    if (existsSync(dirname(abs))) return abs;
  }
  // Heuristic: try Projects/{slug}/result.md
  const fallback = join(HOME, 'Documents/Agentic-OS/Projects', boardSlug, 'result.md');
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

/** Format a single result.md entry block */
function formatEntry(entry: ResultMdEntry): string {
  const ts = entry.timestamp;
  const agentName = entry.agent;
  const event = entry.event;
  const title = entry.taskTitle;
  const tid = entry.taskId;
  const board = entry.boardSlug;
  const extra = entry.extra ? `\n  - Reason: ${entry.extra}` : '';

  return `## [${ts}] ${agentName} ${event} → ${title} [${tid}]

  - Status: ${event}
  - Task: ${title} (${tid})
  - Board: ${board}${extra}
`;
}

/** Append an entry to result.md atomically (write to temp + rename). */
export function appendResultMdEntry(entry: ResultMdEntry): void {
  const resultPath = resolveBoardResultPath(entry.boardSlug);
  if (!resultPath) return; // silently skip unknown boards

  const block = formatEntry(entry);

  try {
    // Ensure parent dir
    const dir = dirname(resultPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Atomic write: temp file → rename
    const tmp = resultPath + `.tmp.${Date.now()}`;

    if (existsSync(resultPath)) {
      // Read existing; find the first `---` that closes the YAML front-matter block
      // (i.e. the second `---` on its own line). Insert new block after it.
      const existing = readFileSync(resultPath, 'utf8');
      const firstDoubleDash = existing.indexOf('\n---');
      if (firstDoubleDash >= 0) {
        // Find the closing `---` (must be on its own line, not part of a code fence)
        let closeIdx = -1;
        let searchFrom = firstDoubleDash + 5;
        while (searchFrom < existing.length) {
          const nextDash = existing.indexOf('\n---', searchFrom);
          if (nextDash < 0) break;
          // Ensure the line before is not indented (code fence would be)
          const lineStart = existing.lastIndexOf('\n', nextDash);
          const prevChar = lineStart >= 0 ? existing[lineStart - 1] : '';
          if (prevChar !== '`') {
            closeIdx = nextDash;
            break;
          }
          searchFrom = nextDash + 5;
        }

        if (closeIdx > 0) {
          const insertAt = closeIdx + 5;
          const newContent = existing.slice(0, insertAt) + block + '\n' + existing.slice(insertAt);
          writeFileSync(tmp, newContent, 'utf8');
          renameSync(tmp, resultPath);
          return;
        }
      }
      // No front-matter found: just append to existing content
      const newContent = existing + '\n' + block;
      writeFileSync(tmp, newContent, 'utf8');
      renameSync(tmp, resultPath);
    } else {
      // New file: write block directly
      writeFileSync(tmp, block, 'utf8');
      renameSync(tmp, resultPath);
    }
  } catch (err) {
    console.warn('[resultMd] write error:', err);
  }
}