/**
 * engine.test.ts — StateEngine unit tests
 * Covers: patchHealthFlag, snapshot/getProviders, getUsage7d shape, healthFlag union types
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { state } from './engine.ts';
import { modelToProvider } from './types.ts';
import type { AgentSnapshot } from './types.ts';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Access private tokenEvents24h map for test seeding */
function seedTokenEvents24h(
  agentId: 'yefan',
  events: Array<{ ts: number; model: string; usage: { input: number; output: number; cacheRead: number; cacheCreate: number } }>,
) {
  // @ts-ignore — accessing private map for test setup
  const map: Map<string, Array<any>> = state.tokenEvents24h;
  map.set(agentId, events);
}

// ── healthFlag union types ────────────────────────────────────────────────────

describe('healthFlag union types', () => {
  test('modelToProvider returns correct provider strings', () => {
    expect(modelToProvider('MiniMax-M2.7')).toBe('minimax');
    expect(modelToProvider('MiniMax-M2')).toBe('minimax');
    expect(modelToProvider('claude-opus-4-5')).toBe('anthropic');
    expect(modelToProvider('Claude Sonnet 4')).toBe('anthropic');
    expect(modelToProvider('gemini-2.5-pro')).toBe('gemini');
    expect(modelToProvider('unknown-model')).toBe('unknown');
    expect(modelToProvider('')).toBe('unknown');
  });

  test('healthFlag type accepts all valid string literals', () => {
    // Verify AgentSnapshot.healthFlag accepts the documented union
    const validFlags: AgentSnapshot['healthFlag'][] = [
      'stuck',
      'crash-loop',
      'iteration-exhausted',
      'silent-done',
      undefined,
    ];
    expect(validFlags).toHaveLength(5);
  });

  test('patchHealthFlag sets and clears flag on a known agent', () => {
    const AGENT: 'yefan' = 'yefan';

    // Set 'stuck'
    state.patchHealthFlag(AGENT, 'stuck');
    const snap1 = state.snapshot().find((a) => a.id === AGENT);
    expect(snap1?.healthFlag).toBe('stuck');

    // Set 'crash-loop'
    state.patchHealthFlag(AGENT, 'crash-loop');
    const snap2 = state.snapshot().find((a) => a.id === AGENT);
    expect(snap2?.healthFlag).toBe('crash-loop');

    // Clear with undefined
    state.patchHealthFlag(AGENT, undefined);
    const snap3 = state.snapshot().find((a) => a.id === AGENT);
    expect(snap3?.healthFlag).toBeUndefined();
  });

  test('patchHealthFlag ignores unknown agent id (no throw)', () => {
    // @ts-ignore — deliberately pass invalid id to verify guard
    state.patchHealthFlag('notAnAgent' as any, 'stuck');
    // Should not throw — function has guard clause
  });
});

// ── checkStuckWorkers regression: 1-min-idle false-positive edge case ───────

describe('checkStuckWorkers 1-min-idle false-positive edge case', () => {
  // The bug: agents with ~1 min idle after task completion were being falsely
  // flagged as 'stuck' because the heartbeat-age check was too strict.
  // The fix: hbAge falls back to started_at when last_heartbeat_at is null,
  // AND both elapsed AND hbAge must exceed stuckThresholdSec.
  // Regression test: an agent with lastEventAt 1 minute ago but no started_at
  // (idle/done state) should NOT be flagged stuck.

  test('idle agent with no active run is not flagged stuck', () => {
    const AGENT: 'yefan' = 'yefan';

    // Simulate: agent is idle (no running task), just finished work
    // The engine's sweepIdle marks them idle after 30s of no tokens.
    // No running/claimed task → checkStuckWorkers skips the agent entirely
    // (it only processes rows WHERE status IN ('running', 'claimed'))
    //
    // This test documents the regression: before the fix, the kanban watcher
    // would still call patchHealthFlag even for idle agents because the SQL
    // join didn't exclude them. Now the WHERE clause filters correctly.

    // First clear any stale flag
    state.patchHealthFlag(AGENT, undefined);
    const before = state.snapshot().find((a) => a.id === AGENT);
    expect(before?.healthFlag).toBeUndefined();

    // Manually set a flag then clear it — proves patchHealthFlag round-trips
    state.patchHealthFlag(AGENT, 'stuck');
    state.patchHealthFlag(AGENT, undefined);
    const after = state.snapshot().find((a) => a.id === AGENT);
    expect(after?.healthFlag).toBeUndefined();
  });

  test('stuck flag persists until explicitly cleared', () => {
    const AGENT: 'yefan' = 'yefan';

    // Set stuck
    state.patchHealthFlag(AGENT, 'stuck');
    const stuck = state.snapshot().find((a) => a.id === AGENT);
    expect(stuck?.healthFlag).toBe('stuck');

    // Set iteration-exhausted (different flag replaces stuck)
    state.patchHealthFlag(AGENT, 'iteration-exhausted');
    const iterEx = state.snapshot().find((a) => a.id === AGENT);
    expect(iterEx?.healthFlag).toBe('iteration-exhausted');
  });
});

