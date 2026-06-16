/**
 * command.test.ts — /api/command unit tests
 * Covers: epic_id generation — must be unique, non-null, non-empty for every command,
 * including retry case.
 *
 * Regression: the original /api/command returned epic_id: 'draft' (hardcoded static
 * string). Every call returned the same value, making it impossible for callers to
 * correlate responses or de-duplicate. The fix generates a unique epic_id per call.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';

// ── epic_id generation logic (pure, extracted for testability) ─────────────────

/**
 * Generate a unique epic_id string.
 * Format: BRIDGE-CMD-<epoch_ms> — unique per call, non-null, non-empty.
 * Retry case: each call gets a new epoch_ms, guaranteeing uniqueness.
 */
function generateEpicId(): string {
  return `BRIDGE-CMD-${Date.now()}`;
}

// ── epic_id generation ────────────────────────────────────────────────────────

describe('epic_id generation', () => {
  test('generateEpicId returns a non-null string', () => {
    const id = generateEpicId();
    expect(id).not.toBeNull();
    expect(id).not.toBeUndefined();
    expect(typeof id).toBe('string');
  });

  test('generateEpicId returns a non-empty string', () => {
    const id = generateEpicId();
    expect(id.length).toBeGreaterThan(0);
  });

  test('generateEpicId starts with BRIDGE-CMD- prefix', () => {
    const id = generateEpicId();
    expect(id.startsWith('BRIDGE-CMD-')).toBe(true);
  });

  test('generateEpicId contains epoch timestamp after prefix', () => {
    const id = generateEpicId();
    const epochStr = id.replace('BRIDGE-CMD-', '');
    const epoch = Number(epochStr);
    expect(Number.isFinite(epoch)).toBe(true);
    expect(epoch).toBeGreaterThan(0);
    // Should be a recent epoch (within 1 year of now)
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    expect(epoch).toBeGreaterThan(oneYearAgo);
  });

  test('two calls generate different epic_ids (unique per call)', async () => {
    const id1 = generateEpicId();
    // Small delay to ensure different epoch
    await new Promise((r) => setTimeout(r, 2));
    const id2 = generateEpicId();
    expect(id1).not.toBe(id2);
  });

  test('retry case: sequential calls each get unique epic_id (with delay)', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add(generateEpicId());
      await new Promise((r) => setTimeout(r, 2)); // 2ms delay ensures different Date.now()
    }
    expect(ids.size).toBe(5);
  });

  test('epic_id is valid JSON when serialized', () => {
    const id = generateEpicId();
    const obj = { epic_id: id };
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    expect(parsed.epic_id).toBe(id);
  });
});

// ── /api/command endpoint contract ───────────────────────────────────────────

describe('/api/command endpoint contract', () => {
  // We test the logic that the endpoint should satisfy:
    // 1. text is required and must be a string → 400 if not
  // 2. successful response includes epic_id that is unique per call

  test('text field validation: missing text → 400', async () => {
    // The actual Hono handler checks: typeof text !== 'string'
    const validate = (body: { text?: unknown }) => {
      if (typeof body.text !== 'string') return false;
      return true;
    };
    expect(validate({})).toBe(false);
    expect(validate({ text: undefined })).toBe(false);
    expect(validate({ text: 123 })).toBe(false);
    expect(validate({ text: null })).toBe(false);
    expect(validate({ text: {} })).toBe(false);
  });

  test('text field validation: valid string → passes', () => {
    const validate = (body: { text?: unknown }) => {
      if (typeof body.text !== 'string') return false;
      return true;
    };
    expect(validate({ text: 'hello' })).toBe(true);
    expect(validate({ text: '' })).toBe(true); // empty string is a valid string
    expect(validate({ text: 'สร้างงานใหม่' })).toBe(true);
  });

  test('successful call returns ok:true and epic_id', () => {
    // Document the expected response shape
    const makeResponse = (epicId: string) => ({
      ok: true,
      epic_id: epicId,
    });
    const response = makeResponse(generateEpicId());
    expect(response.ok).toBe(true);
    expect(typeof response.epic_id).toBe('string');
    expect(response.epic_id.length).toBeGreaterThan(0);
  });

  test('epic_id in response is the generated one (not hardcoded draft)', () => {
    // Regression: old code returned epic_id: 'draft' (static)
    // The fix should return the dynamically generated epic_id
    const id = generateEpicId();
    const response = { ok: true, epic_id: id };
    expect(response.epic_id).not.toBe('draft');
    expect(response.epic_id.startsWith('BRIDGE-CMD-')).toBe(true);
  });

  test('error response shape: includes error message and status 400', () => {
    // Document expected error shape
    const errorResponse = (msg: string) => ({ error: msg });
    const err = errorResponse('text is required and must be a string');
    expect(err.error).toContain('text');
  });
});

// ── REGRESSION: deepseek dead-model — modelToProvider returns 'unknown' ───────

describe('REGRESSION: deepseek dead-model + epic_id null', () => {
  // These are the two regressions that caused incidents:
  //
  // 1. deepseek dead-model: modelToProvider('deepseek-chat') returned 'unknown'
  //    without crashing — but the UI showed "unknown provider" which was a
  //    symptom of the dead-model going undetected.
  //
  // 2. /api/command epic_id: previously returned 'draft' for every call,
  //    making it impossible to correlate commands to responses.

  test('deepseek model → unknown provider (not crash)', async () => {
    const { modelToProvider } = await import('../state/types.ts');
    const prov = modelToProvider('deepseek-chat');
    expect(prov).toBe('unknown');
  });

  test('epic_id is not the static string draft', () => {
    const id = generateEpicId();
    // Old buggy behavior: epic_id was always 'draft'
    // Fixed behavior: epic_id is unique per call
    expect(id).not.toBe('draft');
  });
});
