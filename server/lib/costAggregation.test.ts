/**
 * costAggregation.test.ts — Unit tests for cost aggregation engine
 * Covers: empty data, single bucket, multi-bucket, range edge cases
 */

import { describe, test, expect } from 'bun:test';
import { aggregateCostByProvider, aggregateCostByAgent, aggregateCostWeekly, aggregateCostMonthly } from './costAggregation.ts';
import type { AgentId } from '../config.ts';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT = () => [
  { id: 'yefan' as AgentId, currentModel: 'MiniMax-M2.7', name: 'Yeh Fan' },
  { id: 'shihao' as AgentId, currentModel: 'MiniMax-M2', name: 'Shihao' },
  { id: 'anmaioyi' as AgentId, currentModel: 'gpt-4o', name: 'An Maioyi' },
];

const MOCK_BUCKETS = {
  yefan: [
    { day: '2026-06-15', total: 1000, input: 600, output: 300, cacheRead: 100 },
    { day: '2026-06-16', total: 2000, input: 1200, output: 600, cacheRead: 200 },
    { day: '2026-06-17', total: 3000, input: 1800, output: 900, cacheRead: 300 },
  ],
  shihao: [
    { day: '2026-06-15', total: 500, input: 300, output: 150, cacheRead: 50 },
    { day: '2026-06-16', total: 1500, input: 900, output: 450, cacheRead: 150 },
  ],
  anmaioyi: [
    { day: '2026-06-15', total: 800, input: 480, output: 240, cacheRead: 80 },
    { day: '2026-06-16', total: 1600, input: 960, output: 480, cacheRead: 160 },
    { day: '2026-06-17', total: 3200, input: 1920, output: 960, cacheRead: 320 },
  ],
} as Partial<Record<AgentId, Array<{ day: string; total: number; input: number; output: number; cacheRead: number }>>>;

function makeRange(start: string, end: string) {
  const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y!, m! - 1, d!); };
  return { start: parse(start), end: parse(end) };
}

function sumBucketInputs(buckets: Array<{ day: string; total: number; input: number; output: number; cacheRead: number }>) {
  return buckets.reduce((acc, b) => acc + b.input, 0);
}

// ─── aggregateCostByProvider ─────────────────────────────────────────────────

describe('aggregateCostByProvider', () => {
  test('empty data returns empty array', () => {
    const emptyGetUsage = () => [] as any[];
    const result = aggregateCostByProvider(makeRange('2026-06-01', '2026-06-30'), emptyGetUsage, () => []);
    expect(result).toEqual([]);
  });

  test('single bucket within range returns correct cost', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-16', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostByProvider(makeRange('2026-06-16', '2026-06-16'), getUsage, MOCK_SNAPSHOT);
    expect(result.length).toBeGreaterThan(0);
    // MiniMax pricing: input $0.20/M, output $0.40/M
    // cost = (600 * 0.20 + 300 * 0.40 + 100 * 0.20 * 0.1) / 1e6
    //      = (120 + 120 + 2) / 1e6 = 242 / 1e6 = 0.000242
    const minimax = result.find(r => r.provider === 'minimax');
    expect(minimax).toBeDefined();
    expect(minimax!.cost).toBeCloseTo(0.000242, 8);
  });

  test('multiple buckets within range aggregates correctly', () => {
    const result = aggregateCostByProvider(makeRange('2026-06-15', '2026-06-16'), (id) => MOCK_BUCKETS[id] ?? [], MOCK_SNAPSHOT);
    expect(result.length).toBeGreaterThan(0);
    // Check providers present
    const providers = result.map(r => r.provider);
    expect(providers).toContain('minimax');
    expect(providers).toContain('unknown'); // gpt-4o maps via modelToProvider
  });

  test('bucket outside range is excluded', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-15', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostByProvider(makeRange('2026-06-20', '2026-06-30'), getUsage, MOCK_SNAPSHOT);
    expect(result).toEqual([]);
  });

  test('partial range includes only matching buckets', () => {
    // Range includes only 2026-06-16
    // Both yefan (MiniMax-M2.7) and shihao (MiniMax-M2) map to minimax
    // yefan: input=1200, shihao: input=900 → combined = 2100
    const result = aggregateCostByProvider(makeRange('2026-06-16', '2026-06-16'), (id) => MOCK_BUCKETS[id] ?? [], MOCK_SNAPSHOT);
    const minimax = result.find(r => r.provider === 'minimax');
    expect(minimax).toBeDefined();
    expect(minimax!.inputTokens).toBe(2100); // yefan 1200 + shihao 900
  });
});

// ─── aggregateCostByAgent ────────────────────────────────────────────────────

describe('aggregateCostByAgent', () => {
  test('empty data returns all agents with zero cost', () => {
    const emptyGetUsage = () => [] as any[];
    const result = aggregateCostByAgent(makeRange('2026-06-01', '2026-06-30'), emptyGetUsage, MOCK_SNAPSHOT);
    expect(result.length).toBe(3);
    expect(result.every(r => r.cost === 0)).toBe(true);
  });

  test('single agent with usage returns correct cost', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-16', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostByAgent(makeRange('2026-06-16', '2026-06-16'), getUsage, MOCK_SNAPSHOT);
    const yefan = result.find(r => r.agent === 'yefan')!;
    expect(yefan.cost).toBeCloseTo(0.000242, 8);
    expect(yefan.inputTokens).toBe(600);
    expect(yefan.outputTokens).toBe(300);
  });

  test('multi bucket aggregates correctly', () => {
    const result = aggregateCostByAgent(makeRange('2026-06-15', '2026-06-17'), (id) => MOCK_BUCKETS[id] ?? [], MOCK_SNAPSHOT);
    const yefan = result.find(r => r.agent === 'yefan')!;
    // yefan: 2026-06-15 (in:600,out:300,cr:100) + 2026-06-16 (in:1200,out:600,cr:200) + 2026-06-17 (in:1800,out:900,cr:300)
    const totalIn = 600 + 1200 + 1800;
    const totalOut = 300 + 600 + 900;
    const totalCr = 100 + 200 + 300;
    const expectedCost = (totalIn * 0.20 + totalOut * 0.40 + totalCr * 0.20 * 0.1) / 1_000_000;
    expect(yefan.inputTokens).toBe(totalIn);
    expect(yefan.cost).toBeCloseTo(expectedCost, 8);
  });

  test('range edge case: no usage in range returns zero-cost entry', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-01', total: 100, input: 50, output: 50, cacheRead: 0 }]
        : [];
    const result = aggregateCostByAgent(makeRange('2026-06-20', '2026-06-30'), getUsage, MOCK_SNAPSHOT);
    const yefan = result.find(r => r.agent === 'yefan')!;
    expect(yefan.cost).toBe(0);
    expect(yefan.inputTokens).toBe(0);
  });
});

