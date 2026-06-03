import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const DEDUPE_WINDOW_MS = 2000;

// Track last-seen timestamps per (type, message) so we don't flood the UI when
// the same toast is fired repeatedly (e.g. infinite-loop bugs or polling errors).
const lastSeen = new Map<string, number>();

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'info') => {
    const key = `${type}:${message}`;
    const now = Date.now();
    const prev = lastSeen.get(key) ?? 0;
    if (now - prev < DEDUPE_WINDOW_MS) {
      // Same toast fired too recently — skip to avoid flooding.
      return;
    }
    lastSeen.set(key, now);

    const id = `toast-${now}-${Math.random().toString(36).slice(2)}`;
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id, message, type },
      ].slice(-MAX_TOASTS), // cap at MAX_TOASTS
    }));
    // auto-dismiss
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));