import { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotaWindow5h {
  totalTokens: number;
  capPercent: number;
  resetCountdownMs: number;
  resetCountdownSec: number;
  windowStartedAt: string;
  nextResetAt: string;
}

export interface QuotaWeekly {
  totalTokens: number;
  capPercent: number;
  capTokens: number;
}

export interface QuotaBurnRate {
  tokensPerHour: number;
  tokensPerMinute: number;
}

export interface QuotaAgent {
  agent: string;
  name: string;
  provider: string;
  tokensToday: number;
  tokens5h: number;
  costToday: number;
}

export interface QuotaData {
  window5h: QuotaWindow5h;
  weekly: QuotaWeekly;
  burnRate: QuotaBurnRate;
  agents: QuotaAgent[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function formatBurnRate(tph: number): string {
  if (tph >= 1_000_000) return `${(tph / 1_000_000).toFixed(1)}M/hr`;
  if (tph >= 1_000) return `${(tph / 1_000).toFixed(0)}k/hr`;
  return `${tph}/hr`;
}

// ── Alert Badge (pre-cap threshold warning) ───────────────────────────────────

const THRESHOLD_WARN = 80;
const THRESHOLD_DANGER = 90;

interface AlertBadgeProps {
  percent: number;
  label: string;
}

function AlertBadge({ percent, label }: AlertBadgeProps) {
  if (percent < THRESHOLD_WARN) return null;

  const isDanger = percent >= THRESHOLD_DANGER;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${
        isDanger
          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      }`}
      role="status"
      aria-label={`${label} ${Math.round(percent)}% — ${isDanger ? 'danger' : 'warning'} threshold`}
    >
      <span aria-hidden="true">{isDanger ? '🔴' : '🟡'}</span>
      <span>{Math.round(percent)}%</span>
      {isDanger && !prefersReducedMotion && (
        <span
          className="animate-pulse"
          aria-hidden="true"
        >
          ⚠
        </span>
      )}
    </div>
  );
}

// ── Gauge (CSS arc, no npm dep) ───────────────────────────────────────────────

const GAUGE_R = 38;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_R; // ≈ 238.76

function GaugeArc({ percent, color, label }: { percent: number; color: string; label: string }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const strokeDashoffset = GAUGE_CIRCUMFERENCE * (1 - clamped / 100);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
          {/* Track */}
          <circle
            cx="50" cy="50" r={GAUGE_R}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
          />
          {/* Fill */}
          <circle
            cx="50" cy="50" r={GAUGE_R}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            style={prefersReducedMotion ? {} : {
              transition: 'stroke-dashoffset 0.6s ease',
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-slate-100">{Math.round(clamped)}%</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Agent Row ─────────────────────────────────────────────────────────────────

function AgentRow({ a }: { a: QuotaAgent }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/50 last:border-0 text-xs">
      <span className="w-20 text-slate-300 font-medium truncate flex-shrink-0">{a.name}</span>
      <span className="text-slate-500 text-[10px] w-16 flex-shrink-0 truncate">{a.provider}</span>
      <div className="flex items-center gap-4 ml-auto">
        <div className="text-right">
          <div className="text-slate-300">{formatTokens(a.tokens5h)} <span className="text-slate-600">/ 5h</span></div>
        </div>
        <div className="text-right">
          <div className="text-slate-300">{formatTokens(a.tokensToday)} <span className="text-slate-600">/ วัน</span></div>
        </div>
        <div className="text-right w-16">
          <div className="text-slate-400">${a.costToday.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

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
        <span className={`ml-auto text-slate-500 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function QuotaPanel() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [countdown, setCountdown] = useState<string>('—');

  // Poll /api/quota
  const fetchQuota = useCallback(async () => {
    try {
      const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
      const res = await fetch(`${base}/api/quota`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as QuotaData;
      setData(d);
      setError(false);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
    const id = setInterval(fetchQuota, 15_000);
    return () => clearInterval(id);
  }, [fetchQuota]);

  // Live countdown ticker (updates every second)
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const ms = data.window5h.resetCountdownMs;
      setCountdown(formatCountdown(ms));
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [data]);

  if (loading) {
    return (
      <div className="px-6 pb-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-500">โหลด QuotaPanel...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-6 pb-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">เชื่อมต่อ /api/quota ไม่ได้ — ตรวจสอบ backend</p>
        </div>
      </div>
    );
  }

  const { window5h, weekly, burnRate, agents } = data;

  // Cap gauge color
  const cap5hColor = window5h.capPercent >= 90 ? '#ef4444'
    : window5h.capPercent >= 70 ? '#f59e0b'
    : '#22c55e';

  const capWkColor = weekly.capPercent >= 90 ? '#ef4444'
    : weekly.capPercent >= 70 ? '#f59e0b'
    : '#22c55e';

  return (
    <div className="px-6 pb-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-700/50">
          <span className="text-sm">📊</span>
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">Quota</span>
          <span className="ml-auto text-xs text-slate-500 max-sm:max-w-28 max-sm:truncate">
            burn {formatBurnRate(burnRate.tokensPerHour)}
          </span>
        </div>

        {/* Gauges row — stacks vertically on narrow viewports */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 px-4 py-4 border-b border-slate-700/50">
          {/* Gauges group */}
          <div className="flex flex-row sm:flex-col items-center sm:items-center gap-4 sm:gap-1.5">
            <GaugeArc
              percent={window5h.capPercent}
              color={cap5hColor}
              label={`5h cap (${formatTokens(window5h.totalTokens)})`}
            />
            <AlertBadge percent={window5h.capPercent} label="5h" />
          </div>
          <div className="flex flex-row sm:flex-col items-center sm:items-center gap-4 sm:gap-1.5">
            <GaugeArc
              percent={weekly.capPercent}
              color={capWkColor}
              label={`weekly cap (${formatTokens(weekly.totalTokens)})`}
            />
            <AlertBadge percent={weekly.capPercent} label="weekly" />
          </div>

          {/* Reset info */}
          <div className="flex flex-col gap-1 sm:ml-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Reset in</span>
            <span className="text-lg font-bold text-slate-100 tabular-nums">{countdown}</span>
            <span className="text-[10px] text-slate-600">
              started {window5h.windowStartedAt
                ? new Date(window5h.windowStartedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </span>
          </div>

          {/* Burn rate */}
          <div className="flex flex-col gap-1 ml-auto sm:ml-0 text-right sm:text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Burn rate</span>
            <span className="text-sm font-bold text-slate-100">{formatBurnRate(burnRate.tokensPerHour)}</span>
            <span className="text-[10px] text-slate-600">
              {formatTokens(burnRate.tokensPerMinute)}/min
            </span>
          </div>
        </div>

        {/* Per-agent breakdown */}
        <Section title={`Agents (${agents.length})`} emoji="🤖" defaultOpen={true}>
          {agents.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">ไม่มีข้อมูล agent</p>
          ) : (
            agents.map((a) => (
              <AgentRow key={a.agent} a={a} />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
