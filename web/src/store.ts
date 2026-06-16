import { create } from 'zustand';
import type { AgentId, AgentSnapshot, ServerEvent, Usage5hEntry, InboxEntry, KanbanEventEntry, SystemHealth, NotificationEntry, CrashNotificationEntry } from './types';
import type { ActivityEvent } from './components/RiveAvatar';
import { useToastStore } from './store/toastStore';
import { useProactiveHintStore, type ProactiveEventKind } from './store/proactiveHintStore';

const PROACTIVE_KINDS: ProactiveEventKind[] = ['blocked_task_age', 'inactivity_timeout', 'burn_rate_breach'];

function buildProactiveMessage(eventKind: ProactiveEventKind, agent: AgentId, taskTitle?: string): string {
  switch (eventKind) {
    case 'blocked_task_age':
      return taskTitle
        ? `👁️ งาน "${taskTitle}" ติดบล็อกมานาน — ลองดูที่ anmaioyi`
        : `👁️ งานบางตัวติดบล็อกมานาน — ลองดูที่ anmaioyi`;
    case 'inactivity_timeout':
      return `⏰ Agent ${agent} หยุดนิ่งมาหลายนาทีแล้ว — ลองดูที่ anmaioyi`;
    case 'burn_rate_breach':
      return `🚨 ${agent} ใช้โทเค็นสูงผิดปกติ — ลองดูที่ anmaioyi`;
  }
}

function fireProactiveHint(entry: NotificationEntry): void {
  if (!PROACTIVE_KINDS.includes(entry.event_kind as ProactiveEventKind)) return;
  const eventKind = entry.event_kind as ProactiveEventKind;
  const key = `${eventKind}:${entry.agent}`;
  const store = useProactiveHintStore.getState();
  if (store.isHintDismissed(eventKind, entry.agent)) return;
  store.addHint({ key, eventKind, agent: entry.agent, message: buildProactiveMessage(eventKind, entry.agent, entry.task_title), shown: true });
  useToastStore.getState().addToast(buildProactiveMessage(eventKind, entry.agent, entry.task_title), 'warning');
}

interface State {
  agents: AgentSnapshot[];
  connected: boolean;
  usage5h: Usage5hEntry[];
  inbox: InboxEntry[];
  inboxFlash: string | null;
  events: KanbanEventEntry[];
  systemHealth: SystemHealth | null;
  notifications: NotificationEntry[];
  crashNotifications: CrashNotificationEntry[];
  crashNotificationLastChecked: number;
  killError: string | null;
  killSuccess: string | null;
  detailPanelId: AgentId | null;
  // Particle burst triggers — keyed by edge id (e.g. "ziyue-anmaioyi")
  activeParticleBursts: Record<string, number>;
  // Per-agent activity event triggers — set by SSE event handlers
  activityTriggers: Record<string, { ts: number; event: ActivityEvent }>;
  triggerActivity: (agentId: AgentId, event: ActivityEvent) => void;
  apply: (ev: ServerEvent) => void;
  setConnected: (v: boolean) => void;
  setUsage5h: (v: Usage5hEntry[]) => void;
  markInboxFlashShown: () => void;
  killAgent: (id: string) => Promise<{ killed: boolean; pid: number | null; signal: string }>;
  clearKillFeedback: () => void;
  openDetailPanel: (id: AgentId) => void;
  closeDetailPanel: () => void;
  triggerParticleBurst: (edgeId: string) => void;
  addCrashNotifications: (entries: CrashNotificationEntry[]) => void;
  dispatchTauriNotification: (entry: CrashNotificationEntry) => Promise<void>;
  selectedBoard: string;
  setSelectedBoard: (board: string) => void;
}

// Maps receiving agent → edge id used by DataFlowParticles
// Must match EDGES in ConnectionLines.tsx and DataFlowParticles.tsx
const INBOUND_EDGE_MAP: Record<string, string> = {
  anmaioyi:  'ziyue-anmaioyi',
  wenshu:    'anmaioyi-wenshu',
  yanxin:    'anmaioyi-yanxin',
  jianfeng:  'anmaioyi-jianfeng',
  shihao:    'anmaioyi-shihao',
  yefan:     'anmaioyi-yefan',
};

