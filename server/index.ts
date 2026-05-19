import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { spawn } from 'node:child_process';
import { PORT, AGENT_IDS, AGENTS, type AgentId } from './config.ts';
import { state } from './state/engine.ts';
import { relayStore } from './state/relayStore.ts';
import type { ServerEvent } from './state/types.ts';
import { startHermesWatcher } from './watchers/hermes.ts';
import { startHermesEventWatcher } from './watchers/hermes-events.ts';
import { startClaudeWatcher } from './watchers/claude.ts';
import { startKanbanWatcher } from './watchers/kanban.ts';
import { startInboxWatcher } from './watchers/inbox.ts';
import { startSystemHealthWatcher } from './watchers/system-health.ts';
import { startRelayCron } from './watchers/relayCron.ts';
import { INBOX_PATH } from './config.ts';

const app = new Hono();
app.use('*', cors());

app.get('/api/health', (c) => c.json(state.getSystemHealth() ?? { checkedAt: new Date().toISOString(), gateways: [] }));

app.get('/api/agents', (c) => c.json({ agents: state.snapshot() }));

app.get('/api/usage/5h', (c) => c.json({ usage: state.getUsage5h() }));

app.get('/api/usage/24h', (c) => {
  const agent = c.req.query('agent');
  if (!agent || !AGENT_IDS.includes(agent as any)) {
    return c.json({ error: 'missing or invalid agent query param' }, 400);
  }
  return c.json({ agent, buckets: state.getUsage24h(agent as any) });
});

app.get('/api/inbox', async (c) => {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(INBOX_PATH, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    const entries = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .slice(-20);
    return c.json(entries);
  } catch {
    return c.json([]);
  }
});

app.get('/api/events', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  return c.json({ events: state.getKanbanEvents(limit) });
});

app.get('/api/notifications', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 50);
  return c.json(state.getNotifications(limit));
});

app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    const initial: ServerEvent = { type: 'snapshot', agents: state.snapshot() };
    await stream.writeSSE({ data: JSON.stringify(initial) });

    const unsub = state.subscribe(async (ev) => {
      try {
        await stream.writeSSE({ data: JSON.stringify(ev) });
      } catch {
        unsub();
      }
    });

    stream.onAbort(() => unsub());

    while (!stream.aborted) {
      await stream.sleep(15_000);
      await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  })
);

app.post('/api/agent/:id/kill', async (c) => {
  const id = c.req.param('id') as AgentId;

  // Validate: must be a hermes team agent (not ziyue)
  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  if (AGENTS[id].team === 'core') {
    return c.json({ error: 'cannot kill core team agent' }, 403);
  }

  // Find worker PID matching how system-health.ts discovers agents
  const findPid = (): Promise<number | null> => {
    return new Promise((resolve) => {
      const proc = spawn('pgrep', ['-f', `profile ${id}.*kanban-worker`]);
      let out = '';
      proc.stdout.on('data', (b) => { out += b.toString(); });
      proc.on('close', (code) => {
        if (code !== 0 || !out.trim()) { resolve(null); return; }
        const pid = parseInt(out.trim().split('\n')[0]!, 10);
        resolve(isNaN(pid) ? null : pid);
      });
      proc.on('error', () => resolve(null));
    });
  };

  const pid = await findPid();
  if (!pid) {
    return c.json({ killed: false, pid: null, signal: 'none' as const });
  }

  // SIGTERM
  process.kill(pid, 'SIGTERM');
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  // Check if still alive → SIGKILL
  let signal: 'TERM' | 'KILL' | 'none' = 'TERM';
  try {
    process.kill(pid, 0); // signal 0 = check alive
    process.kill(pid, 'SIGKILL');
    signal = 'KILL';
  } catch {
    // process already dead
    signal = 'TERM';
  }

  // Clear blockReason via onKanbanIdle pattern
  state.onKanbanIdle(id);

  return c.json({ killed: true, pid, signal });
});

app.get('/api/agent/:id/detail', (c) => {
  const id = c.req.param('id') as AgentId;
  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  return c.json(state.getAgentDetail(id));
});

app.get('/api/agent/:id/timeline', (c) => {
  const id = c.req.param('id') as AgentId;
  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  const limit = Math.min(Number(c.req.query('limit') ?? 30), 100);
  return c.json({ agent: id, timeline: state.getAgentTimeline(id, limit) });
});

app.get('/api/agent/:id/relay-status', (c) => {
  const id = c.req.param('id') as AgentId;
  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  return c.json({ agent: id, ...relayStore.getStatus(id) });
});

// ---- Mock data driver (only when HEAVENEYE_MOCK=1) ----
if (process.env.HEAVENEYE_MOCK === '1') {
  console.log('[heaveneye] MOCK MODE enabled — no real data sources');
  // lastEventAt starts 25 min ago for first scene (triggers stuck alert on working agents)
  let sceneMs = 25 * 60 * 1000;
  const scenes = [
    () => { sceneMs = 25 * 60 * 1000; state.mock('ziyue',    { status: 'working',  currentTask: { id: 't_demo', title: 'รับคำสั่งจากพี่เบญ' }, lastTool: 'Write', lastEventAt: new Date(Date.now() - sceneMs).toISOString() }); },
    () => { sceneMs = 8 * 60 * 1000; state.mock('anmaioyi', { status: 'thinking', currentTask: { id: 't_demo2', title: 'แตกงาน EP002' }, lastEventAt: new Date(Date.now() - sceneMs).toISOString() }); },
    () => { sceneMs = 15 * 60 * 1000; state.mock('wenshu',   { status: 'working',  currentTask: { id: 't_w1', title: 'เขียน script' }, lastTool: 'Edit', lastEventAt: new Date(Date.now() - sceneMs).toISOString() }); },
    () => { sceneMs = 6 * 60 * 1000; state.mock('yanxin',   { status: 'working',  currentTask: { id: 't_y1', title: 'ทำ thumbnail copy' }, lastTool: 'Read', lastEventAt: new Date(Date.now() - sceneMs).toISOString() }); },
    () => { sceneMs = 60 * 60 * 1000; state.mock('jianfeng', { status: 'idle', lastEventAt: new Date(Date.now() - sceneMs).toISOString() }); },
  ];
  let i = 0;
  setInterval(() => {
    scenes[i % scenes.length]?.();
    for (const id of AGENT_IDS) {
      state.onTokenUsage(id, {
        input: Math.floor(Math.random() * 200),
        output: Math.floor(Math.random() * 80),
        cacheRead: Math.floor(Math.random() * 500),
        cacheCreate: 0,
      });
    }
    i++;
  }, 2000);
  console.log('[heaveneye] mock data driver enabled');
} else {
  const replay = process.env.HEAVENEYE_REPLAY === '1';
  console.log('[heaveneye] Starting watchers...');
  startHermesEventWatcher({ replayHistory: replay }).catch(console.warn);
  startHermesWatcher({ replayHistory: replay }).catch(console.warn);
  startClaudeWatcher({ replayHistory: replay }).catch(console.warn);
  startKanbanWatcher({ replayHistory: replay }).catch(console.warn);
  startInboxWatcher({ replayHistory: replay }).catch(console.warn);
  startSystemHealthWatcher().catch(console.warn);
  startRelayCron().catch(console.warn);
  console.log('[heaveneye] Watchers started (async)');
}

console.log(`[heaveneye] 👁️  listening on http://localhost:${PORT}`);
export default { port: PORT, fetch: app.fetch };
