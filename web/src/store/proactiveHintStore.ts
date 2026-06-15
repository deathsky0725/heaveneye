/**
 * proactiveHintStore.ts — tracks dismissed proactive hint toasts.
 *
 * Keyed by `${event_kind}:${agent}` so each breach type per agent
 * is only shown once (first-occurrence dedup). User can dismiss a
 * specific hint and it won't re-appear for the same breach.
 *
 * Breach keys are never cleared across the session — once dismissed,
 * it stays dismissed. This matches the "don't spam repeats" requirement.
 */

import { create } from 'zustand';
import type { AgentId } from '../types';

export type ProactiveEventKind = 'blocked_task_age' | 'inactivity_timeout' | 'burn_rate_breach';

export interface ProactiveHint {
  key: string;          // "${event_kind}:${agent}"
  eventKind: ProactiveEventKind;
  agent: AgentId;
  message: string;       // Thai text already
  shown: boolean;
}

interface ProactiveHintState {
  hints: ProactiveHint[];
  addHint: (hint: ProactiveHint) => void;
  dismissHint: (key: string) => void;
  isHintDismissed: (eventKind: ProactiveEventKind, agent: AgentId) => boolean;
  markShown: (key: string) => void;
}

export const useProactiveHintStore = create<ProactiveHintState>((set, get) => ({
  hints: [],

  addHint: (hint) => {
    set((s) => ({
      // dedup: don't add if already tracked
      hints: s.hints.some((h) => h.key === hint.key)
        ? s.hints
        : [...s.hints, hint],
    }));
  },

  dismissHint: (key) => {
    set((s) => ({
      hints: s.hints.map((h) =>
        h.key === key ? { ...h, shown: false } : h,
      ),
    }));
  },

  isHintDismissed: (eventKind, agent) => {
    const key = `${eventKind}:${agent}`;
    const hint = get().hints.find((h) => h.key === key);
    return hint !== undefined && !hint.shown;
  },

  markShown: (key) => {
    set((s) => ({
      hints: s.hints.map((h) =>
        h.key === key ? { ...h, shown: false } : h,
      ),
    }));
  },
}));
