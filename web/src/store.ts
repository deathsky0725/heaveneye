import { create } from 'zustand';
import type { AgentSnapshot, ServerEvent, Usage5hEntry, InboxEntry, KanbanEventEntry, SystemHealth } from './types';

interface State {
  agents: AgentSnapshot[];
  connected: boolean;
  usage5h: Usage5hEntry[];
  inbox: InboxEntry[];
  inboxFlash: string | null; // id of the newly appended entry
  events: KanbanEventEntry[];
  systemHealth: SystemHealth | null;
  apply: (ev: ServerEvent) => void;
  setConnected: (v: boolean) => void;
  setUsage5h: (v: Usage5hEntry[]) => void;
  markInboxFlashShown: () => void;
}

export const useStore = create<State>((set) => ({
  agents: [],
  connected: false,
  usage5h: [],
  inbox: [],
  inboxFlash: null,
  events: [],
  systemHealth: null,
  setConnected: (v) => set({ connected: v }),
  setUsage5h: (v) => set({ usage5h: v }),
  markInboxFlashShown: () => set({ inboxFlash: null }),
  apply: (ev) => {
    if (ev.type === 'snapshot') {
      set({ agents: ev.agents });
    } else if (ev.type === 'patch') {
      set((s) => ({
        agents: s.agents.map((a) => (a.id === ev.agent.id ? ev.agent : a)),
      }));
    } else if (ev.type === 'inbox_append') {
      const key = `${ev.entry.ts}-${ev.entry.from}-${Date.now()}`;
      set((s) => ({ inbox: [...s.inbox, ev.entry], inboxFlash: key }));
    } else if (ev.type === 'inbox_reset') {
      set({ inbox: [], inboxFlash: null });
    } else if (ev.type === 'kanban_event') {
      set((s) => ({ events: [ev.event, ...s.events].slice(0, 500) }));
    } else if (ev.type === 'system_health') {
      set({ systemHealth: ev.health });
    }
  },
}));

export function connectStream() {
  // Vite dev proxy buffers SSE — connect direct to backend in dev to get
  // realtime events. In prod build (`vite build`), same-origin server.
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  let es: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    es = new EventSource(`${base}/api/stream`);
    es.onopen = () => useStore.getState().setConnected(true);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as ServerEvent;
        useStore.getState().apply(ev);
      } catch {}
    };
    es.onerror = () => {
      useStore.getState().setConnected(false);
      // bun --watch restarts the server frequently in dev; auto-reconnect.
      es?.close();
      es = null;
      if (!stopped) retryTimer = setTimeout(open, 1500);
    };
  };

  open();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}

const POLL_INTERVAL_MS = 30_000;

export function startUsage5hPolling() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';

  const poll = async () => {
    try {
      const res = await fetch(`${base}/api/usage/5h`);
      if (!res.ok) return;
      const data = await res.json() as { usage: Usage5hEntry[] };
      useStore.getState().setUsage5h(data.usage);
    } catch {
      // silently ignore — usage panel just doesn't update
    }
  };

  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

export function fetchInitialInbox() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/inbox`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((entries: InboxEntry[]) => useStore.setState({ inbox: entries }))
    .catch(() => { /* inbox stays empty — SSE will append new entries */ });
}

export function fetchInitialEvents() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/events?limit=50`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((data: { events: KanbanEventEntry[] }) => useStore.setState({ events: data.events.reverse() }))
    .catch(() => { /* events stay empty — SSE will prepend new ones */ });
}

export function fetchInitialHealth() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/health`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((health: SystemHealth) => useStore.setState({ systemHealth: health }))
    .catch(() => { /* health stays null — SSE will update */ });
}
