/**
 * AlertConfig — configurable alert thresholds
 * Persisted at ~/.heaveneye/alert-config.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { totalmem } from 'node:os';
import { HOME } from '../config.ts';

export interface AlertThresholds {
  /** RAM usage in bytes — alert if total system RAM exceeds this */
  ramBytes: number;
  /** Task age in ms — alert if a blocked task exceeds this age */
  blockedTaskAgeMs: number;
  /** Agent inactivity in ms — alert if an agent has no events beyond this */
  inactivityTimeoutMs: number;
  /** Maximum tokens burned per minute — alert if exceeded */
  burnRateLimitTokensPerMin: number;
}

export interface AlertConfig {
  thresholds: AlertThresholds;
  /** Whether alerts are enabled at all */
  enabled: boolean;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  ramBytes: Math.floor((totalmem() || 16 * 1024 * 1024 * 1024) * 0.85), // 85% of total system RAM
  blockedTaskAgeMs: 30 * 60 * 1000, // 30 min
  inactivityTimeoutMs: 10 * 60 * 1000, // 10 min
  burnRateLimitTokensPerMin: 50000, // 50k tokens per min
};

const DEFAULT_CONFIG: AlertConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  enabled: true,
};

const CONFIG_DIR = `${HOME}/.heaveneye`;
const CONFIG_PATH = resolve(CONFIG_DIR, 'alert-config.json');

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readAlertConfig(): AlertConfig {
  try {
    ensureDir();
    if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AlertConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      thresholds: {
        ramBytes: parsed.thresholds?.ramBytes ?? DEFAULT_THRESHOLDS.ramBytes,
        blockedTaskAgeMs: parsed.thresholds?.blockedTaskAgeMs ?? DEFAULT_THRESHOLDS.blockedTaskAgeMs,
        inactivityTimeoutMs: parsed.thresholds?.inactivityTimeoutMs ?? DEFAULT_THRESHOLDS.inactivityTimeoutMs,
        burnRateLimitTokensPerMin: parsed.thresholds?.burnRateLimitTokensPerMin ?? DEFAULT_THRESHOLDS.burnRateLimitTokensPerMin,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeAlertConfig(updates: Partial<AlertConfig>): { ok: true } | { ok: false; error: string } {
  try {
    ensureDir();
    const current = readAlertConfig();
    const updated: AlertConfig = {
      enabled: updates.enabled ?? current.enabled,
      thresholds: {
        ramBytes: updates.thresholds?.ramBytes ?? current.thresholds.ramBytes,
        blockedTaskAgeMs: updates.thresholds?.blockedTaskAgeMs ?? current.thresholds.blockedTaskAgeMs,
        inactivityTimeoutMs: updates.thresholds?.inactivityTimeoutMs ?? current.thresholds.inactivityTimeoutMs,
        burnRateLimitTokensPerMin: updates.thresholds?.burnRateLimitTokensPerMin ?? current.thresholds.burnRateLimitTokensPerMin,
      },
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export { DEFAULT_THRESHOLDS, DEFAULT_CONFIG };