import { useStore } from '../store';
import type { NotificationEntry } from '../types';

const PROFILE_LABEL: Record<string, string> = {
  anmaioyi: 'เมี่ยวอี',
  wenshu:   'เหวินซู',
  yanxin:   'เหยียนซิน',
  jianfeng: 'เจี้ยนเฟิง',
  shihao:   'สือฮ่าว',
  yefan:    'เย่ฝาน',
};

function relativeTime(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (isNaN(ms) || ms < 0) return '?';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DiscordMessagePreview({ entry, agentLabel }: { entry: NotificationEntry; agentLabel: string }) {
  return (
    <div className="bg-slate-800 rounded-md px-3 py-2 text-xs mt-1 border-l-2 border-indigo-500">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-medium text-indigo-300">{agentLabel}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-400">{entry.task_title ?? entry.task_id}</span>
      </div>
      <div className="text-slate-200 leading-relaxed">{entry.message}</div>
    </div>
  );
}

// DEMO MODE — remove once backend sends notification events
const DEMO_NOTIFICATION = {
  id: 1,
  ts: new Date(Date.now() - 90_000).toISOString(), // "2m ago"
  platform: 'discord' as const,
  chat_id: '123456789',
  task_id: 't_demo123',
  task_title: 'W2 — Frontend: DiscordPanel component',
  event_kind: 'notification',
  agent: 'shihao' as const,
  message: '✅ DiscordPanel component shipped with SSE notification handling and 50-entry cap.',
};
// Uncomment to test: notifications = [DEMO_NOTIFICATION];
// END DEMO

export function DiscordPanel() {
  const notifications = useStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg bg-slate-900/60 border border-slate-700/50 p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-slate-200">💬 Discord</span>
        <span className="text-xs text-slate-500">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {notifications.map((entry: NotificationEntry) => {
          const agentLabel = PROFILE_LABEL[entry.agent] ?? entry.agent;
          return (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="text-sm mt-0.5 shrink-0">💬</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{relativeTime(entry.ts)}</span>
                  <span>·</span>
                  <span className="font-medium text-slate-300">{agentLabel}</span>
                  <span>·</span>
                  <span className="text-slate-500 truncate">{entry.task_title ?? entry.task_id}</span>
                </div>
                <DiscordMessagePreview entry={entry} agentLabel={agentLabel} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}