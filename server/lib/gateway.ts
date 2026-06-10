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
 * Find PID of a running hermes process for a given profile.
 * Matches ANY hermes mode (chat / gateway / dashboard / cron / etc.)
 * that was launched with `--profile <profile>` (or `-p <profile>`) so
 * a live chat / dashboard session counts as "alive" the same as a
 * gateway — the dashboard's "down" indicator should mean
 * "no process for this profile at all", not "no gateway subprocess".
 */
function findGatewayPid(profile: string): number | null {
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  // Two patterns joined with `|`:
  //   1. long `--profile <p>`   (e.g. `hermes ... --profile anmaioyi ...`)
  //   2. short `-p <p>`         (e.g. `hermes -p anmaioyi ...`)
  // The whole expression is anchored on word boundaries around the
  // profile name so `anmaioyi2` doesn't accidentally match `anmaioyi`.
  const pattern = `hermes[^[:space:]]*.*(--profile|-p)[[:space:]]+${profile}([[:space:]]|$)`;
  const cmd = `ps -A -o pid=,command= | grep -E '${pattern}' | grep -v 'grep' | head -1`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', shell: '/bin/sh' });
    const line = out.trim();
    if (!line) return null;
    const parts = line.split(/\s+/);
    const pid = parseInt(parts[0] ?? '', 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}