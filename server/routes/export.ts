import { Hono } from 'hono';
import { state } from '../state/engine.ts';
import { AGENT_IDS } from '../config.ts';
import type { AgentId } from '../config.ts';
import type { KanbanEventEntry } from '../state/types.ts';

const app = new Hono();

type Range = 'today' | '7d' | '30d' | 'custom';

/** Parse ?range=today|7d|30d&from=ISO&to=ISO into Unix ms bounds */
function parseRange(range: string, from: string, to: string): { fromMs: number; toMs: number } {
  const now = Date.now();
  if (range === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return { fromMs: d.getTime(), toMs: now };
  }
  if (range === '7d') {
    return { fromMs: now - 7 * 86_400_000, toMs: now };
  }
  if (range === '30d') {
    return { fromMs: now - 30 * 86_400_000, toMs: now };
  }
  // custom
  return {
    fromMs: from ? new Date(from).getTime() : now - 30 * 86_400_000,
    toMs: to ? new Date(to).getTime() : now,
  };
}

/** Convert a row object to a CSV line */
function toCSVLine(row: Record<string, unknown>): string {
  return Object.values(row)
    .map((v) => {
      const s = String(v ?? '');
      // escape double quotes, wrap in quotes if contains comma/quote/newline
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

/** CSV header from first row */
function csvHeader(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  return Object.keys(rows[0]!).join(',');
}

// ── Token usage ──────────────────────────────────────────────────────────────

interface TokenRow {
  agent: string;
  model: string;
  date: string;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
  total: number;
}

function exportTokenUsage(fromMs: number, toMs: number): TokenRow[] {
  const rows: TokenRow[] = [];
  // Use 30d daily buckets to cover historical, plus in-memory for today
  for (const id of AGENT_IDS) {
    const agentBuckets = state.getUsage30d(id);
    for (const b of agentBuckets) {
      const ms = new Date(b.day).getTime();
      if (ms < fromMs || ms > toMs) continue;
      rows.push({
        agent: id,
        model: 'n/a', // daily agg has no model breakdown — use n/a for simplicity
        date: b.day,
        input: b.input,
        output: b.output,
        cache_read: b.cacheRead,
        cache_create: 0,
        total: b.total,
      });
    }
    // Add in-memory 24h events for today (more granular)
    const { tokenEvents24h } = (state as any);
    const events24h = tokenEvents24h?.get(id) as Array<{ ts: number; model: string; usage: { input: number; output: number; cacheRead: number; cacheCreate: number } }> ?? [];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const grouped = new Map<string, TokenRow>();
    for (const ev of events24h) {
      if (ev.ts < fromMs || ev.ts > toMs) continue;
      if (ev.ts < todayStart.getTime()) continue; // already in daily buckets
      const dateStr = new Date(ev.ts).toISOString().split('T')[0]!;
      const key = `${id}__${dateStr}__${ev.model}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.input += ev.usage.input;
        existing.output += ev.usage.output;
        existing.cache_read += ev.usage.cacheRead;
        existing.cache_create += ev.usage.cacheCreate;
        existing.total += ev.usage.input + ev.usage.output + ev.usage.cacheRead;
      } else {
        grouped.set(key, {
          agent: id,
          model: ev.model,
          date: dateStr,
          input: ev.usage.input,
          output: ev.usage.output,
          cache_read: ev.usage.cacheRead,
          cache_create: ev.usage.cacheCreate,
          total: ev.usage.input + ev.usage.output + ev.usage.cacheRead,
        });
      }
    }
    rows.push(...grouped.values());
  }
  return rows;
}

// ── Kanban events ───────────────────────────────────────────────────────────

function exportKanbanEvents(fromMs: number, toMs: number): KanbanEventEntry[] {
  return state.getKanbanEvents(200).filter((e) => {
    const ms = new Date(e.ts).getTime();
    return ms >= fromMs && ms <= toMs;
  });
}

// ── Notifications ───────────────────────────────────────────────────────────

function exportNotifications(fromMs: number, toMs: number): Array<Record<string, unknown>> {
  return state.getNotifications(200).filter((n) => {
    const ms = new Date(n.ts).getTime();
    return ms >= fromMs && ms <= toMs;
  }).map((n) => ({
    id: n.id,
    ts: n.ts,
    agent: n.agent,
    platform: n.platform,
    chat_id: n.chat_id,
    thread_id: n.thread_id ?? '',
    task_id: n.task_id,
    task_title: n.task_title ?? '',
    event_kind: n.event_kind,
    message: n.message,
  }));
}

type AllCSVRow = Record<string, unknown>;

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/export', (c) => {
  const range = (c.req.query('range') ?? '7d') as Range;
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  const format = (c.req.query('format') ?? 'csv') as 'csv' | 'json';
  const type = (c.req.query('type') ?? 'all') as 'token_usage' | 'kanban_events' | 'notifications' | 'all';

  const { fromMs, toMs } = parseRange(range, from, to);

  const results: Record<string, unknown> = {};

  if (type === 'token_usage' || type === 'all') {
    results.token_usage = exportTokenUsage(fromMs, toMs);
  }
  if (type === 'kanban_events' || type === 'all') {
    results.kanban_events = exportKanbanEvents(fromMs, toMs);
  }
  if (type === 'notifications' || type === 'all') {
    results.notifications = exportNotifications(fromMs, toMs);
  }

  if (format === 'json') {
    return c.json(results);
  }

  // CSV — single combined table for 'all', or flat for single type
  if (type === 'all') {
    // Merge into one CSV with type discriminator
    const allRows: AllCSVRow[] = [];

    for (const tu of (results.token_usage as TokenRow[])) {
      allRows.push({ ...tu, _type: 'token_usage' });
    }
    for (const ev of (results.kanban_events as KanbanEventEntry[])) {
      allRows.push({ ...ev, _type: 'kanban_event' });
    }
    for (const n of (results.notifications as AllCSVRow[])) {
      allRows.push({ ...n, _type: 'notification' });
    }

    // Sort by ts desc
    allRows.sort((a, b) => {
      const ats = new Date(String(a['ts'] ?? a['date'] ?? '')).getTime();
      const bts = new Date(String(b['ts'] ?? b['date'] ?? '')).getTime();
      return bts - ats;
    });

    if (allRows.length === 0) {
      return c.text('', 200, { 'Content-Type': 'text/csv' });
    }
    const header = csvHeader(allRows);
    const lines = allRows.map((r) => toCSVLine(r));
    return c.text([header, ...lines].join('\n'), 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="heaveneye-export-${range}.csv"`,
    });
  }

  // Single-type CSV
  if (type === 'token_usage') {
    const rows = results.token_usage as TokenRow[];
    if (rows.length === 0) return c.text('', 200, { 'Content-Type': 'text/csv' });
    const header = 'agent,model,date,input,output,cache_read,cache_create,total';
    const lines = rows.map((r) => `${r.agent},${r.model},${r.date},${r.input},${r.output},${r.cache_read},${r.cache_create},${r.total}`);
    return c.text([header, ...lines].join('\n'), 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="token-usage-${range}.csv"`,
    });
  }
  if (type === 'kanban_events') {
    const rows = results.kanban_events as KanbanEventEntry[];
    if (rows.length === 0) return c.text('', 200, { 'Content-Type': 'text/csv' });
    const flat = rows.map((r) => ({
      id: r.id, ts: r.ts, agent: r.agent, kind: r.kind,
      task_id: r.task_id, task_title: r.task_title ?? '',
      payload: JSON.stringify(r.payload ?? {}),
    }));
    const header = csvHeader(flat);
    const lines = flat.map((r) => toCSVLine(r));
    return c.text([header, ...lines].join('\n'), 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="kanban-events-${range}.csv"`,
    });
  }
  if (type === 'notifications') {
    const rows = results.notifications as Array<Record<string, unknown>>;
    if (rows.length === 0) return c.text('', 200, { 'Content-Type': 'text/csv' });
    const header = csvHeader(rows);
    const lines = rows.map((r) => toCSVLine(r));
    return c.text([header, ...lines].join('\n'), 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="notifications-${range}.csv"`,
    });
  }

  return c.json(results);
});

export default app;