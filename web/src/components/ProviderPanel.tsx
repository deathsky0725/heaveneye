import { useState, useEffect } from 'react';
import type { AgentId } from '../types';

interface ProviderEntry {
  provider: string;
  agents: AgentId[];
  tokensTodayTotal: number;
}

interface ProvidersApiResponse {
  providers: ProviderEntry[];
}

/** Format token count as human-readable string, e.g. 107_000 → "107k" */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** Capitalize provider name for display */
function providerLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Map provider → accent color for chip */
const PROVIDER_COLOR: Record<string, string> = {
  anthropic: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  minimax:   'bg-cyan-500/20    text-cyan-300    border-cyan-500/30',
  gemini:    'bg-amber-500/20   text-amber-300   border-amber-500/30',
  openai:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  unknown:   'bg-slate-500/20 text-slate-300   border-slate-500/30',
};

export function ProviderPanel() {
  const [data, setData] = useState<ProvidersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/providers`)
      .then((r) => r.json())
      .then((d: ProvidersApiResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-6 mb-4">
        <div className="glass-surface rounded-xl px-4 py-3 border border-white/10">
          <span className="text-xs text-slate-500">โหลด providers…</span>
        </div>
      </div>
    );
  }

  if (!data?.providers?.length) return null;

  return (
    <div className="px-6 mb-4">
      <div className="glass-surface rounded-xl px-4 py-3 border border-white/10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            ☁️ Providers
          </span>
        </div>

        {/* Provider rows */}
        <div className="space-y-3">
          {data.providers.map((entry) => {
            const colorClass = PROVIDER_COLOR[entry.provider] ?? PROVIDER_COLOR.unknown;
            return (
              <div key={entry.provider} className="flex flex-wrap items-start gap-2">
                {/* Provider name + token total — label-wrap so long names don't force chip overflow */}
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-medium text-slate-200 shrink-0">
                    {providerLabel(entry.provider)}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {formatTokens(entry.tokensTodayTotal)} tokens วันนี้
                  </span>
                </div>

                {/* Agent chips — self-wrapping flex row, no ml-auto to avoid horizontal overflow */}
                <div className="flex flex-wrap gap-1.5">
                  {entry.agents.map((agentId) => (
                    <span
                      key={agentId}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${colorClass}`}
                    >
                      {agentId}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