// ─── aggregateCostWeekly ─────────────────────────────────────────────────────

describe('aggregateCostWeekly', () => {
  test('empty data returns empty array', () => {
    const result = aggregateCostWeekly(makeRange('2026-06-01', '2026-06-30'), () => [], () => []);
    expect(result).toEqual([]);
  });

  test('single week bucket returns one entry', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-15', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostWeekly(makeRange('2026-06-15', '2026-06-15'), getUsage, MOCK_SNAPSHOT);
    expect(result.length).toBe(1);
    expect(result[0]!.week).toMatch(/^\d{4}-W\d{2}$/);
  });

  test('multiple weeks return multiple entries sorted by week', () => {
    // Use a cross-week range: W25 (Jun 15-21) and W26 (Jun 22-28)
    const crossWeekBuckets = {
      yefan: [
        { day: '2026-06-15', total: 1000, input: 600, output: 300, cacheRead: 100 }, // W25
        { day: '2026-06-22', total: 2000, input: 1200, output: 600, cacheRead: 200 }, // W26
      ],
      shihao: [],
      anmaioyi: [],
    } as Partial<Record<AgentId, Array<{ day: string; total: number; input: number; output: number; cacheRead: number }>>>;
    const result = aggregateCostWeekly(makeRange('2026-06-15', '2026-06-28'), (id) => crossWeekBuckets[id] ?? [], MOCK_SNAPSHOT);
    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.week.localeCompare(result[i]!.week)).toBeLessThanOrEqual(0);
    }
  });

  test('week range edge: buckets on boundary days included', () => {
    // 2026-06-17 is a Wednesday — test that it falls into the correct week
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-17', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostWeekly(makeRange('2026-06-17', '2026-06-17'), getUsage, MOCK_SNAPSHOT);
    expect(result.length).toBe(1);
    // Verify week key format
    expect(result[0]!.week).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ─── aggregateCostMonthly ─────────────────────────────────────────────────────

describe('aggregateCostMonthly', () => {
  test('empty data returns empty array', () => {
    const result = aggregateCostMonthly(makeRange('2026-06-01', '2026-06-30'), () => [], () => []);
    expect(result).toEqual([]);
  });

  test('single month returns one entry', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-16', total: 1000, input: 600, output: 300, cacheRead: 100 }]
        : [];
    const result = aggregateCostMonthly(makeRange('2026-06-16', '2026-06-16'), getUsage, MOCK_SNAPSHOT);
    expect(result.length).toBe(1);
    expect(result[0]!.month).toBe('2026-06');
  });

  test('cross-month range returns separate entries', () => {
    const crossMonthBuckets = {
      yefan: [
        { day: '2026-06-30', total: 1000, input: 600, output: 300, cacheRead: 100 },
        { day: '2026-07-01', total: 2000, input: 1200, output: 600, cacheRead: 200 },
      ],
      shihao: [],
      anmaioyi: [],
    } as Partial<Record<AgentId, Array<{ day: string; total: number; input: number; output: number; cacheRead: number }>>>;
    const result = aggregateCostMonthly(makeRange('2026-06-25', '2026-07-05'), (id) => crossMonthBuckets[id] ?? [], MOCK_SNAPSHOT);
    expect(result.length).toBe(2);
    const months = result.map(r => r.month).sort();
    expect(months).toEqual(['2026-06', '2026-07']);
  });

  test('month range edge: partial month coverage', () => {
    const getUsage = (id: AgentId) =>
      id === 'yefan'
        ? [{ day: '2026-06-01', total: 100, input: 60, output: 30, cacheRead: 10 }]
        : [];
    const result = aggregateCostMonthly(makeRange('2026-06-01', '2026-06-01'), getUsage, MOCK_SNAPSHOT);
    expect(result.length).toBe(1);
    expect(result[0]!.month).toBe('2026-06');
    expect(result[0]!.cost).toBeGreaterThan(0);
  });
});

// ─── READ-ONLY invariant ─────────────────────────────────────────────────────

describe('READ-ONLY invariant', () => {
  test('aggregateCostByProvider does not mutate snapshot input', () => {
    const snapshot = MOCK_SNAPSHOT();
    const before = JSON.stringify(snapshot);
    aggregateCostByProvider(makeRange('2026-06-15', '2026-06-17'), (id) => MOCK_BUCKETS[id] ?? [], () => snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  test('aggregateCostByAgent does not mutate snapshot input', () => {
    const snapshot = MOCK_SNAPSHOT();
    const before = JSON.stringify(snapshot);
    aggregateCostByAgent(makeRange('2026-06-15', '2026-06-17'), (id) => MOCK_BUCKETS[id] ?? [], () => snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
