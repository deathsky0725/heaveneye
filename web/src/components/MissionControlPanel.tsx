import { useState, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import type { AutopilotData, EpicStage, ParkedCard, RecentActivityEntry } from '../types';

const STAGE_ORDER: EpicStage[] = ['intake', 'card_plan', 'ack', 'cards', 'done'];

const STAGE_TH: Record<EpicStage, string> = {
  intake:     'รับงาน',
  card_plan:  'วางแผน',
  ack:        'รับงาน',
  cards:      'ทำงาน',
  done:       'เสร็จ',
};

const STAGE_PILL: Record<EpicStage, string> = {
  intake:     'bg-slate-600/40 text-slate-300 border-slate-500/30',
  card_plan:  'bg-blue-600/30 text-blue-200 border-blue-500/30',
  ack:        'bg-amber-600/25 text-amber-200 border-amber-500/30',
  cards:      'bg-violet-600/30 text-violet-200 border-violet-500/30',
  done:       'bg-emerald-600/25 text-emerald-200 border-emerald-500/30',
};

const STAGE_DOT: Record<EpicStage, string> = {
  intake:     'bg-slate-400',
  card_plan:  'bg-blue-400',
  ack:        'bg-amber-400',
  cards:      'bg-violet-400',
  done:       'bg-emerald-400',
};

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function QuotaWidget({ qs }: { qs: AutopilotData['quotaState'] }) {
  const prefersReducedMotion = useReducedMotion();
  const status = qs.blocked ? '🔴 ถูกบล็อก'
    : qs.paused_by_gatekeeper ? '🟡 gatekeeper หยุดชั่วคราว'
    : qs.autopilot_enabled ? '🟢 เปิดใช้งาน'
    : '⚪ ปิด';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs min-w-0">
      <span className="font-medium text-slate-200">{status}</span>
      {qs.since && (
        <span className="text-slate-500">since {formatTs(qs.since)}</span>
      )}
      {qs.last_result && (
        <span className="text-slate-500 truncate max-w-32" title={qs.last_result}>
          probe: {qs.last_result}
        </span>
      )}
      {qs.transitions > 0 && (
        <span className="text-slate-600">{qs.transitions} transitions</span>
      )}
    </div>
  );
}

function EpicPipelineRow({ entry }: { entry: AutopilotData['epicPipeline'][number] }) {
  const stageIdx = STAGE_ORDER.indexOf(entry.stage);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
      {/* Stage dots */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {STAGE_ORDER.map((s, i) => (
          <span
            key={s}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= stageIdx ? STAGE_DOT[entry.stage] : 'bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Project + stage pill */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-300 text-xs font-medium truncate">{entry.project}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] flex-shrink-0 ${STAGE_PILL[entry.stage]}`}>
          {STAGE_TH[entry.stage]}
        </span>
      </div>

      {/* Cards */}
      {entry.cards.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-auto">
          {entry.cards.slice(0, 6).map((c) => (
            <span
              key={c.id}
              className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 truncate max-w-[120px]"
              title={c.title}
            >
              {c.title}
            </span>
          ))}
          {entry.cards.length > 6 && (
            <span className="text-[10px] text-slate-600">+{entry.cards.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ParkedCardsList({ cards }: { cards: ParkedCard[] }) {
  if (cards.length === 0) {
    return <p className="text-xs text-slate-600 py-2">ไม่มีงานที่จอดทิ้งไว้</p>;
  }
  return (
    <div className="space-y-1">
      {cards.map((c) => (
        <div key={c.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-800/50 last:border-0">
          <span className="text-amber-500 flex-shrink-0 mt-0.5">●</span>
          <div className="min-w-0">
            <p className="text-slate-300 truncate">{c.title}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{c.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivityList({ events }: { events: RecentActivityEntry[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-600 py-2">ไม่มีกิจกรรมล่าสุด</p>;
  }
  return (
    <div className="space-y-0.5">
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-slate-800/50 last:border-0">
          <span className="text-slate-600 flex-shrink-0 w-16">{formatTs(e.ts)}</span>
          <span className="text-slate-400 w-20 flex-shrink-0 truncate">{e.agent}</span>
          <span className="text-slate-300 flex-shrink-0">{e.action}</span>
          {e.task_title && (
            <span className="text-slate-500 truncate ml-auto">{e.task_title}</span>
          )}
        </div>
      ))}
    </div>
  );
}

interface SectionProps {
  title: string;
  emoji: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, emoji, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-700/50 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-slate-800/30 transition-colors text-left"
      >
        <span className="text-sm">{emoji}</span>
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">{title}</span>
        <span className={`ml-auto text-slate-500 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function MissionControlPanel() {
  const [data, setData] = useState<AutopilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    let cancelled = false;
    fetch(`${base}/api/autopilot`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AutopilotData>;
      })
      .then((d) => {
        if (!cancelled) { setData(d); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="px-6 pb-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-500">โหลด MissionControl...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-6 pb-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">เชื่อมต่อ /api/autopilot ไม่ได้ — ตรวจสอบ backend</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
          <span className="text-sm">🎛️</span>
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">MissionControl</span>
          <div className="ml-auto">
            <QuotaWidget qs={data.quotaState} />
          </div>
        </div>

        {/* Sections */}
        <div>
          <Section title="Epic Pipeline" emoji="🔗" defaultOpen={true}>
            {data.epicPipeline.length === 0 ? (
              <p className="text-xs text-slate-600 py-2">ยังไม่มี epic ในระบบ</p>
            ) : (
              data.epicPipeline.map((entry) => (
                <EpicPipelineRow key={entry.id} entry={entry} />
              ))
            )}
          </Section>

          <Section title={`Parked (${data.parkedCards.length})`} emoji="🅿️" defaultOpen={false}>
            <ParkedCardsList cards={data.parkedCards} />
          </Section>

          <Section title={`Recent Activity (${data.recentActivity.length})`} emoji="📋" defaultOpen={false}>
            <RecentActivityList events={data.recentActivity} />
          </Section>
        </div>
      </div>
    </div>
  );
}
