import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { InboxEntry, Priority } from '../types';

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; pill: string }> = {
  low:    { label: 'Low',    dot: 'bg-slate-400',       pill: 'bg-slate-700 text-slate-300' },
  medium: { label: 'Medium', dot: 'bg-blue-400',        pill: 'bg-blue-900 text-blue-300' },
  high:   { label: 'High',   dot: 'bg-amber-400',       pill: 'bg-amber-900 text-amber-300' },
  normal: { label: 'Normal', dot: 'bg-blue-400',        pill: 'bg-blue-900 text-blue-300' },
  urgent: { label: 'Urgent', dot: 'bg-rose-500 animate-pulse', pill: 'bg-rose-900 text-rose-300' },
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

interface InboxEntryRowProps {
  entry: InboxEntry;
  isFlashing: boolean;
  onFlashDone: () => void;
}

function InboxEntryRow({ entry, isFlashing, onFlashDone }: InboxEntryRowProps) {
  const priority = entry.priority ?? 'medium';
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFlashing || !rowRef.current) return;
    const el = rowRef.current;
    el.classList.add('flash-inbox');
    const t = setTimeout(() => {
      el.classList.remove('flash-inbox');
      onFlashDone();
    }, 900);
    return () => clearTimeout(t);
  }, [isFlashing, onFlashDone]);

  return (
    <div
      ref={rowRef}
      className="flex flex-col gap-1 rounded-lg bg-slate-800/60 p-3 border border-slate-700/50"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-200 truncate">{entry.from}</span>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.pill}`}>
          {cfg.label}
        </span>
      </div>
      {/* Message */}
      <p className="text-sm text-slate-300 leading-relaxed">{entry.message}</p>
      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-xs text-slate-500">{formatRelativeTime(entry.ts)}</span>
        {entry.action_required && (
          <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
            <span>⚡</span>Action required
          </span>
        )}
      </div>
    </div>
  );
}

export function InboxPanel() {
  const inbox = useStore((s) => s.inbox);
  const inboxFlash = useStore((s) => s.inboxFlash);
  const markInboxFlashShown = useStore((s) => s.markInboxFlashShown);
  const [expanded, setExpanded] = useState(false);

  const filteredInbox = inbox.filter(e => e.from !== 'ji-ziyue' && e.event !== 'inbox_init' && e.event !== 'completion');
  const unreadCount = filteredInbox.length;
  const hasUnread = unreadCount > 0;

  return (
    <>
      {/* Fixed panel — bottom right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Expanded list */}
        {expanded && (
          <div className="w-full sm:w-80 max-h-96 overflow-y-auto flex flex-col gap-2 p-3 rounded-t-xl sm:rounded-xl glass-surface sm:bottom-14 bottom-20">{/* Panel header */}
            {/* Panel header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
              <span className="text-sm font-semibold text-slate-200">Inbox</span>
              {hasUnread && (
                <span className="text-xs text-slate-400">{unreadCount} unread</span>
              )}
            </div>

            {/* Empty state */}
            {filteredInbox.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-slate-500">
                <span className="text-2xl mb-1">✓</span>
                <span className="text-sm">Inbox clear</span>
              </div>
            ) : (
              /* Entries — newest last so newest appear at bottom */
              <div className="flex flex-col gap-2">
                {[...filteredInbox].reverse().map((entry, i) => {
                  if (!entry || !entry.ts) return null;
                  const key = `${entry.ts}-${entry.from}-${i}`;
                  return (
                    <InboxEntryRow
                      key={key}
                      entry={entry}
                      isFlashing={inboxFlash === key}
                      onFlashDone={markInboxFlashShown}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`
            relative flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg
            transition-all duration-200 active:scale-95
            ${expanded
              ? 'bg-slate-700 text-slate-200 border border-slate-600'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500'
            }
          `}
        >
          {/* Inbox icon */}
          <span className="text-base">📥</span>
          <span className="text-sm font-medium">{expanded ? 'Close' : 'Inbox'}</span>

          {/* Badge */}
          {hasUnread && !expanded && (
            <span className="
              absolute -top-1.5 -right-1.5
              min-w-[20px] h-5 flex items-center justify-center
              px-1.5 rounded-full text-xs font-bold text-white
              bg-rose-500 shadow-lg
            ">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
}