export const useStore = create<State>((set, get) => ({
  agents: [],
  connected: false,
  usage5h: [],
  inbox: [],
  inboxFlash: null,
  events: [],
  systemHealth: null,
  notifications: [],
  crashNotifications: [],
  crashNotificationLastChecked: 0,
  killError: null,
  killSuccess: null,
  detailPanelId: null,
  activeParticleBursts: {},
  activityTriggers: {} as Record<string, { ts: number; event: ActivityEvent }>,
  setConnected: (v) => set({ connected: v }),
  setUsage5h: (v) => set({ usage5h: v }),
  markInboxFlashShown: () => set({ inboxFlash: null }),
  clearKillFeedback: () => set({ killError: null, killSuccess: null }),
  openDetailPanel: (id) => set({ detailPanelId: id }),
  closeDetailPanel: () => set({ detailPanelId: null }),
  triggerParticleBurst: (edgeId) => {
    const BURST_DURATION_MS = 1200;
    set((s) => ({
      activeParticleBursts: { ...s.activeParticleBursts, [edgeId]: Date.now() + BURST_DURATION_MS },
    }));
  },
  triggerActivity: (agentId, event) => {
    set((s) => ({
      activityTriggers: { ...s.activityTriggers, [agentId]: { ts: Date.now(), event } },
    }));
  },
  selectedBoard: 'heaveneye-ui',
  setSelectedBoard: (board) => set({ selectedBoard: board }),
  addCrashNotifications: (entries) => {
    set((s) => ({
      crashNotifications: [...s.crashNotifications, ...entries].slice(-50),
      // Advance cursor to the latest event ts so the backend won't re-send these
      crashNotificationLastChecked: Math.max(...entries.map((e) => e.ts)),
    }));
  },
  dispatchTauriNotification: async (entry) => {
    if (typeof (window as any).__TAURI__ === 'undefined') return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_notification', { title: entry.title, body: entry.body });
    } catch (e) {
      console.warn('[store] dispatchTauriNotification failed:', e);
    }
  },
  killAgent: async (id) => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    const toast = useToastStore.getState().addToast;
    try {
      const res = await fetch(`${base}/api/agent/${id}/kill`, { method: 'POST' });
      const data = await res.json() as { killed: boolean; pid: number | null; signal: string };
      if (data.killed) {
        set({ killSuccess: `Worker PID ${data.pid} killed (signal ${data.signal})`, killError: null });
        toast(`Worker ${data.pid} killed`, 'success');
      } else {
        set({ killError: 'No active worker found for this agent', killSuccess: null });
        toast('No active worker found', 'warning');
      }
      return data;
    } catch {
      set({ killError: 'Failed to reach server', killSuccess: null });
      toast('Failed to reach server', 'error');
      return { killed: false, pid: null, signal: 'none' };
    }
  },
  apply: (ev) => {
    if (ev.type === 'snapshot') {
      set({ agents: ev.agents });
    } else if (ev.type === 'patch') {
      const prev = get().agents.find((a) => a.id === ev.agent.id);
      const wasInactive = !prev || (prev.status !== 'working' && prev.status !== 'thinking');
      const isNowActive  = ev.agent.status === 'working' || ev.agent.status === 'thinking';
      if (wasInactive && isNowActive) {
        const inboundEdge = INBOUND_EDGE_MAP[ev.agent.id];
        if (inboundEdge) get().triggerParticleBurst(inboundEdge);
      }
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
    } else if (ev.type === 'notification') {
      set((s) => ({ notifications: [ev.entry, ...s.notifications].slice(0, 50) }));
      fireProactiveHint(ev.entry);
    } else if (ev.type === 'agent_activity') {
      useStore.getState().triggerActivity(ev.agentId, ev.event as ActivityEvent);
    }
  },
}));

export function connectStream() {
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
    } catch { /* silently ignore */ }
  };
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

export function fetchInitialInbox() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/inbox`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((entries: InboxEntry[]) => useStore.setState({ inbox: entries }))
    .catch(() => {});
}

export function fetchInitialEvents() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/events?limit=50`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((data: { events: KanbanEventEntry[] }) => useStore.setState({ events: data.events.reverse() }))
    .catch(() => {});
}

export function fetchInitialHealth() {
  const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
  fetch(`${base}/api/health`)
    .then((res) => res.ok ? res.json() : Promise.reject())
    .then((health: SystemHealth) => useStore.setState({ systemHealth: health }))
    .catch(() => {});
}
