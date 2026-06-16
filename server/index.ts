import { join } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { spawn } from 'node:child_process';
import { PORT, AGENT_IDS, AGENTS, type AgentId, HOME, INBOX_PATH } from './config.ts';
import { state } from './state/engine.ts';
import { relayStore } from './state/relayStore.ts';
import type { ServerEvent, AgentStatus } from './state/types.ts';
import { startHermesWatcher } from './watchers/hermes.ts';
import { startHermesEventWatcher } from './watchers/hermes-events.ts';
import { startClaudeWatcher } from './watchers/claude.ts';
import { startKanbanWatcher } from './watchers/kanban.ts';
import { startInboxWatcher } from './watchers/inbox.ts';
import { startSystemHealthWatcher } from './watchers/system-health.ts';
import { startRelayCron } from './watchers/relayCron.ts';
import { startAlertThresholds } from './watchers/alertThresholds.ts';
import { startCrashDetector, getCrashNotificationConfig, setNotificationEnabled } from './lib/crashDetector.ts';
import { gatewayStart, gatewayStop } from './lib/gatewayControl.js';
import { getAgentHealthScore } from './lib/agentHealth.ts';
import { readAlertConfig, writeAlertConfig, type AlertConfig } from './lib/alertConfig.ts';
import { scanAlerts } from './lib/alerts.ts';
import { computeCost, priceForModel } from './lib/costCalculator.js';
import { chatCompletion, buildSystemPrompt, hasTeamCommandIntent, buildEpicDraft } from './lib/llm.ts';
import exportApp from './routes/export.ts';

const app = new Hono();
app.use('*', cors());

// Mount export routes
app.route('/api', exportApp);

app.get('/api/health', (c) => c.json(state.getSystemHealth() ?? { checkedAt: new Date().toISOString(), gateways: [] }));

app.get('/api/agents', (c) => c.json({ agents: state.snapshot() }));

// Phase E2 — per-provider rollup: { provider, agents[], tokensTodayTotal }
app.get('/api/providers', (c) => c.json({ providers: state.getProviders() }));

app.get('/api/usage/5h', (c) => c.json({ usage: state.getUsage5h() }));

