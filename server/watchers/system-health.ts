import { spawn } from 'node:child_process';
import { AGENT_IDS, type AgentId, AGENTS } from '../config.ts';
import { state } from '../state/engine.ts';
import type { GatewayHealth, SystemHealth } from '../state/types.ts';

const POLL_INTERVAL_MS = 30_000;
const PROFILES_WITH_GATEWAY: AgentId[] = AGENT_IDS.filter(
  (id) => AGENTS[id].team === 'hermes'
);

/** When set, the next poll cycle runs immediately instead of waiting POLL_INTERVAL_MS */
let forceNextPoll = false;

/**
 * Trigger an immediate gateway health poll + SSE broadcast.
 * Call this after gateway start/stop so the frontend sees updated
 * status within ~3s instead of waiting for the next 30s poll.
 */
export function triggerGatewayRefresh(): void {
  forceNextPoll = true;
}

interface ProcInfo {
  pid: number;
  lstart: string;
}

function ps(filter: string): Promise<ProcInfo[]> {
  return new Promise((resolve) => {
    const proc = spawn('ps', ['-eo', 'pid,lstart,command']);
    let out = '';
    proc.stdout.on('data', (b) => { out += b.toString(); });
    proc.on('close', () => {
      const rows = out.split('\n').filter((l) => l.includes(filter) && !l.includes('grep'));
      const infos: ProcInfo[] = [];
      for (const row of rows) {
        const m = row.match(/^\s*(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+/);
        if (m && m[1] && m[2]) infos.push({ pid: Number(m[1]), lstart: m[2] });
      }
      resolve(infos);
    });
    proc.on('error', () => resolve([]));
  });
}

function getProcessResources(pid: number): Promise<{ cpu: number; ram: number }> {
  return new Promise((resolve) => {
    const proc = spawn('ps', ['-p', String(pid), '-o', '%cpu,rss']);
    let out = '';
    proc.stdout.on('data', (b) => { out += b.toString(); });
    proc.on('close', () => {
      const lines = out.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        resolve({ cpu: 0, ram: 0 });
        return;
      }
      const valuesLine = lines[1] ?? '';
      const parts = valuesLine.trim().split(/\s+/);
      const cpu = parseFloat(parts[0] || '0');
      const rssKb = parseInt(parts[1] || '0', 10);
      const ram = rssKb * 1024; // Convert KB to bytes
      resolve({ cpu: isNaN(cpu) ? 0 : cpu, ram: isNaN(ram) ? 0 : ram });
    });
    proc.on('error', () => resolve({ cpu: 0, ram: 0 }));
  });
}

async function checkGateway(profile: AgentId): Promise<GatewayHealth> {
  const now = new Date().toISOString();
  // Loosened filter: match any hermes mode launched with --profile <p>
  // (chat / gateway / dashboard / cron / etc.) — consistent with
  // server/lib/gateway.ts:findGatewayPid. A live dashboard session
  // counts as 'alive' the same as a gateway; "down" should mean
  // "no process for this profile at all", not "no gateway subprocess".
  const procs = await ps(`--profile ${profile}`);
  if (procs.length === 0) {
    return { profile, pid: null, startedAt: null, alive: false, lastCheckedAt: now, cpuPercent: 0, ramBytes: 0 };
  }
  const p = procs[0]!;
  const stats = await getProcessResources(p.pid);
  return {
    profile,
    pid: p.pid,
    startedAt: p.lstart,
    alive: true,
    lastCheckedAt: now,
    cpuPercent: stats.cpu,
    ramBytes: stats.ram,
  };
}

export async function startSystemHealthWatcher() {
  console.log('[system-health] starting (poll every', POLL_INTERVAL_MS / 1000, 's)');

  const poll = async () => {
    // Drain the immediate-trigger flag so this poll only fires once per trigger
    if (forceNextPoll) {
      forceNextPoll = false;
    }
    try {
      const gateways = await Promise.all(PROFILES_WITH_GATEWAY.map(checkGateway));
      const health: SystemHealth = {
        checkedAt: new Date().toISOString(),
        gateways,
      };
      state.onSystemHealth(health);
    } catch (e) {
      console.warn('[system-health] poll error:', e);
    }
  };

  // initial + interval; forceNextPoll is reset inside poll() so
  // a call to triggerGatewayRefresh() causes the next tick to fire immediately.
  let timer: ReturnType<typeof setTimeout>;
  const scheduleNext = () => {
    timer = setTimeout(async () => {
      await poll();
      // After every scheduled poll, check if an immediate refresh was requested
      if (forceNextPoll) {
        forceNextPoll = false;
        await poll();
      }
      scheduleNext();
    }, POLL_INTERVAL_MS);
  };
  await poll();
  scheduleNext();
  return () => clearTimeout(timer);
}
