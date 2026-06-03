import { useState, useEffect } from 'react';
import type { CostApiResponse, CostAgentEntry } from '../types';

function formatCost(n: number): string {
  if (n < 0.01) return '$0.00';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function sparkline(values: number[], w = 80, h = 24): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return pts.join(' ');
}

interface ModelRow {
  agent: string;
  model: string;
  costToday: number;
  cost7d: number;
}

export function CostPanel() {
  const [data, setData] = useState<CostApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/cost`)
      .then((r) => r.json())
      .then((d: CostApiResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-slate-500 px-6 py-2">
        โหลดข้อมูลค่าใช้จ่าย...
      </div>
    );
  }

  if (!data) return null;

  const { agents, aggregate } = data;
  const { costToday, costWeek, trend7d } = aggregate;

  return (
    <div className="px-6 pb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            💸 Cost
          </span>
          <div className="flex items-center gap-4 text-xs ml-auto">
            <div>
              <span className="text-slate-400">วันนี้</span>{' '}
              <span className="font-medium text-slate-200">{formatCost(costToday)}</span>
            </div>
            <div>
              <span className="text-slate-400">7 วัน</span>{' '}
              <span className="font-medium text-slate-200">{formatCost(costWeek)}</span>
            </div>
          </div>
        </div>

        {/* 7-day sparkline */}
        {trend7d.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-slate-500 mb-1">trend 7 วัน</div>
            <svg width="100" height="28" className="block">
              <polyline
                points={sparkline(trend7d, 100, 24)}
                fill="none"
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* Per-agent table */}
        <div className="space-y-1">
          {agents.map((entry: CostAgentEntry) => (
            <div key={entry.agent} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-slate-400 truncate">{entry.agent}</span>
              <span className="w-24 text-slate-500 truncate text-[10px]">{entry.model}</span>
              <span className="text-slate-300 font-medium">
                {formatCost(entry.costToday)}
              </span>
              <span className="text-slate-500">
                / {formatCost(entry.cost7d)} (7d)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}