import { spawn } from 'node:child_process';
import { AGENT_IDS, type AgentId, AGENTS } from '../config.ts';
import { state } from '../state/engine.ts';
import type { GatewayHealth, SystemHealth } from '../state/types.ts';

const POLL_INTERVAL_MS = 30_000;
const PROFILES_WITH_GATEWAY: AgentId[] = AGENT_IDS.filter(
  (id) => AGENTS[id].team === 'hermes'
);

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

async function checkGateway(profile: AgentId): Promise<GatewayHealth> {
  const now = new Date().toISOString();
  const procs = await ps(`--profile ${profile} gateway run`);
  if (procs.length === 0) {
    return { profile, pid: null, startedAt: null, alive: false, lastCheckedAt: now };
  }
  const p = procs[0]!;
  return {
    profile,
    pid: p.pid,
    startedAt: p.lstart,
    alive: true,
    lastCheckedAt: now,
  };
}

export async function startSystemHealthWatcher() {
  console.log('[system-health] starting (poll every', POLL_INTERVAL_MS / 1000, 's)');

  const poll = async () => {
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

  // initial + interval
  await poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
