import { useState } from 'react';
import { useStore } from '../store';
import { GatewayButton } from './GatewayButton';

const PROFILE_LABEL: Record<string, string> = {
  anmaioyi: 'เมี่ยวอี',
  wenshu:   'เหวินซู',
  yanxin:   'เหยียนซิน',
  jianfeng: 'เจี้ยนเฟิง',
  shihao:   'สือฮ่าว',
  yefan:    'เย่ฝาน',
};

function uptimeStr(startedAt: string | null): string {
  if (!startedAt) return '';
  const ms = Date.now() - new Date(startedAt).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${m % 60}m`;
  return `${m}m`;
}

export function SystemHealth() {
  const health = useStore((s) => s.systemHealth);
  const [expanded, setExpanded] = useState(false);

  if (!health || health.gateways.length === 0) {
    return null;
  }

  const downCount = health.gateways.filter((g) => !g.alive).length;
  const upCount = health.gateways.filter((g) => g.alive).length;
  const allHealthy = downCount === 0;

  return (
    <div className="mb-4 rounded-lg bg-slate-900/60 border border-slate-700/50 p-2 text-xs overflow-x-auto">
      <div className="min-w-[480px]">
        <button
          className="w-full flex items-center gap-3 hover:bg-slate-800/40 rounded px-2 py-1 transition"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse' : 'Expand details'}
        >
          <span className={`w-2 h-2 rounded-full ${allHealthy ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`} />
          <span className="font-medium text-slate-200 shrink-0">
            {allHealthy
              ? 'All gateways healthy'
              : `${upCount} up · ${downCount} down`}
          </span>
          <div className="flex items-center gap-1 flex-wrap ml-2">
            {health.gateways.map((g) => (
              <span
                key={g.profile}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  g.alive ? 'bg-emerald-900/40 text-emerald-300' : 'bg-rose-900/40 text-rose-300'
                }`}
                title={g.alive ? `pid ${g.pid} · up ${uptimeStr(g.startedAt)}` : 'down'}
              >
                {g.alive ? '🟢' : '🔴'} {PROFILE_LABEL[g.profile] ?? g.profile}
              </span>
            ))}
          </div>
          <span className="ml-auto text-slate-500 text-[10px] shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
        </button>

        {expanded && (
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 px-2">
            {health.gateways.map((g) => (
              <div key={g.profile} className="rounded bg-slate-800/40 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-200">{PROFILE_LABEL[g.profile] ?? g.profile}</span>
                  <span className={`text-[10px] ${g.alive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {g.alive ? 'alive' : 'down'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mb-2">
                  {g.alive ? (
                    <>
                      pid {g.pid}<br />
                      up {uptimeStr(g.startedAt)}<br />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="w-8">CPU:</span>
                        <div className="flex-1 bg-slate-700 h-1 rounded overflow-hidden">
                          <div className="bg-blue-400 h-full transition-all duration-300" style={{ width: `${Math.min(100, g.cpuPercent ?? 0)}%` }} />
                        </div>
                        <span className="w-8 text-right font-semibold text-blue-300">{(g.cpuPercent ?? 0).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-8">RAM:</span>
                        <div className="flex-1 bg-slate-700 h-1 rounded overflow-hidden">
                          <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${Math.min(100, ((g.ramBytes ?? 0) / (256 * 1024 * 1024)) * 100)}%` }} />
                        </div>
                        <span className="w-14 text-right font-semibold text-emerald-300">{((g.ramBytes ?? 0) / (1024 * 1024)).toFixed(0)} MB</span>
                      </div>
                    </>
                  ) : 'no process found'}
                </div>
                <GatewayButton profile={g.profile} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}