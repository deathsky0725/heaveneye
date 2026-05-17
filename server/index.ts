import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { PORT, AGENT_IDS } from './config.ts';
import { state } from './state/engine.ts';
import type { ServerEvent } from './state/types.ts';
import { startHermesWatcher } from './watchers/hermes.ts';
import { startHermesEventWatcher } from './watchers/hermes-events.ts';
import { startClaudeWatcher } from './watchers/claude.ts';
import { startKanbanWatcher } from './watchers/kanban.ts';
import { startInboxWatcher } from './watchers/inbox.ts';
import { INBOX_PATH } from './config.ts';

const app = new Hono();
app.use('*', cors());

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.get('/api/agents', (c) => c.json({ agents: state.snapshot() }));

app.get('/api/usage/5h', (c) => c.json({ usage: state.getUsage5h() }));

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

// ---- Mock data driver (only when HEAVENEYE_MOCK=1) ----
if (process.env.HEAVENEYE_MOCK === '1') {
  console.log('[heaveneye] MOCK MODE enabled — no real data sources');
  const scenes = [
    () => state.mock('ziyue',    { status: 'working',  currentTask: { id: 't_demo', title: 'รับคำสั่งจากพี่เบญ' }, lastTool: 'Write' }),
    () => state.mock('anmaioyi', { status: 'thinking', currentTask: { id: 't_demo2', title: 'แตกงาน EP002' } }),
    () => state.mock('wenshu',   { status: 'working',  currentTask: { id: 't_w1', title: 'เขียน script' }, lastTool: 'Edit' }),
    () => state.mock('yanxin',   { status: 'working',  currentTask: { id: 't_y1', title: 'ทำ thumbnail copy' }, lastTool: 'Read' }),
    () => state.mock('jianfeng', { status: 'idle' }),
  ];
  let i = 0;
  setInterval(() => {
    scenes[i % scenes.length]();
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
  console.log('[heaveneye] Watchers started (async)');
}

console.log(`[heaveneye] 👁️  listening on http://localhost:${PORT}`);
export default { port: PORT, fetch: app.fetch };