// ---- Quota aggregate API (Phase G1) ----
// GET /api/quota — 5h cap % + weekly cap % + reset countdown + burn rate + per-agent tokens
// Data sources: getUsage5h() (window) + getUsage7d() (weekly) + getProviders() + heaveneye_autopilot.json
app.get('/api/quota', (c) => {
  // --- 5h window ---
  const usage5h = state.getUsage5h();
  let totalTokens5h = 0;
  let windowStartedAt: number | null = null;
  let nextResetAt: number | null = null;

  for (const u of usage5h) {
    const sum = u.input + u.output + u.cacheRead + u.cacheCreate;
    totalTokens5h += sum;
    if (u.windowStartedAt != null) {
      if (windowStartedAt === null || u.windowStartedAt < windowStartedAt) {
        windowStartedAt = u.windowStartedAt;
        nextResetAt = u.nextResetAt;
      }
    }
  }

  // MiniMax 5h hard cap (conservative — 500k tokens/h * 5h = 2.5M)
  const CAP_5H = 2_500_000;
  const cap5hPercent = Math.min((totalTokens5h / CAP_5H) * 100, 100);
  const resetCountdownMs = nextResetAt ? Math.max(0, nextResetAt - Date.now()) : null;

  // --- Burn rate: tokens/hr from 5h window ---
  let burnRateTph = 0;
  if (windowStartedAt !== null) {
    const elapsedMs = Date.now() - windowStartedAt;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    if (elapsedHours > 0) {
      burnRateTph = totalTokens5h / elapsedHours;
    }
  }

  // --- Weekly cap % ---
  // Aggregate last-7-days tokens across all agents (all buckets summed)
  let totalTokens7d = 0;
  for (const id of AGENT_IDS) {
    const buckets = state.getUsage7d(id);
    for (const b of buckets) {
      totalTokens7d += b.total;
    }
  }
  // Weekly cap: 10M tokens/week (per MiniMax plan)
  const CAP_WEEKLY = 10_000_000;
  const capWeeklyPercent = Math.min((totalTokens7d / CAP_WEEKLY) * 100, 100);

  // --- Per-agent token attribution ---
  const agents = state.snapshot();
  const providers = state.getProviders();
  const agentAttribution: Array<{
    agent: AgentId;
    name: string;
    provider: string;
    tokensToday: number;
    tokens5h: number;
    costToday: number;
  }> = [];

  for (const id of AGENT_IDS) {
    const snap = agents.find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';
    const todayTokens = snap.tokensToday;
    const tokensToday = todayTokens.input + todayTokens.output;

    // 5h tokens for this agent
    const agent5h = usage5h.find((u) => u.agent === id);
    const tokens5h = agent5h
      ? agent5h.input + agent5h.output + agent5h.cacheRead + agent5h.cacheCreate
      : 0;

    // cost today
    const { computeCost } = require('./lib/costCalculator.js');
    const costToday = computeCost(model, todayTokens);

    // provider from getProviders
    const prov = providers.find((p) => p.agents.includes(id));
    const provider = prov?.provider ?? 'unknown';

    agentAttribution.push({
      agent: id,
      name: snap.name,
      provider,
      tokensToday,
      tokens5h,
      costToday: Math.round(costToday * 10_000) / 10_000,
    });
  }

  return c.json({
    window5h: {
      totalTokens: totalTokens5h,
      capPercent: Math.round(cap5hPercent * 10) / 10,
      resetCountdownMs,
      resetCountdownSec: resetCountdownMs !== null ? Math.floor(resetCountdownMs / 1000) : null,
      windowStartedAt,
      nextResetAt,
    },
    weekly: {
      totalTokens: totalTokens7d,
      capPercent: Math.round(capWeeklyPercent * 10) / 10,
      capTokens: CAP_WEEKLY,
    },
    burnRate: {
      tokensPerHour: Math.round(burnRateTph),
      tokensPerMinute: Math.round(burnRateTph / 60),
    },
    agents: agentAttribution,
  });
});

app.get('/api/usage/24h', (c) => {
  const agent = c.req.query('agent');
  if (!agent || !AGENT_IDS.includes(agent as any)) {
    return c.json({ error: 'missing or invalid agent query param' }, 400);
  }
  return c.json({ agent, buckets: state.getUsage24h(agent as any) });
});

app.get('/api/usage/7d', (c) => {
  const agent = c.req.query('agent');
  if (!agent || !AGENT_IDS.includes(agent as any)) {
    return c.json({ error: 'missing or invalid agent query param' }, 400);
  }
  return c.json({ agent, buckets: state.getUsage7d(agent as any) });
});

app.get('/api/usage/30d', (c) => {
  const agent = c.req.query('agent');
  if (!agent || !AGENT_IDS.includes(agent as any)) {
    return c.json({ error: 'missing or invalid agent query param' }, 400);
  }
  return c.json({ agent, buckets: state.getUsage30d(agent as any) });
});

