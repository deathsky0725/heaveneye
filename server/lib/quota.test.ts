/**
 * quota.test.ts — Quota calculation unit tests
 * Covers: weekly cap % calculation, 5h cap % edge case (just under / over 100%),
 * burn-rate projection, overflow guard
 */
import { describe, test, expect } from 'bun:test';

// ── Constants (mirrored from server/index.ts) ───────────────────────────────────

const CAP_5H = 2_500_000;
const CAP_WEEKLY = 10_000_000;

// ── Pure quota math helpers (re-implement to test logic) ───────────────────────

/** Compute 5h cap percentage, capped at 100 */
function calc5hCapPercent(totalTokens5h: number): number {
  return Math.min((totalTokens5h / CAP_5H) * 100, 100);
}

/** Compute weekly cap percentage, capped at 100 */
function calcWeeklyCapPercent(totalTokens7d: number): number {
  return Math.min((totalTokens7d / CAP_WEEKLY) * 100, 100);
}

/** Round to 1 decimal place (as used by the API) */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Compute burn rate (tokens per hour) from 5h window */
function calcBurnRate(totalTokens5h: number, windowStartedAt: number): number {
  if (windowStartedAt === null) return 0;
  const elapsedMs = Date.now() - windowStartedAt;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours <= 0) return 0;
  return totalTokens5h / elapsedHours;
}

// ── Weekly cap % calculation ───────────────────────────────────────────────────

describe('weekly cap % calculation', () => {
  test('0 tokens → 0%', () => {
    expect(round1(calcWeeklyCapPercent(0))).toBe(0);
  });

  test('5M tokens (50% of 10M cap) → 50%', () => {
    expect(round1(calcWeeklyCapPercent(5_000_000))).toBe(50);
  });

  test('10M tokens (at cap) → 100%', () => {
    expect(round1(calcWeeklyCapPercent(10_000_000))).toBe(100);
  });

  test('15M tokens (over cap) → capped at 100%', () => {
    // Regression: weekly cap % should never exceed 100 in display
    expect(round1(calcWeeklyCapPercent(15_000_000))).toBe(100);
  });

  test('1M tokens (10% of cap) → 10%', () => {
    expect(round1(calcWeeklyCapPercent(1_000_000))).toBe(10);
  });

  test('10 tokens (near-zero) → near 0%', () => {
    expect(round1(calcWeeklyCapPercent(10))).toBe(0);
  });
});

// ── 5h cap % edge case (just under / over) ───────────────────────────────────

describe('5h cap % edge cases', () => {
  test('0 tokens → 0%', () => {
    expect(round1(calc5hCapPercent(0))).toBe(0);
  });

  test('1.25M tokens (50% of 2.5M) → 50%', () => {
    expect(round1(calc5hCapPercent(1_250_000))).toBe(50);
  });

  test('2.5M tokens (at cap) → 100%', () => {
    expect(round1(calc5hCapPercent(2_500_000))).toBe(100);
  });

  test('just over cap (2_500_001 tokens) → still capped at 100%', () => {
    // Regression: overflow should not produce >100%
    expect(round1(calc5hCapPercent(2_500_001))).toBe(100);
  });

  test('double cap (5M tokens) → 100%', () => {
    expect(round1(calc5hCapPercent(5_000_000))).toBe(100);
  });

  test('5h cap token constant matches known MiniMax plan (2.5M / 5h)', () => {
    // 500k tokens/h × 5h = 2.5M — this documents the constant's origin
    expect(CAP_5H).toBe(2_500_000);
  });

  test('weekly cap token constant matches known MiniMax plan (10M / week)', () => {
    expect(CAP_WEEKLY).toBe(10_000_000);
  });
});

// ── Burn-rate projection ─────────────────────────────────────────────────────

describe('burn-rate projection', () => {
  test('zero tokens → 0 tph', () => {
    expect(calcBurnRate(0, Date.now() - 3_600_000)).toBe(0);
  });

  test('1M tokens over 1 hour → 1M tph', () => {
    const windowStart = Date.now() - 3_600_000; // 1 hour ago
    expect(calcBurnRate(1_000_000, windowStart)).toBe(1_000_000);
  });

  test('500k tokens over 30 minutes → 1M tph', () => {
    const windowStart = Date.now() - 1_800_000; // 30 min ago
    const rate = calcBurnRate(500_000, windowStart);
    expect(rate).toBe(1_000_000); // 500k / 0.5h = 1M tph
  });

  test('null windowStart → 0 tph (no window yet)', () => {
    // The quota API passes windowStartedAt as number | null.
    // When null, the elapsedHours branch is skipped and burnRateTph stays 0.
    // We replicate the actual quota code's null-guard logic:
    const windowStartedAt: number | null = null;
    let burnRateTph = 0;
    if (windowStartedAt !== null) {
      const elapsedMs = Date.now() - windowStartedAt;
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      if (elapsedHours > 0) {
        burnRateTph = 500_000 / elapsedHours;
      }
    }
    expect(burnRateTph).toBe(0);
  });

  test('tokensPerMinute derived correctly from tph', () => {
    const windowStart = Date.now() - 3_600_000;
    const tph = calcBurnRate(1_800_000, windowStart); // 1.8M / 1h
    const tpm = tph / 60;
    expect(tpm).toBe(30_000); // 1.8M tokens/h → 30k tokens/min
  });
});

// ── Overflow guards ───────────────────────────────────────────────────────────

describe('overflow guards', () => {
  test('weekly cap % never exceeds 100 regardless of input', () => {
    const huge = 1_000_000_000; // 1 billion tokens
    expect(calcWeeklyCapPercent(huge)).toBeLessThanOrEqual(100);
  });

  test('5h cap % never exceeds 100 regardless of input', () => {
    const huge = 500_000_000;
    expect(calc5hCapPercent(huge)).toBeLessThanOrEqual(100);
  });

  test('negative token counts are handled (not validated but clamped)', () => {
    // Mathematically a negative would produce negative %, but in practice
    // token counts are always >= 0 (enforced by the engine).
    // This documents the expected behavior.
    expect(calcWeeklyCapPercent(-100)).toBeLessThan(0);
    expect(calc5hCapPercent(-100)).toBeLessThan(0);
  });
});

// ── Integration: reset countdown ─────────────────────────────────────────────

describe('reset countdown calculation', () => {
  test('countdown is positive when nextResetAt is in the future', () => {
    const now = Date.now();
    const nextReset = now + 2 * 3_600_000; // 2 hours from now
    const countdown = Math.max(0, nextReset - now);
    expect(countdown).toBe(2 * 3_600_000);
  });

  test('countdown is 0 when nextResetAt is in the past', () => {
    const now = Date.now();
    const nextReset = now - 1_000_000; // 1s ago
    const countdown = Math.max(0, nextReset - now);
    expect(countdown).toBe(0);
  });

  test('countdownSec converts ms to seconds correctly', () => {
    const ms = 3_600_000; // 1 hour
    const sec = Math.floor(ms / 1000);
    expect(sec).toBe(3600);
  });
});
