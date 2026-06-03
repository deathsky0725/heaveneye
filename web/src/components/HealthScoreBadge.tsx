import { useState, useEffect } from 'react';

interface HealthScore {
  agent: string;
  score: number;
  uptimeHours: number;
  totalHours: number;
  tasksCompleted: number;
  tasksSpawned: number;
  errorsCount: number;
  errorRate: number;
  uptimeScore: number;
  completionScore: number;
  errorScore: number;
}

type ScoreTier = 'green' | 'yellow' | 'red';

function getTier(score: number): ScoreTier {
  if (score > 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

const TIER_STYLES: Record<ScoreTier, { bg: string; text: string; border: string; label: string }> = {
  green: {
    bg: 'bg-emerald-400/10',
    text: 'text-emerald-400',
    border: 'border-emerald-400/30',
    label: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/20',
  },
  yellow: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    border: 'border-amber-400/30',
    label: 'bg-amber-400/15 text-amber-400 border-amber-400/20',
  },
  red: {
    bg: 'bg-rose-400/10',
    text: 'text-rose-400',
    border: 'border-rose-400/30',
    label: 'bg-rose-400/15 text-rose-400 border-rose-400/20',
  },
};

const SCORE_MAX = 100;

interface HealthScoreBadgeProps {
  agentId: string;
  /** Compact mode for the AgentCard strip */
  compact?: boolean;
}

export function HealthScoreBadge({ agentId, compact = false }: HealthScoreBadgeProps) {
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/agent/${agentId}/health-score`)
      .then((r) => r.json())
      .then((d: HealthScore) => {
        setHealth(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <span className="inline-block w-10 h-4 rounded bg-slate-800 animate-pulse" />
    );
  }

  if (!health) {
    return null;
  }

  const tier = getTier(health.score);
  const styles = TIER_STYLES[tier];

  // Breakdown bar: three segments representing each component
  const uptimeBar  = (health.uptimeScore / 0.4) * 100;   // % of max 0.4
  const completedBar = (health.completionScore / 0.4) * 100; // % of max 0.4
  const errorBar    = (health.errorScore / 0.2) * 100;    // % of max 0.2

  return (
    <div className="relative inline-block">
      {/* Trigger */}
      <button
        onClick={() => setShowTooltip((v) => !v)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          inline-flex items-center gap-1.5 rounded border px-2 py-0.5
          ${styles.label}
          text-xs font-medium transition-colors cursor-help
        `}
        title="ดูรายละเอียด health score"
      >
        <span>♥</span>
        <span>{health.score}</span>
        <span className="text-[10px] opacity-60">/ {SCORE_MAX}</span>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm p-3 shadow-xl text-xs">
          <div className="font-semibold text-slate-100 mb-2">Health Breakdown · 24h</div>

          {/* Component bars */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Uptime</span>
                <span className={styles.text}>{health.uptimeHours.toFixed(1)}h / {health.totalHours.toFixed(0)}h</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tier === 'green' ? 'bg-emerald-400' : tier === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ width: `${uptimeBar}%` }}
                />
              </div>
              <div className="text-right text-slate-500 text-[10px] mt-0.5">
                ×0.4 → {(health.uptimeScore * 100).toFixed(0)}pts
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Completion</span>
                <span className={styles.text}>{health.tasksCompleted} / {health.tasksSpawned}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tier === 'green' ? 'bg-emerald-400' : tier === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ width: `${completedBar}%` }}
                />
              </div>
              <div className="text-right text-slate-500 text-[10px] mt-0.5">
                ×0.4 → {(health.completionScore * 100).toFixed(0)}pts
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Error-free</span>
                <span className={styles.text}>{health.errorsCount} errors</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tier === 'green' ? 'bg-emerald-400' : tier === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ width: `${errorBar}%` }}
                />
              </div>
              <div className="text-right text-slate-500 text-[10px] mt-0.5">
                ×0.2 → {(health.errorScore * 100).toFixed(0)}pts
              </div>
            </div>
          </div>

          <div className={`mt-2 pt-2 border-t border-white/5 text-center font-semibold ${styles.text}`}>
            Total: {health.score} / {SCORE_MAX}
          </div>
        </div>
      )}
    </div>
  );
}