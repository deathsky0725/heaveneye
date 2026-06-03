/**
 * costCalculator.ts — Backend cost estimation
 *
 * Pricing (per 1M tokens):
 *   MiniMax:  $0.20 input  / $0.40 output
 *   GPT-4o:   $2.50 input  / $5.00 output
 */

import { AGENT_IDS, type AgentId } from '../config.ts';
import type { TokenUsage } from '../state/types.ts';

export const PRICING: Record<string, { input: number; output: number }> = {
  // MiniMax models
  'mini-max-m2.7': { input: 0.20, output: 0.40 },
  'mini-max-m2':   { input: 0.20, output: 0.40 },
  // GPT-4o models
  'gpt-4o':        { input: 2.50, output: 5.00 },
  'gpt-4o-mini':   { input: 2.50, output: 5.00 },
};

const DEFAULT_PRICE: { input: number; output: number } = { input: 0.20, output: 0.40 };

export function priceForModel(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(PRICING)) {
    if (lower.includes(key)) return price;
  }
  return DEFAULT_PRICE;
}

/** Compute cost in USD for a token usage snapshot */
export function computeCost(model: string, usage: TokenUsage): number {
  const p = priceForModel(model);
  return (
    (usage.input * p.input) +
    (usage.output * p.output) +
    (usage.cacheRead * p.input * 0.1) +   // cache read = 10% of input price
    (usage.cacheCreate * p.output * 0.1)   // cache create = 10% of output price
  ) / 1_000_000;
}

export interface CostEntry {
  agent: AgentId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costToday: number;    // USD (today only)
  cost7d: number;       // USD (last 7 days including today)
}

export interface CostAggregate {
  costToday: number;
  costWeek: number;
  costBoard: number;
  trend7d: number[];   // daily costs for last 7 days (oldest first)
}

/**
 * Estimate cost per agent for today + last 7 days.
 * Relies on engine's daily JSONL files under ~/.heaveneye/usage/
 * for historical data, and on the in-memory tokenEvents24h for today's data.
 */
export function estimateCosts(
  getModelForAgent: (id: AgentId) => string | undefined,
  getTodayTokens: (id: AgentId) => TokenUsage,
  get7dBuckets: (id: AgentId) => Array<{ day: string; total: number; input: number; output: number; cacheRead: number }>,
): CostEntry[] {
  const entries: CostEntry[] = [];

  for (const id of AGENT_IDS) {
    const model = getModelForAgent(id) ?? 'unknown';
    const today = getTodayTokens(id);

    // Accumulate 7d totals from daily buckets
    const buckets7d = get7dBuckets(id);
    let input7d = 0;
    let output7d = 0;
    let cacheRead7d = 0;
    for (const b of buckets7d) {
      input7d += b.input;
      output7d += b.output;
      cacheRead7d += b.cacheRead;
    }

    const costToday = computeCost(model, today);
    const cost7d = computeCost(model, {
      input: input7d,
      output: output7d,
      cacheRead: cacheRead7d,
      cacheCreate: 0,
    });

    entries.push({
      agent: id,
      model,
      inputTokens: today.input,
      outputTokens: today.output,
      costToday,
      cost7d,
    });
  }

  return entries;
}

/**
 * Compute cost aggregates across all agents.
 */
export function computeAggregates(entries: CostEntry[], costBoard: number): CostAggregate {
  return {
    costToday: entries.reduce((sum, e) => sum + e.costToday, 0),
    costWeek: entries.reduce((sum, e) => sum + e.cost7d, 0),
    costBoard,
    trend7d: [],   // populated by caller with per-day totals
  };
}