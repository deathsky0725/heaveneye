import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentId, AgentSnapshot, AgentStatus, NotificationEntry, RelayStatus } from '../types';
import { useStore } from '../store';
import { StatChart } from './StatChart';
import { RiveAvatar } from './RiveAvatar';

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle:     'ว่าง',
  thinking: 'กำลังคิด',
  working:  'กำลังทำงาน',
  done:     'เสร็จแล้ว',
  failed:   'ล้มเหลว',
  blocked:  '🛡 รอ review',
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle:     'bg-slate-500',
  thinking: 'bg-amber-400 animate-pulse',
  working:  'bg-emerald-400 animate-pulse',
  done:     'bg-cyan-400',
  failed:   'bg-rose-500',
  blocked:  'bg-amber-400',
};

interface ToolEntry { tool: string; count: number; }
interface SessionEntry { session_id: string; start_ts: string; end_ts: string | null; total_events: number; total_tokens: number; }
interface CurrentSession { session_id: string; started_at: string; events_count: number; tokens_so_far: number; }

interface DetailData {
  toolBreakdown: ToolEntry[];
  sessionTimeline: SessionEntry[];
  currentSession: CurrentSession | null;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sessionDuration(start: string, end: string | null): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMs = endMs - startMs;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatToken(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function DetailPanel() {
  const detailPanelId = useStore((s) => s.detailPanelId);
  const closeDetailPanel = useStore((s) => s.closeDetailPanel);
  const agents = useStore((s) => s.agents);
  const openDetailPanel = useStore((s) => s.openDetailPanel);

  const [data, setData] = useState<DetailData | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetailPanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeDetailPanel]);

  // Fetch data when panel opens
  useEffect(() => {
    if (!detailPanelId) {
      setData(null);
      setRelayStatus(null);
      setNotifications([]);
      return;
    }
    setLoading(true);
    setData(null);
    setRelayStatus(null);
    setNotifications([]);
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/agent/${detailPanelId}/detail`)
      .then((r) => r.json())
      .then((d: DetailData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(`${base}/api/agent/${detailPanelId}/relay-status`)
      .then((r) => r.json())
      .then((d: RelayStatus) => setRelayStatus(d))
      .catch(() => {});
    fetch(`${base}/api/notifications?limit=5`)
      .then((r) => r.json())
      .then((entries: NotificationEntry[]) => setNotifications(entries.filter((n) => n.agent === detailPanelId)))
      .catch(() => {});
  }, [detailPanelId]);

  // Click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeDetailPanel();
  }, [closeDetailPanel]);

  if (!detailPanelId) return null;

  const agent = agents.find((a) => a.id === detailPanelId);

  const sortedTools = data ? [...data.toolBreakdown].sort((a, b) => b.count - a.count) : [];
  const maxCount = sortedTools[0]?.count ?? 1;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute top-0 right-0 h-full w-96 max-w-full bg-[#0f1117] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/10">
          {agent && (
            <>
              <RiveAvatar id={agent.id} status={agent.status} color={agent.color} size="md" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate" style={{ color: agent.color }}>{agent.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
                  <span className="text-sm text-slate-200">{STATUS_LABEL[agent.status]}</span>
                </div>
                {agent.currentModel && (
                  <p className="text-xs text-slate-400 mt-0.5">model: {agent.currentModel}</p>
                )}
              </div>
            </>
          )}
          <button
            onClick={closeDetailPanel}
            className="shrink-0 text-slate-400 hover:text-white transition-colors text-xl leading-none p-1"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-5 text-sm text-slate-500">กำลังโหลด...</div>
          )}
          {!loading && !data && detailPanelId && (
            <div className="p-5 text-sm text-slate-500">ไม่มีข้อมูล agent</div>
          )}
          {!loading && data && (
            <>
              {/* Section 1: Tool usage (24h) */}
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">เครื่องมือ (24h)</h3>
                {sortedTools.length === 0 ? (
                  <p className="text-xs text-slate-600">ไม่มีข้อมูล</p>
                ) : (
                  <div className="space-y-2">
                    {sortedTools.map(({ tool, count }) => (
                      <div key={tool} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-20 truncate font-mono">{tool}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Session timeline */}
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Session timeline</h3>
                {data.sessionTimeline.length === 0 ? (
                  <p className="text-xs text-slate-600">ไม่มี session</p>
                ) : (
                  <div className="space-y-2">
                    {data.sessionTimeline.map((s) => (
                      <div key={s.session_id} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 font-mono">{s.session_id.slice(0, 8)}</span>
                          <span className="text-slate-500">{relativeTime(s.start_ts)}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-slate-500">
                          <span>dur: {sessionDuration(s.start_ts, s.end_ts)}</span>
                          <span>tokens: {formatToken(s.total_tokens)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* StatChart 24h */}
                <div className="mt-4">
                  {detailPanelId && <StatChart agentId={detailPanelId} compact />}
                </div>
              </div>

              {/* Section 3: Current session */}
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Current session</h3>
                {data.currentSession ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">session</span>
                      <span className="text-slate-300 font-mono">{data.currentSession.session_id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">started</span>
                      <span className="text-slate-300">{relativeTime(data.currentSession.started_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">events</span>
                      <span className="text-slate-300">{data.currentSession.events_count}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">tokens so far</span>
                      <span className="text-slate-300">{formatToken(data.currentSession.tokens_so_far)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">ไม่มี session ที่กำลังทำงาน</p>
                )}
              </div>

              {/* Section 4: Notification Log */}
              <div className="px-5 py-4">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Notification Log</h3>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-600">ไม่มี notification</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-300 truncate">
                              {n.task_title ?? n.task_id}
                            </span>
                            <span className="text-slate-500 shrink-0">{relativeTime(n.ts)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-slate-500">
                            <span className="truncate">→ {n.chat_id}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-indigo-400">{n.event_kind}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 5: Relay / HM2 Report Status */}
              {relayStatus && (
                <div className="px-5 py-4">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Relay / HM2 Report</h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">pending report</span>
                      <span className={relayStatus.hasPendingReport ? 'text-amber-400' : 'text-emerald-400'}>
                        {relayStatus.hasPendingReport ? '● รอส่ง' : '✓ ไม่มี'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">last relay</span>
                      <span className="text-slate-300">
                        {relayStatus.lastRelayTime ? relativeTime(relayStatus.lastRelayTime) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">relay วันนี้</span>
                      <span className="text-slate-300">{relayStatus.relayCount}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}