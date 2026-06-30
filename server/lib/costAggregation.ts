/**
 * costAggregation.ts — Cost aggregation engine
 *
 * READ-ONLY layer on top of StateEngine data (token buckets per agent).
 * Does NOT write usage data or mutate cost state.
 *
 * Aggregations: per-provider, per-agent, weekly (ISO week), monthly (YYYY-MM)
 */

import { AGENTS, AGENT_IDS, type AgentId } from '../config.ts';
import { modelToProvider, type TokenUsage } from '../state/types.ts';
import { priceForModel } from './costCalculator.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CostRange {
  start: Date;
  end: Date;
}

/** Per-provider breakdown */
export interface ProviderCost {
  provider: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  agentCount: number;
}

/** Per-agent breakdown */
export interface AgentCost {
  agent: AgentId;
  agentName: string;
  provider: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** Weekly bucket (ISO week) */
export interface WeeklyCost {
  week: string;       // "2026-W24"
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  agentCount: number;
}

/** Monthly bucket (YYYY-MM) */
export interface MonthlyCost {
  month: string;       // "2026-06"
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  agentCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute cost in USD for a token usage snapshot */
function computeCostForUsage(model: string, usage: TokenUsage): number {
  const p = priceForModel(model);
  return (
    (usage.input * p.input) +
    (usage.output * p.output) +
    (usage.cacheRead * p.input * 0.1) +
    (usage.cacheCreate * p.output * 0.1)
  ) / 1_000_000;
}

/** ISO week number as "YYYY-Www" */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  // Monday as first day of week
  d.setUTCDate(d.getUTCDate() + 4 - (day || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Monthly key as "YYYY-MM" */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse "YYYY-MM-DD" string to Date (local time, start of day) */
function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

// ─── Raw usage data access ───────────────────────────────────────────────────
// These accept the same getter signatures that StateEngine uses internally.
// In production pass: state.getUsage7d / state.getUsage30d / state.snapshot

export type UsageBuckets = Array<{
  day: string;
  total: number;
  input: number;
  output: number;
  cacheRead: number;
}>;

/**
 * Aggregate cost by provider over a date range.
 * Sums USD cost across all agents whose currentModel maps to the same provider.
 */
export function aggregateCostByProvider(
  range: CostRange,
  getUsage: (id: AgentId) => UsageBuckets,
  snapshot: () => Array<{ id: AgentId; currentModel?: string }>,
): ProviderCost[] {
  const map = new Map<string, { cost: number; input: number; output: number; cacheRead: number; agents: Set<AgentId> }>();

  for (const id of AGENT_IDS) {
    const snap = snapshot().find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';
    const provider = modelToProvider(model);

    const buckets = getUsage(id).filter((b) => {
      const d = parseDate(b.day);
      return d >= range.start && d <= range.end;
    });

    let input = 0, output = 0, cacheRead = 0;
    for (const bucket of buckets) {
      input += bucket.input;
      output += bucket.output;
      cacheRead += bucket.cacheRead;
    }

    if (input === 0 && output === 0) continue; // no usage in range

    const cost = computeCostForUsage(model, { input, output, cacheRead, cacheCreate: 0 });

    if (!map.has(provider)) {
      map.set(provider, { cost: 0, input: 0, output: 0, cacheRead: 0, agents: new Set() });
    }
    const entry = map.get(provider)!;
    entry.cost += cost;
    entry.input += input;
    entry.output += output;
    entry.cacheRead += cacheRead;
    entry.agents.add(id);
  }

  return Array.from(map.entries()).map(([provider, v]) => ({
    provider,
    cost: Math.round(v.cost * 1_000_000) / 1_000_000,
    inputTokens: v.input,
    outputTokens: v.output,
    cacheReadTokens: v.cacheRead,
    agentCount: v.agents.size,
  }));
}

/**
 * Aggregate cost by agent over a date range.
 */
export function aggregateCostByAgent(
  range: CostRange,
  getUsage: (id: AgentId) => UsageBuckets,
  snapshot: () => Array<{ id: AgentId; currentModel?: string; name?: string }>,
): AgentCost[] {
  const results: AgentCost[] = [];

  for (const id of AGENT_IDS) {
    const snap = snapshot().find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';
    const provider = modelToProvider(model);
    const agentName = snap.name ?? AGENTS[id]?.name ?? id;

    const buckets = getUsage(id).filter((b) => {
      const d = parseDate(b.day);
      return d >= range.start && d <= range.end;
    });

    let input = 0, output = 0, cacheRead = 0;
    for (const bucket of buckets) {
      input += bucket.input;
      output += bucket.output;
      cacheRead += bucket.cacheRead;
    }

    if (input === 0 && output === 0) {
      results.push({
        agent: id,
        agentName,
        provider,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
      });
      continue;
    }

    const cost = computeCostForUsage(model, { input, output, cacheRead, cacheCreate: 0 });
    results.push({
      agent: id,
      agentName,
      provider,
      cost: Math.round(cost * 1_000_000) / 1_000_000,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
    });
  }

  return results;
}

/**
 * Aggregate cost by ISO week bucket.
 * Buckets outside the range are excluded; partial boundary days are included.
 */
export function aggregateCostWeekly(
  range: CostRange,
  getUsage: (id: AgentId) => UsageBuckets,
  snapshot: () => Array<{ id: AgentId; currentModel?: string }>,
): WeeklyCost[] {
  // Build weekly buckets from all agents over the range
  const weekMap = new Map<string, { cost: number; input: number; output: number; cacheRead: number; agents: Set<AgentId> }>();

  for (const id of AGENT_IDS) {
    const snap = snapshot().find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';

    const buckets = getUsage(id).filter((b) => {
      const d = parseDate(b.day);
      return d >= range.start && d <= range.end;
    });

    for (const bucket of buckets) {
      const d = parseDate(bucket.day);
      const wk = isoWeekKey(d);
      if (!weekMap.has(wk)) {
        weekMap.set(wk, { cost: 0, input: 0, output: 0, cacheRead: 0, agents: new Set() });
      }
      const entry = weekMap.get(wk)!;
      entry.input += bucket.input;
      entry.output += bucket.output;
      entry.cacheRead += bucket.cacheRead;
      entry.agents.add(id);
    }
  }

  const results: WeeklyCost[] = [];
  for (const [wk, v] of weekMap.entries()) {
    const sampleDate = parseDate(wk.replace('-W', '-').replace(/W(\d+)/, (_, w) => {
      // Approximate: use the Monday of that week for model pricing
      const d = new Date();
      d.setFullYear(parseInt(wk.slice(0, 4)));
      d.setMonth(0, 1);
      const day = d.getDay();
      const diff = (day <= 4 ? 1 - day : 8 - day) + (parseInt(w) - 1) * 7;
      d.setDate(diff);
      return String(d.getDate());
    }));
    // Use a representative model for cost calculation (use 'MiniMax-M2.7' as default for weekly agg)
    const cost = computeCostForUsage('MiniMax-M2.7', {
      input: v.input,
      output: v.output,
      cacheRead: v.cacheRead,
      cacheCreate: 0,
    });
    results.push({
      week: wk,
      cost: Math.round(cost * 1_000_000) / 1_000_000,
      inputTokens: v.input,
      outputTokens: v.output,
      cacheReadTokens: v.cacheRead,
      agentCount: v.agents.size,
    });
  }

  return results.sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Aggregate cost by monthly bucket.
 */
export function aggregateCostMonthly(
  range: CostRange,
  getUsage: (id: AgentId) => UsageBuckets,
  snapshot: () => Array<{ id: AgentId; currentModel?: string }>,
): MonthlyCost[] {
  const monthMap = new Map<string, { cost: number; input: number; output: number; cacheRead: number; agents: Set<AgentId> }>();

  for (const id of AGENT_IDS) {
    const snap = snapshot().find((a) => a.id === id);
    if (!snap) continue;
    const model = snap.currentModel ?? 'unknown';

    const buckets = getUsage(id).filter((b) => {
      const d = parseDate(b.day);
      return d >= range.start && d <= range.end;
    });

    for (const bucket of buckets) {
      const d = parseDate(bucket.day);
      const mo = monthKey(d);
      if (!monthMap.has(mo)) {
        monthMap.set(mo, { cost: 0, input: 0, output: 0, cacheRead: 0, agents: new Set() });
      }
      const entry = monthMap.get(mo)!;
      entry.input += bucket.input;
      entry.output += bucket.output;
      entry.cacheRead += bucket.cacheRead;
      entry.agents.add(id);
    }
  }

  const results: MonthlyCost[] = [];
  for (const [mo, v] of monthMap.entries()) {
    const cost = computeCostForUsage('MiniMax-M2.7', {
      input: v.input,
      output: v.output,
      cacheRead: v.cacheRead,
      cacheCreate: 0,
    });
    results.push({
      month: mo,
      cost: Math.round(cost * 1_000_000) / 1_000_000,
      inputTokens: v.input,
      outputTokens: v.output,
      cacheReadTokens: v.cacheRead,
      agentCount: v.agents.size,
    });
  }

  return results.sort((a, b) => a.month.localeCompare(b.month));
}