app.get('/api/agent/:id/activity-heatmap', (c) => {
  const agentId = c.req.param('id') as AgentId;
  if (!agentId || !AGENT_IDS.includes(agentId)) {
    return c.json({ error: 'missing or invalid agent id parameter' }, 400);
  }

  // Generate last 30 days in Bangkok timezone (UTC+7)
  const datesList: string[] = [];
  const nowMs = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowMs + 7 * 60 * 60 * 1000);
    d.setDate(d.getDate() - i);
    datesList.push(d.toISOString().split('T')[0]!);
  }

  const heatmap: Record<string, number> = {};
  for (const date of datesList) {
    heatmap[date] = 0;
  }

  // Scan all SQLite databases to count task events for this agent
  const BOARDS_ROOT = join(HOME, '.hermes/kanban/boards');
  try {
    const { readdirSync, existsSync } = require('node:fs');
    if (existsSync(BOARDS_ROOT)) {
      const thirtyDaysAgoSec = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000);
      for (const entry of readdirSync(BOARDS_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
        const dbPath = join(BOARDS_ROOT, entry.name, 'kanban.db');
        if (!existsSync(dbPath)) continue;
        try {
          const db = new (require('bun:sqlite').Database)(dbPath, { readonly: true });
          const rows = db.query(`
            SELECT e.created_at
            FROM task_events e
            JOIN tasks t ON t.id = e.task_id
            WHERE t.assignee = ? AND e.created_at >= ?
          `).all(agentId, thirtyDaysAgoSec) as { created_at: number }[];
          db.close();

          for (const row of rows) {
            const rowDateStr = new Date((row.created_at * 1000) + 7 * 60 * 60 * 1000).toISOString().split('T')[0]!;
            const prev = heatmap[rowDateStr];
            if (prev !== undefined) {
              heatmap[rowDateStr] = prev + 1;
            }
          }
        } catch (e) {
          // ignore error in individual board DB
        }
      }
    }
  } catch (e) {
    // ignore filesystem errors
  }

  // Format response as a sorted list of { date: string, count: number }
  const data = datesList.map((date) => ({
    date,
    count: heatmap[date] || 0,
  }));

  return c.json({ agent: agentId, heatmap: data });
});

