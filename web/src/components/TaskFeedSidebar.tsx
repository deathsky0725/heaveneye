import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { KanbanEventEntry } from '../types';

const KIND_ICON: Record<KanbanEventEntry['kind'], string> = {
  claimed:    '⚡',
  completed:  '✓',
  blocked:    '⏸',
  decomposed: '📋',
  spawned:    '🔧',
  heartbeat: '💓',
  unblocked:  '▶️',
};

const KIND_LABEL: Record<KanbanEventEntry['kind'], string> = {
  claimed:    'claimed',
  completed:  'completed',
  blocked:    'blocked',
  decomposed: 'decomposed',
  spawned:    'spawned',
  heartbeat:  'heartbeat',
  unblocked:  'unblocked',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-TH', { day: 'numeric', month: 'short' });
}

// Map agent id → color for tint (matches agent.color)
const AGENT_COLOR: Record<string, string> = {
  ziyue:    '#a78bfa',
  anmaioyi: '#60a5fa',
  wenshu:   '#34d399',
  yanxin:   '#fbbf24',
  jianfeng: '#f87171',
  shihao:   '#e879f9',
  yefan:    '#38bdf8',
};

interface EventRowProps {
  event: KanbanEventEntry;
  isExpanded: boolean;
  onToggle: () => void;
  agentColor: string;
}

function EventRow({ event, isExpanded, onToggle, agentColor }: EventRowProps) {
  const icon = KIND_ICON[event.kind] ?? '•';
  const truncated = (event.task_title ?? event.task_id).slice(0, 32);

  return (
    <div
      className={`rounded-lg border transition-colors cursor-pointer ${
        isExpanded ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-800/40 border-slate-700/40 hover:border-slate-600'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: agentColor }}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 p-2.5">
        {/* Icon */}
        <span className="text-base shrink-0" aria-hidden="true">{icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium text-slate-200 truncate">{truncated}</span>
            <span className="text-xs text-slate-500 shrink-0">{formatRelativeTime(event.ts)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: `${agentColor}22`, color: agentColor }}
            >
              {KIND_LABEL[event.kind]}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded payload */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/40">
          <div className="text-xs text-slate-400 mb-1">task_id: <span className="text-slate-300">{event.task_id}</span></div>
          {event.payload && Object.keys(event.payload).length > 0 && (
            <pre className="text-xs text-slate-400 bg-slate-900/60 rounded p-2 mt-1 overflow-auto max-h-40">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'errors' | 'blocks';

export function TaskFeedSidebar() {
  const events = useStore((s) => s.events);
  const [expanded, setExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSeenTs, setLastSeenTs] = useState<string>(() => {
    return localStorage.getItem('feedLastSeenTs') ?? new Date(0).toISOString();
  });
  const listRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(true);

  // Mark all as read when user opens the feed
  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem('feedLastSeenTs', now);
    setLastSeenTs(now);
  };

  // Auto-scroll to top when new events arrive (only if user hasn't scrolled up)
  useEffect(() => {
    if (isAtTopRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    } else if (events.length > 0 && !isAtTopRef.current) {
      setPendingCount((c) => c + 1);
    }
  }, [events.length]);

  // Track scroll position
  const handleScroll = () => {
    if (!listRef.current) return;
    isAtTopRef.current = listRef.current.scrollTop < 50;
    if (isAtTopRef.current) setPendingCount(0);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    isAtTopRef.current = true;
    setPendingCount(0);
  };

  const filtered = events.filter((ev) => {
    if (filter === 'errors') return ev.kind === 'blocked';
    if (filter === 'blocks') return ev.kind === 'blocked';
    return true;
  });

  const unreadCount = events.filter((ev) => ev.ts > lastSeenTs).length;

  // Auto-mark as read when feed is expanded
  useEffect(() => {
    if (expanded && unreadCount > 0) markAllRead();
  }, [expanded]);

  return (
    <>
      {/* Expanded drawer */}
      {expanded && (
        <div className="fixed left-0 top-0 bottom-0 w-[360px] z-40 flex flex-col bg-slate-900/98 border-r border-slate-700/60 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span className="text-sm font-semibold text-slate-200">Feed</span>
              <span className="text-xs text-slate-500">{events.length} events</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-slate-400 hover:text-slate-200 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40">
            {(['all', 'errors', 'blocks'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'errors' ? 'Errors' : 'Blocks'}
              </button>
            ))}
          </div>

          {/* New events button */}
          {pendingCount > 0 && (
            <button
              onClick={scrollToTop}
              className="mx-4 mt-2 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <span>↓</span> New {pendingCount} event{pendingCount > 1 ? 's' : ''}
            </button>
          )}

          {/* Event list */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 flex flex-col gap-2"
          >
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                <span className="text-2xl mb-1">✓</span>
                <span className="text-sm">No events</span>
              </div>
            ) : (
              filtered.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  isExpanded={expandedIds.has(ev.id)}
                  onToggle={() => toggleExpand(ev.id)}
                  agentColor={AGENT_COLOR[ev.agent] ?? '#94a3b8'}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Collapsed tab — left side */}
      {!expanded && (
        <div className="hidden sm:block">
        <button
          onClick={() => setExpanded(true)}
          className="fixed left-4 bottom-20 sm:bottom-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-1 px-2 py-3 rounded-r-xl bg-slate-800/90 border border-l-0 border-slate-700/60 shadow-lg hover:bg-slate-700 transition-colors"
          title="Open Feed"
        >
          <span className="text-base">📋</span>
          <span className="text-[10px] text-slate-300 font-medium rotate-180 writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
            Feed
          </span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full text-[10px] font-bold text-white bg-rose-500 shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
      )}
    </>
  );
}