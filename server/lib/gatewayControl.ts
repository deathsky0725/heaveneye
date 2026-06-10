import { spawn } from 'node:child_process';
import { triggerGatewayRefresh } from '../watchers/system-health.ts';

/** Allow-list for gateway start/stop — everyone except ziyue (core) */
const ALLOW_LIST = new Set(['anmaioyi', 'yefan', 'shihao', 'wenshu', 'jianfeng', 'yanxin']);
const HERMES_BIN = '/Users/ben/.local/bin/hermes';

function isAllowed(id: string): boolean {
  return ALLOW_LIST.has(id);
}

function execHermes(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(HERMES_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (b) => { stdout += b.toString(); });
    proc.stderr?.on('data', (b) => { stderr += b.toString(); });
    proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

/**
 * Start a gateway via `hermes gateway start --profile <id>`.
 * Returns { ok, pid?, error? }
 */
export async function gatewayStart(id: string): Promise<{ ok: boolean; pid?: number; error?: string }> {
  if (!isAllowed(id)) {
    return { ok: false, error: 'forbidden' };
  }

  const { code, stdout, stderr } = await execHermes(['gateway', 'start', '--profile', id]);

  if (code === 0) {
    // Find pid from running process
    const { code: pgrepCode, stdout: pgrepOut } = await execHermes(['gateway', 'status', '--profile', id]);
    const pidMatch = (pgrepOut ?? '').match(/pid[=:]?\s*(\d+)/i) ?? (pgrepOut ?? '').match(/(\d{4,})/);
    const pid = pidMatch ? parseInt(String(pidMatch[1]), 10) : undefined;
    triggerGatewayRefresh();
    return { ok: true, pid };
  } else {
    return { ok: false, error: (stderr ?? '').trim() || `exit ${code}: ${(stdout ?? '').trim()}` };
  }
}

/**
 * Stop a gateway via `hermes gateway stop --profile <id>`.
 * Returns { ok, error? }
 */
export async function gatewayStop(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isAllowed(id)) {
    return { ok: false, error: 'forbidden' };
  }

  const { code, stdout, stderr } = await execHermes(['gateway', 'stop', '--profile', id]);

  if (code === 0) {
    triggerGatewayRefresh();
    return { ok: true };
  } else {
    const err = stderr.trim() || `exit ${code}: ${stdout.trim()}`;
    // "No such process" is OK — already stopped
    if (err.includes('No such process') || err.includes('not running')) {
      return { ok: true };
    }
    return { ok: false, error: err };
  }
}

/**
 * Get gateway status via `hermes gateway status --profile <id>`.
 * Returns { running: boolean, pid?: number, error?: string }
 */
export async function gatewayStatus(id: string): Promise<{ running: boolean; pid?: number; error?: string }> {
  if (!isAllowed(id)) {
    return { running: false, error: 'forbidden' };
  }

  const { code, stdout, stderr } = await execHermes(['gateway', 'status', '--profile', id]);
  if (code === 0) {
    const pidMatch = (stdout ?? '').match(/pid[=:]?\s*(\d+)/i) ?? (stdout ?? '').match(/(\d{4,})/);
    const pid = pidMatch ? parseInt(String(pidMatch[1]), 10) : undefined;
    return { running: true, pid };
  } else {
    const err = (stderr ?? '').trim() || (stdout ?? '').trim();
    if (err.includes('No such process') || err.includes('not running') || err.includes('not found')) {
      return { running: false };
    }
    return { running: false, error: err };
  }
}