/**
 * remoteAlertSettings.ts — L3 Remote Alert Settings persistence.
 *
 * Stores per-event-type Discord/Tauri toggles from RemoteAlertSettings UI.
 * Persisted at ~/.heaveneye/remote-alert-settings.json
 *
 * Mirrors the RemoteAlertConfig interface from the frontend component.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOME } from '../config.ts';

export interface RemoteAlertToggles {
  cap80Discord: boolean;
  cap80Tauri: boolean;
  cap90Discord: boolean;
  cap90Tauri: boolean;
  stuckDiscord: boolean;
  stuckTauri: boolean;
  parkedDiscord: boolean;
  parkedTauri: boolean;
}

export interface RemoteAlertThresholds {
  capPercent: number;
  stuckMinutes: number;
}

export interface RemoteAlertConfig {
  toggles: RemoteAlertToggles;
  thresholds: RemoteAlertThresholds;
}

const DEFAULT_CONFIG: RemoteAlertConfig = {
  toggles: {
    cap80Discord: true,
    cap80Tauri: false,
    cap90Discord: true,
    cap90Tauri: false,
    stuckDiscord: true,
    stuckTauri: false,
    parkedDiscord: true,
    parkedTauri: false,
  },
  thresholds: {
    capPercent: 80,
    stuckMinutes: 25,
  },
};

const CONFIG_DIR = `${HOME}/.heaveneye`;
const CONFIG_PATH = resolve(CONFIG_DIR, 'remote-alert-settings.json');

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readRemoteAlertSettings(): RemoteAlertConfig {
  try {
    ensureDir();
    if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RemoteAlertConfig>;
    return {
      toggles: { ...DEFAULT_CONFIG.toggles, ...parsed.toggles },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeRemoteAlertSettings(
  updates: Partial<RemoteAlertConfig>,
): { ok: true } | { ok: false; error: string } {
  try {
    ensureDir();
    const current = readRemoteAlertSettings();
    const updated: RemoteAlertConfig = {
      toggles: { ...current.toggles, ...(updates.toggles ?? {}) },
      thresholds: { ...current.thresholds, ...(updates.thresholds ?? {}) },
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Map alert type → toggle key for Discord */
export function discordToggleForType(
  type: AlertEntryType,
): keyof RemoteAlertToggles | null {
  switch (type) {
    case 'cap_80': return 'cap80Discord';
    case 'cap_90': return 'cap90Discord';
    case 'stuck_agent': return 'stuckDiscord';
    case 'parked_card': return 'parkedDiscord';
    default: return null;
  }
}

/** Map alert type → toggle key for Tauri */
export function tauriToggleForType(
  type: AlertEntryType,
): keyof RemoteAlertToggles | null {
  switch (type) {
    case 'cap_80': return 'cap80Tauri';
    case 'cap_90': return 'cap90Tauri';
    case 'stuck_agent': return 'stuckTauri';
    case 'parked_card': return 'parkedTauri';
    default: return null;
  }
}

type AlertEntryType = 'cap_80' | 'cap_90' | 'stuck_agent' | 'epic_done' | 'parked_card';