// ---- Cost estimation API ----
app.get('/api/cost', (c) => {
  const entries: Array<{
    agent: AgentId;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costToday: number;
    cost7d: number;
  }> = [];
  let costToday = 0;
  let costWeek = 0;
  const trend7d = [0, 0, 0, 0, 0, 0, 0]; // oldest to newest

  for (const id of AGENT_IDS) {
    const snapshots = state.snapshot();
    const agentSnap = snapshots.find((a) => a.id === id);
    if (!agentSnap) continue;
    const model = agentSnap.currentModel ?? 'unknown';
    const todayTokens = agentSnap.tokensToday;

    const buckets7d = state.getUsage7d(id);
    let input7d = 0, output7d = 0, cacheRead7d = 0;
    for (let i = 0; i < buckets7d.length; i++) {
      const b = buckets7d[i]!;
      input7d += b.input;
      output7d += b.output;
      cacheRead7d += b.cacheRead;
      if (i < 7) {
        const p = priceForModel(model);
        const dayCost = (
          (b.input * p.input) +
          (b.output * p.output) +
          (b.cacheRead * p.input * 0.1)
        ) / 1_000_000;
        trend7d[i] = (trend7d[i] ?? 0) + dayCost;
      }
    }

    const costTodayAgent = computeCost(model, todayTokens);
    const cost7dAgent = computeCost(model, { input: input7d, output: output7d, cacheRead: cacheRead7d, cacheCreate: 0 });

    costToday += costTodayAgent;
    costWeek += cost7dAgent;

    entries.push({
      agent: id,
      model,
      inputTokens: todayTokens.input,
      outputTokens: todayTokens.output,
      costToday: costTodayAgent,
      cost7d: cost7dAgent,
    });
  }

  return c.json({
    agents: entries,
    aggregate: {
      costToday,
      costWeek,
      trend7d,
    },
  });
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

// POST /api/chat — LLM chat with board context (Thai responses, team-command intent detection)
app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => null) as { message?: string; history?: Array<{ role: string; content: string }> } | null;
  if (!body || typeof body.message !== 'string' || !body.message.trim()) {
    return c.json({ error: 'message is required' }, 400);
  }

  // Gather board context
  const agents = state.snapshot();
  const events = state.getKanbanEvents(20);

  const boardAgents = agents
    .map((a) => `• ${a.name} (${a.role}) — ${a.status}${a.currentTask ? ` | ทำงาน: ${a.currentTask.title}` : ''}`)
    .join('\n');

  const recentEvents = events
    .slice(0, 10)
    .map((e) => `• [${e.ts}] ${e.agent}: ${e.kind} — ${e.task_title ?? e.task_id}`)
    .join('\n') || '(ไม่มีเหตุการณ์ล่าสุด)';

  // Build per-agent cost + history context (same logic as /api/cost)
  const agentCostEntries: string[] = [];
  const weeklyBurnRanking: { id: AgentId; name: string; cost7d: number }[] = [];
  for (const id of AGENT_IDS) {
    const snap = agents.find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';
    const todayTokens = snap.tokensToday;
    const buckets7d = state.getUsage7d(id);
    let input7d = 0, output7d = 0, cacheRead7d = 0;
    for (const b of buckets7d) {
      input7d += b.input;
      output7d += b.output;
      cacheRead7d += b.cacheRead;
    }
    const costTodayAgent = computeCost(model, todayTokens);
    const cost7dAgent = computeCost(model, { input: input7d, output: output7d, cacheRead: cacheRead7d, cacheCreate: 0 });
    const totalTokensToday = todayTokens.input + todayTokens.output;
    agentCostEntries.push(
      `• ${snap.name}: วันนี้ใช้ ${totalTokensToday.toLocaleString()} tokens (in: ${todayTokens.input.toLocaleString()}, out: ${todayTokens.output.toLocaleString()}) | ค่าใช้จ่ายวันนี้ $${costTodayAgent.toFixed(4)} | 7 วัน $${cost7dAgent.toFixed(4)} | model: ${model}`
    );
    weeklyBurnRanking.push({ id, name: snap.name, cost7d: cost7dAgent });
  }
  const agentCostContext = agentCostEntries.join('\n') || '(ไม่มีข้อมูลค่าใช้จ่าย)';

  // Build weekly burn ranking (highest spender first)
  const burnRank = [...weeklyBurnRanking]
    .sort((a, b) => b.cost7d - a.cost7d)
    .map((e, i) => `${i + 1}. ${e.name}: $${e.cost7d.toFixed(4)}`)
    .join('\n');

  // Build per-agent recent session history
  const agentHistoryEntries: string[] = [];
  for (const id of AGENT_IDS) {
    const snap = agents.find((a) => a.id === id);
    if (!snap) continue;
    const sessions = state.getAgentSessions(id, 3);
    if (sessions.length === 0) continue;
    const lines = sessions.map((s) => {
      const dur = s.durationMs > 0 ? `${Math.round(s.durationMs / 60000)} นาที` : 'active';
      const tokens = s.totalTokens > 0 ? `, ${s.totalTokens.toLocaleString()} tokens` : '';
      const task = s.taskTitle ? ` [${s.taskTitle}]` : '';
      const ended = s.status === 'ended' ? ' (จบ)' : ' (กำลังทำ)';
      return `  - ${s.status === 'active' ? '🟢' : '⚪'} ${dur}${ended}${tokens}${task}`;
    }).join('\n');
    agentHistoryEntries.push(`• ${snap.name}:\n${lines}`);
  }
  const agentHistoryContext = agentHistoryEntries.join('\n') || '(ไม่มีข้อมูลประวัติ)';

  const systemPrompt = buildSystemPrompt(boardAgents, recentEvents, agentCostContext, burnRank, agentHistoryContext);

  // Build messages: system + history + new user message
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Append history (if any)
  if (body.history && body.history.length > 0) {
    for (const h of body.history) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }

  // Append current user message
  messages.push({ role: 'user', content: body.message });

  // Check for team-command intent
  const isTeamCommand = hasTeamCommandIntent(body.message);

  try {
    const reply = await chatCompletion({ messages });

    // If team-command intent detected, append epic draft suggestion
    const withDraft = isTeamCommand
      ? reply + '\n\n' + buildEpicDraft(body.message, boardAgents)
      : reply;

    return c.json({ reply: withDraft, isTeamCommand });
  } catch (err) {
    console.error('[/api/chat] LLM error:', err);
    return c.json({ error: 'LLM call failed', detail: String(err) }, 500);
  }
});

