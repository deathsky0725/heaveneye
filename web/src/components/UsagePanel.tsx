import { useMemo } from 'react';
import { useStore } from '../store';
import type { Usage5hEntry } from '../types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toFixed(0).padStart(2, '0')}m`;
  return `${m}m`;
}

/** Model display name mapping */
const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-5': 'Claude Opus 4.7',
  'claude-opus-4': 'Claude Opus 4.7',
  'claude-sonnet-4-7': 'Claude Sonnet 4.7',
  'claude-sonnet-4': 'Claude Sonnet 4.7',
  'mini-max-m3': 'MiniMax-M3',
  'mini-max-m2.7': 'MiniMax-M2.7',
  'mini-max-m2': 'MiniMax-M2',
  'unknown': 'Unknown',
};

function modelLabel(model: string): string {
  return MODEL_LABELS[model.toLowerCase()] ?? model;
}

interface GroupedModel {
  model: string;
  label: string;
  totalTokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  expiresIn: number | null; // ms until nextResetAt
}

export function UsagePanel() {
  const usage5h = useStore((s) => s.usage5h);

  const rows = useMemo<GroupedModel[]>(() => {
    // Aggregate by model across all agents
    const byModel = new Map<string, {
      input: number; output: number;
      cacheRead: number; cacheCreate: number;
      expiresAt: number | null;
    }>();

    for (const entry of usage5h) {
      const key = entry.model;
      const existing = byModel.get(key);
      if (existing) {
        existing.input += entry.input;
        existing.output += entry.output;
        existing.cacheRead += entry.cacheRead;
        existing.cacheCreate += entry.cacheCreate;
        // Use the latest expiry among all agent windows for this model
        if (entry.nextResetAt != null) {
          if (existing.expiresAt == null || entry.nextResetAt > existing.expiresAt) {
            existing.expiresAt = entry.nextResetAt;
          }
        }
      } else {
        byModel.set(key, {
          input: entry.input,
          output: entry.output,
          cacheRead: entry.cacheRead,
          cacheCreate: entry.cacheCreate,
          expiresAt: entry.nextResetAt,
        });
      }
    }

    const now = Date.now();
    return Array.from(byModel.entries())
      .map(([model, agg]) => ({
        model,
        label: modelLabel(model),
        totalTokens: agg.input + agg.output,
        input: agg.input,
        output: agg.output,
        cacheRead: agg.cacheRead,
        cacheCreate: agg.cacheCreate,
        expiresIn: agg.expiresAt != null ? agg.expiresAt - now : null,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [usage5h]);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
      {rows.map((row) => (
        <div key={row.model} className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-medium text-slate-200">{row.label}</span>
          <span className="text-slate-400">
            {formatTokens(row.totalTokens)} tokens
          </span>
          <span className="text-slate-500">
            (in {formatTokens(row.input)}{' / '}out {formatTokens(row.output)}{' / '}cache {formatTokens(row.cacheRead)})
          </span>
          <span className="text-slate-500">
            resets in {formatDuration(row.expiresIn ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}