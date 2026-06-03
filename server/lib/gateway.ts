import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const HERMES_CLI = '/Users/ben/.local/bin/hermes';

export interface GatewayInfo {
  profile: string;
  alive: boolean;
  pid: number | null;
  startedAt: string | null;
}

/** Track running gateway processes by profile */
const processes = new Map<string, { pid: number; startedAt: Date; proc: ChildProcess }>();

/**
 * Get gateway status for a profile.
 * Checks:
 * 1. Our in-memory tracker (processes we spawned)
 * 2. `pgrep` for any hermes gateway run process matching the profile
 */
export function getGatewayStatus(profile: string): GatewayInfo {
  const tracked = processes.get(profile);

  // Check if tracked process is still alive
  if (tracked) {
    try {
      process.kill(tracked.pid, 0);
      return { profile, alive: true, pid: tracked.pid, startedAt: tracked.startedAt.toISOString() };
    } catch {
      // process dead — remove from tracker
      processes.delete(profile);
    }
  }

  // Fallback: scan with pgrep
  const pid = findGatewayPid(profile);
  if (pid !== null) {
    return { profile, alive: true, pid, startedAt: null };
  }

  return { profile, alive: false, pid: null, startedAt: null };
}

/**
 * Start gateway for a profile.
 * Spawns `hermes gateway run --profile <profile>` in background.
 */
export function startGateway(profile: string): GatewayInfo {
  // If already alive, return current status
  const current = getGatewayStatus(profile);
  if (current.alive) {
    return current;
  }

  return new Promise<GatewayInfo>((resolve, reject) => {
    const cmd = HERMES_CLI;
    const args = ['gateway', 'run', '--profile', profile];

    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let startedAt = new Date();

    proc.on('error', (err) => {
      processes.delete(profile);
      reject(new Error(`failed to spawn: ${err.message}`));
    });

    proc.on('exit', (code) => {
      processes.delete(profile);
      console.log(`[gateway] ${profile} exited with code ${code}`);
    });

    // Store in tracker
    processes.set(profile, { pid: proc.pid!, startedAt, proc });

    resolve({ profile, alive: true, pid: proc.pid!, startedAt: startedAt.toISOString() });
  }) as unknown as GatewayInfo;
}

/**
 * Stop gateway for a profile.
 * Kills the tracked process or any matching pgrep process.
 */
export function stopGateway(profile: string): GatewayInfo {
  let pid: number | null = null;

  // First try tracked process
  const tracked = processes.get(profile);
  if (tracked) {
    pid = tracked.pid;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already dead
    }
    processes.delete(profile);
  }

  // Fallback: kill any running gateway matching the profile
  if (pid === null) {
    pid = findGatewayPid(profile);
  }

  if (pid !== null) {
    try {
      process.kill(pid, 'SIGTERM');
      // Give it a moment, then SIGKILL if still alive
      setTimeout(() => {
        try {
          process.kill(pid!, 0);
          process.kill(pid!, 'SIGKILL');
        } catch {
          // process already gone
        }
      }, 3000);
    } catch {
      // already dead
    }
  }

  return { profile, alive: false, pid, startedAt: null };
}

/**
 * Find PID of a running gateway process for a given profile.
 * Uses pgrep to search for `hermes gateway run --profile <profile>`.
 */
function findGatewayPid(profile: string): number | null {
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  try {
    const out = execSync(`ps aux | grep "hermes.*gateway" | grep "${profile}" | grep -v grep`, { encoding: 'utf8' });
    const line = out.trim();
    if (!line) return null;
    // Format: "ben  29376  0.0  ..." — PID is the 2nd field (index 1 after split on whitespace)
    const parts = line.split(/\s+/);
    const pid = parseInt(parts[1] ?? '', 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}