// ---- MissionControl aggregate API (Phase I1) ----
// GET /api/autopilot — aggregates quotaState + epicPipeline + parkedCards + recentActivity
app.get('/api/autopilot', async (c) => {
  try {
    const { readFile } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');

    // 1. quotaState — from heaveneye_autopilot.json
    let quotaState: Record<string, unknown> = {};
    const autopilotPath = join(HOME, '.hermes', 'state', 'heaveneye_autopilot.json');
    if (existsSync(autopilotPath)) {
      try {
        quotaState = JSON.parse(await readFile(autopilotPath, 'utf8'));
      } catch {
        // use empty on parse error
      }
    }

    // 2. epicPipeline — from anmaioyi inbox + outbox JSONL
    const inboxPath = join(HOME, 'Agentic-OS', 'Context', 'anmaioyi-inbox.jsonl');
    const outboxPath = join(HOME, 'Agentic-OS', 'Context', 'anmaioyi-outbox.jsonl');
    const epicMap: Record<string, { id: string; project: string; stage: string; cards: { id: string; title: string }[] }> = {};

    for (const path of [inboxPath, outboxPath]) {
      if (existsSync(path)) {
        try {
          const content = await readFile(path, 'utf8');
          const lines = content.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.kind === 'epic' || entry.kind === 'epic_ack') {
                const epicId = entry.project ?? entry.epic ?? 'unknown';
                if (!epicMap[epicId]) {
                  epicMap[epicId] = { id: epicId, project: epicId, stage: 'intake', cards: [] };
                }
                if (entry.kind === 'epic_ack') {
                  // Advance stage: intake → card_plan → ack → cards → done
                  const stageOrder = ['intake', 'card_plan', 'ack', 'cards', 'done'];
                  const currentIdx = stageOrder.indexOf(epicMap[epicId].stage);
                  if (currentIdx < stageOrder.length - 1) {
                    epicMap[epicId].stage = stageOrder[currentIdx + 1]!;
                  }
                }
                if (entry.phase) epicMap[epicId].stage = entry.phase;
                if (entry.topic) {
                  epicMap[epicId].cards.push({ id: epicId, title: entry.topic });
                }
              }
            } catch {
              // skip malformed lines
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
    const epicPipeline = Object.values(epicMap);

    // 3. parkedCards — scan kanban boards for blocked tasks with [PARKED] comment
    const parkedCards: { id: string; title: string; reason: string }[] = [];
    const boardsRoot = join(HOME, '.hermes', 'kanban', 'boards');
    if (existsSync(boardsRoot)) {
      const { readdirSync } = require('node:fs');
      for (const entry of readdirSync(boardsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
        const dbPath = join(boardsRoot, entry.name, 'kanban.db');
        if (!existsSync(dbPath)) continue;
        try {
          const db = new (require('bun:sqlite').Database)(dbPath, { readonly: true });
          const parked = db.query(`
            SELECT t.id, t.title, c.body as reason
            FROM tasks t
            JOIN task_comments c ON c.task_id = t.id
            WHERE t.status = 'blocked'
              AND c.body LIKE '%[PARKED]%'
            GROUP BY t.id
          `).all() as { id: string; title: string; reason: string }[];
          db.close();
          for (const row of parked) {
            // Extract [PARKED] reason text
            const match = row.reason.match(/\[PARKED\]\s*(.*)/);
            parkedCards.push({ id: row.id, title: row.title, reason: match?.[1] ?? '' });
          }
        } catch {
          // ignore individual board errors
        }
      }
    }

    // 4. recentActivity — last 20 kanban events from state engine
    const recentActivity = state.getKanbanEvents(20);

    return c.json({ quotaState, epicPipeline, parkedCards, recentActivity });
  } catch (err) {
    console.error('[/api/autopilot]', err);
    return c.json({ error: String(err) }, 500);
  }
});

// Phase C — dev-only handoff verifier. Calls the same resolver the watcher
// would use, then emits a synthetic handoff event into the kanban buffer so
// the frontend (or curl) can see the resulting `to_agent` field. Gated by
// NODE_ENV !== 'production' so it never leaks into a deploy.
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test/handoff', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { board = 'heaveneye-ui', taskId, from = 'yefan' } = body as { board?: string; taskId?: string; from?: string };
    if (!taskId) return c.json({ error: 'taskId required' }, 400);
    const to = state.resolveHandoff(board, taskId);
    state.onKanbanEvent({
      ts: new Date().toISOString(),
      agent: from as AgentId,
      kind: 'handoff',
      task_id: taskId,
      from_agent: from as AgentId,
      to_agent: to,
      payload: { source: 'test_endpoint' },
    });
    return c.json({ ok: true, from, to, taskId });
  });

  // Phase D — dev-only test endpoint to fire qa_start for visual testing
  app.post('/api/test/qa-start', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { taskId = 't_89a2728a', taskTitle = 'QA — verify D1 STEP 2' } = body as { taskId?: string; taskTitle?: string };
    state.onKanbanEvent({
      ts: new Date().toISOString(),
      agent: 'yanxin',
      kind: 'qa_start',
      task_id: taskId,
      task_title: taskTitle,
    });
    return c.json({ ok: true, kind: 'qa_start', agent: 'yanxin', taskId });
  });

  // Phase D — dev-only: force an agent's status to visually test liveness
  // poses on demand (thinking dots+tilt, working lean+glow, idle, away, etc.).
  //   curl -X POST :7878/api/test/status -d '{"agent":"yanxin","status":"thinking"}'
  app.post('/api/test/status', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { agent, status, taskTitle, idleMinutes, healthFlag } = body as { agent?: AgentId; status?: AgentStatus; taskTitle?: string; idleMinutes?: number; healthFlag?: 'stuck' | 'crash-loop' | 'iteration-exhausted' | 'silent-done' };
    if (!agent || !status) return c.json({ error: 'agent and status required' }, 400);
    state.debugSetStatus(agent, status, taskTitle, idleMinutes, healthFlag);
    return c.json({ ok: true, agent, status, idleMinutes, healthFlag });
  });

  // Phase D — dev-only: fire a milestone 'completed' event to test D4 confetti.
  app.post('/api/test/milestone', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { agent = 'anmaioyi', taskTitle = '🎉 Phase D complete' } = body as { agent?: AgentId; taskTitle?: string };
    state.onKanbanEvent({
      ts: new Date().toISOString(),
      agent,
      kind: 'completed',
      task_id: 'test-milestone',
      task_title: taskTitle,
    });
    return c.json({ ok: true, kind: 'completed', agent, taskTitle });
  });
}

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

  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  if (AGENTS[id].team === 'core') {
    return c.json({ error: 'cannot kill core team agent' }, 403);
  }

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

  process.kill(pid, 'SIGTERM');
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  let signal: 'TERM' | 'KILL' | 'none' = 'TERM';
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
    signal = 'KILL';
  } catch {
    signal = 'TERM';
  }

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