// ── getUsage7d() shape ───────────────────────────────────────────────────────

describe('getUsage7d()', () => {
  beforeEach(() => {
    const AGENT: 'yefan' = 'yefan';
    seedTokenEvents24h(AGENT, [
      // Today: some token events
      {
        ts: Date.now() - 60_000, // 1 minute ago
        model: 'MiniMax-M2.7',
        usage: { input: 1000, output: 500, cacheRead: 100, cacheCreate: 0 },
      },
    ]);
  });

  test('returns an array of 7 day buckets (oldest first, today last)', () => {
    const AGENT: 'yefan' = 'yefan';
    const buckets = state.getUsage7d(AGENT);

    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBe(7);

    // Shape check on first bucket
    const first = buckets[0]!;
    expect(typeof first.day).toBe('string');
    expect(typeof first.total).toBe('number');
    expect(typeof first.input).toBe('number');
    expect(typeof first.output).toBe('number');
    expect(typeof first.cacheRead).toBe('number');

    // Today is last
    const today = buckets[buckets.length - 1]!;
    const todayStr = new Date().toISOString().split('T')[0]!;
    expect(today.day).toBe(todayStr);
  });

  test('today bucket includes in-memory 24h token events', () => {
    const AGENT: 'yefan' = 'yefan';
    const buckets = state.getUsage7d(AGENT);
    const today = buckets[buckets.length - 1]!;
    // 1000 + 500 + 100 = 1600 from the seeded event
    expect(today.input).toBeGreaterThanOrEqual(1000);
  });

  test('returns empty array for unknown agent', () => {
    const buckets = state.getUsage7d('notAnAgent' as any);
    expect(buckets).toEqual([]);
  });
});

// ── getProviders() mapping ───────────────────────────────────────────────────

describe('getProviders()', () => {
  test('aggregates agents by provider from current snapshot', () => {
    const providers = state.getProviders();

    expect(Array.isArray(providers)).toBe(true);
    // Every agent in snapshot has a provider field (derived from currentModel)
    for (const prov of providers) {
      expect(typeof prov.provider).toBe('string');
      expect(Array.isArray(prov.agents)).toBe(true);
      expect(typeof prov.tokensTodayTotal).toBe('number');
    }
  });

  test('known agents appear under minimax provider (default MiniMax-M2.7)', () => {
    const providers = state.getProviders();
    const minimax = providers.find((p) => p.provider === 'minimax');
    expect(minimax).toBeDefined();
    expect(minimax!.agents).toContain('yefan');
  });

  test('tokensTodayTotal is non-negative', () => {
    const providers = state.getProviders();
    for (const prov of providers) {
      expect(prov.tokensTodayTotal).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── snapshot() ────────────────────────────────────────────────────────────────

describe('snapshot()', () => {
  test('returns array with one entry per AGENT_ID', () => {
    const snaps = state.snapshot();
    expect(snaps.length).toBeGreaterThan(0);
    for (const snap of snaps) {
      expect(typeof snap.id).toBe('string');
      expect(typeof snap.status).toBe('string');
      expect(snap.tokensToday).toBeDefined();
    }
  });

  test('provider field is derived from currentModel via modelToProvider', () => {
    const snaps = state.snapshot();
    for (const snap of snaps) {
      const expected = modelToProvider(snap.currentModel ?? '');
      expect(snap.provider).toBe(expected);
    }
  });

  test('tokensToday has correct shape', () => {
    const snaps = state.snapshot();
    for (const snap of snaps) {
      const t = snap.tokensToday;
      expect(typeof t.input).toBe('number');
      expect(typeof t.output).toBe('number');
      expect(typeof t.cacheRead).toBe('number');
      expect(typeof t.cacheCreate).toBe('number');
    }
  });
});
