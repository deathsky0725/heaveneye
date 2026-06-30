import { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'motion/react';
import type { CostBreakdownResponse } from '../types';

type Range = '7d' | '30d' | '90d' | 'all';

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'all' },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCost(n: number): string {
  if (n < 0.001) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(3)}`;
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatDate(dateStr: string): string {
  // "2025-06-17" → "17/06"
  const [y, m, d] = dateStr.split('-');
  if (!m || !d) return dateStr;
  return `${d}/${m}`;
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+∞' : '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatWeekLabel(weekStr: string): string {
  // "2025-W25" → "W25"
  return weekStr.replace(/^\d{4}-/, 'W');
}

function formatMonthLabel(monthStr: string): string {
  // "2025-06" → "Jun"
  const [y, m] = monthStr.split('-');
  if (!m) return monthStr;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-US', { month: 'short' });
}

// ── Bar chart (inline SVG, no chart lib) ──────────────────────────────────────

function HorizontalBar({
  value,
  max,
  color = 'bg-indigo-500',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-16 text-right shrink-0">{formatCost(value)}</span>
    </div>
  );
}

// Mini trend sparkline for daily data
function Sparkline({ values, color = '#6366f1' }: { values: number[]; color?: string }): string {
  if (values.length === 0) return '';
  const w = 80;
  const h = 28;
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

// ── Provider color map ────────────────────────────────────────────────────────

const PROVIDER_COLOR: Record<string, string> = {
  openrouter: 'bg-indigo-500',
  minimax:    'bg-cyan-500',
  gemini:     'bg-amber-500',
  openai:     'bg-emerald-500',
  anthropic:  'bg-violet-500',
  unknown:    'bg-slate-500',
};

// ── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonBlock({ className = 'h-4' }: { className?: string }) {
  return <div className={`rounded bg-slate-800 animate-pulse ${className}`} />;
}

function LoadingState() {
  return (
    <div className="px-6 mb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        <SkeletonBlock className="h-3 w-24 mb-3" />
        <div className="space-y-2">
          <div className="flex gap-4"><SkeletonBlock className="h-6 w-20" /><SkeletonBlock className="h-6 w-20" /><SkeletonBlock className="h-6 w-20" /></div>
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="px-6 mb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        <span className="text-xs text-rose-400">ไม่สามารถโหลดข้อมูลค่าใช้จ่าย</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CostPanel() {
  const [range, setRange] = useState<Range>('7d');
  const [data, setData] = useState<CostBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const fetchData = useCallback(async (r: Range) => {
    setLoading(true);
    setError(false);
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/cost/breakdown?range=${r}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CostBreakdownResponse = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  // ── Derived totals ──────────────────────────────────────────────────────────

  const latestDaily = data?.daily?.[data.daily.length - 1];
  const prevDaily = data?.daily?.length && data.daily.length > 1
    ? data.daily[data.daily.length - 2]
    : null;

  const weeklyTotal = data?.weekly?.reduce((s, w) => s + w.total_cost, 0) ?? 0;
  const monthlyTotal = data?.monthly?.reduce((s, m) => s + m.total_cost, 0) ?? 0;

  // Per-provider: max for bar scaling
  const providerEntries = data?.per_provider
    ? Object.entries(data.per_provider).sort((a, b) => b[1] - a[1])
    : [];
  const maxProviderCost = providerEntries[0]?.[1] ?? 1;

  // Per-agent: max for bar scaling
  const agentEntries = data?.per_agent
    ? Object.entries(data.per_agent).sort((a, b) => b[1] - a[1])
    : [];
  const maxAgentCost = agentEntries[0]?.[1] ?? 1;

  // Daily trend for sparkline
  const dailyTrend = data?.daily?.map((d) => d.total_cost) ?? [];

  // Latest week/month
  const latestWeek = data?.weekly?.[data.weekly.length - 1];
  const latestMonth = data?.monthly?.[data.monthly.length - 1];

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  return (
    <div className="px-6 mb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">

        {/* Header + range selector */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            💸 Cost
          </span>

          {/* Range pills */}
          <div className="ml-auto flex items-center gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  range === opt.value
                    ? 'bg-indigo-600/40 text-indigo-200 border border-indigo-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Row 1: Daily summary + Weekly + Monthly ────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">

          {/* Daily summary */}
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
            <div className="text-xs text-slate-500 mb-1">วันนี้</div>
            <div className={`text-lg font-semibold text-slate-100 tabular-nums ${!prefersReducedMotion ? 'animate-counter' : ''}`}>
              {formatCost(latestDaily?.total_cost ?? 0)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {latestDaily?.total_tokens != null ? `${formatTokens(latestDaily.total_tokens)} tokens` : '—'}
            </div>
            {prevDaily && (
              <div className={`text-xs mt-1 tabular-nums ${
                (latestDaily?.total_cost ?? 0) >= (prevDaily.total_cost)
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}>
                {formatDelta(latestDaily!.total_cost, prevDaily.total_cost)} vs เมื่อวาน
              </div>
            )}
          </div>

          {/* Weekly total */}
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
            <div className="text-xs text-slate-500 mb-1">
              สัปดาห์นี้ {latestWeek && <span className="text-slate-600">({formatWeekLabel(latestWeek.week)})</span>}
            </div>
            <div className="text-lg font-semibold text-slate-100 tabular-nums">
              {formatCost(weeklyTotal)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {data.weekly.length} สัปดาห์
            </div>
          </div>

          {/* Monthly total */}
          <div className="col-span-2 sm:col-span-1 bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
            <div className="text-xs text-slate-500 mb-1">
              เดือนนี้ {latestMonth && <span className="text-slate-600">({formatMonthLabel(latestMonth.month)})</span>}
            </div>
            <div className="text-lg font-semibold text-slate-100 tabular-nums">
              {formatCost(monthlyTotal)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {data.monthly.length} เดือน
            </div>
          </div>
        </div>

        {/* ── Row 2: Daily sparkline + Provider breakdown ─────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

          {/* Daily trend sparkline */}
          {dailyTrend.length > 0 && (
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500 mb-2">daily trend</div>
              <svg
                width="100%"
                height="36"
                viewBox="0 0 100 28"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  points={Sparkline({ values: dailyTrend })}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-600">{data.daily[0] ? formatDate(data.daily[0].date) : ''}</span>
                <span className="text-[10px] text-slate-600">{latestDaily ? formatDate(latestDaily.date) : ''}</span>
              </div>
            </div>
          )}

          {/* Per-provider breakdown */}
          {providerEntries.length > 0 && (
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-500 mb-2">by provider</div>
              <div className="space-y-2">
                {providerEntries.slice(0, 6).map(([provider, cost]) => (
                  <div key={provider} className="flex items-center gap-2">
                    <div
                      className={`w-1 h-4 rounded-full shrink-0 ${PROVIDER_COLOR[provider] ?? PROVIDER_COLOR.unknown}`}
                    />
                    <span className="text-xs text-slate-300 w-20 truncate">{provider}</span>
                    <HorizontalBar
                      value={cost}
                      max={maxProviderCost}
                      color={PROVIDER_COLOR[provider] ?? PROVIDER_COLOR.unknown}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Row 3: Per-agent breakdown ───────────────────────────────────────── */}
        {agentEntries.length > 0 && (
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
            <div className="text-xs text-slate-500 mb-2">by agent</div>
            <div className="space-y-2">
              {agentEntries.map(([agent, cost]) => (
                <div key={agent} className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 w-24 truncate">{agent}</span>
                  <HorizontalBar value={cost} max={maxAgentCost} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {data.daily.length === 0 && data.weekly.length === 0 && (
          <div className="text-xs text-slate-600 text-center py-4">
            ไม่มีข้อมูลค่าใช้จ่ายสำหรับช่วงเวลานี้
          </div>
        )}
      </div>
    </div>
  );
}