app.get('/api/agent/:id/health-score', (c) => {
  const id = c.req.param('id') as AgentId;
  if (!AGENT_IDS.includes(id)) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  return c.json(getAgentHealthScore(id));
});


// ---- Gateway control API (Phase 5.2.1) ----
// POST /api/gateway/:id/start — launch via launchctl (allow-list only)
app.post('/api/gateway/:id/start', async (c) => {
  const id = c.req.param('id') as string;
  if (!id) return c.json({ error: 'id is required' }, 400);
  const result = await gatewayStart(id);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.error === 'forbidden' ? 403 : 500);
  }
  return c.json({ ok: true, pid: result.pid });
});

// POST /api/gateway/:id/stop — stop via launchctl (allow-list only)
app.post('/api/gateway/:id/stop', async (c) => {
  const id = c.req.param('id') as string;
  if (!id) return c.json({ error: 'id is required' }, 400);
  const result = await gatewayStop(id);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.error === 'forbidden' ? 403 : 500);
  }
  return c.json({ ok: true });
});

// POST /api/crash-notification — handles crash event (console log)
app.post('/api/crash-notification', async (c) => {
  const body = await c.req.json<{ agentId: string; agentName: string }>();
  if (!body.agentId || !body.agentName) {
    return c.json({ error: 'agentId and agentName are required' }, 400);
  }
  const entry = { ts: Date.now(), title: 'Agent Crashed', body: `${body.agentName} died` };
  state.pushCrashNotification(entry);
  return c.json({ ok: true });
});

// GET /api/crash-notification/config — get per-agent enable/disable state
app.get('/api/crash-notification/config', (c) => {
  return c.json({ config: getCrashNotificationConfig() });
});

// POST /api/crash-notification/config — update per-agent enable/disable state
app.post('/api/crash-notification/config', async (c) => {
  const body = await c.req.json<Record<string, boolean>>();
  for (const [agentId, enabled] of Object.entries(body)) {
    if (agentId in AGENTS) {
      setNotificationEnabled(agentId as AgentId, Boolean(enabled));
    }
  }
  return c.json({ ok: true, config: getCrashNotificationConfig() });
});

// POST /api/command — BRIDGE epic command: append kind:epic line to anmaioyi-inbox.jsonl
app.post('/api/command', async (c) => {
  const { text } = await c.req.json<{ text?: unknown }>();
  if (typeof text !== 'string') {
    return c.json({ error: 'text is required and must be a string' }, 400);
  }
  const INBOX = join(HOME, 'Agentic-OS/Context/anmaioyi-inbox.jsonl');
  const line = JSON.stringify({ kind: 'epic', from: 'bridge', text }) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(INBOX, line, 'utf8');
  return c.json({ ok: true, epic_id: 'draft' });
});

// POST /api/crash-notification/test — send a test notification (does not require a real dead event)
app.post('/api/crash-notification/test', async (c) => {
  const body = await c.req.json<{ agent: string }>();
  const agentId = body.agent as AgentId;
  if (!agentId || !AGENTS[agentId]) {
    return c.json({ error: 'invalid agent id' }, 400);
  }
  state.pushCrashNotification({
    ts: Date.now(),
    title: 'Agent Crashed',
    body: `${AGENTS[agentId].name} died`,
  });
  return c.json({ ok: true });
});
app.get('/api/crash-notification/check', (c) => {
  const since = Number(c.req.query('since') ?? 0);
  return c.json({ notifications: state.popCrashNotifications(since) });
});
app.get('/api/config/alerts', (c) => {
  const config = readAlertConfig();
  return c.json(config);
});

// GET /api/alerts — L1 proactive alert scan (4 event types + dedup + throttle)
app.get('/api/alerts', (c) => {
  const pendingAlerts = scanAlerts();
  return c.json({ pendingAlerts });
});

app.post('/api/config/alerts', async (c) => {
  const body = await c.req.json<Partial<AlertConfig>>();
  const result = writeAlertConfig(body);
  if (!result.ok) return c.json({ error: result.error }, 500);
  return c.json({ ok: true, config: readAlertConfig() });
});

// ---- Reports / result.md viewer API (Phase D.1) ----
app.get('/api/reports/:board', async (c) => {
  const board = c.req.param('board');
  if (!board || !/^[a-z0-9_-]+$/i.test(board)) {
    return c.json({ error: 'invalid board slug' }, 400);
  }
  // Resolve board slug → project path
  // heaveneye-ui → heaveneye (historical name mismatch)
  const PROJECT_MAP: Record<string, string> = {
    'heaveneye-ui': 'heaveneye',
  };
  const project = PROJECT_MAP[board] ?? board;
  const resultMdPath = join(HOME, 'Agentic-OS/Projects', project, 'result.events.log');
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(resultMdPath, 'utf8');
    return c.json({ board, content });
  } catch (e) {
    return c.json({ error: 'result.md not found for board', board }, 404);
  }
});

// ---- Boards aggregate API (Phase B.2) ----
app.get('/api/boards', (c) => {
  return c.json({ boards: state.getBoardSummaries() });
});

// ---- Mock data driver (only when HEAVENEYE_MOCK=1) ----
if (process.env.HEAVENEYE_MOCK === '1') {
  console.log('[heaveneye] MOCK MODE enabled — no real data sources');
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
  startAlertThresholds().catch(console.warn);
  startCrashDetector().catch(console.warn);
  console.log('[heaveneye] Watchers started (async)');
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    return app.fetch(req);
  },
});

console.log(`[heaveneye] 👁️  listening on http://localhost:${PORT}`);
export default server;