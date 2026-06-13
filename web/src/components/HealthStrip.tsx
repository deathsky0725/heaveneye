import { useReducedMotion } from 'motion/react';
import { useStore } from '../store';
import { aggregateHealthCounts, type HealthBucket } from '../types';

interface ChipProps {
  bucket: HealthBucket;
  count: number;
}

const BUCKET_TH: Record<HealthBucket, string> = {
  healthy:            'สุขภาพดี',
  stuck:               'ติดอยู่',
  'crash-loop':        'ล้มเหลวซ้ำ',
  'iteration-exhausted': 'หมด iteration',
  'silent-done':       'silent-done',
};

const BUCKET_DOT: Record<HealthBucket, string> = {
  healthy:            'bg-emerald-400',
  stuck:              'bg-amber-400',
  'crash-loop':       'bg-rose-500',
  'iteration-exhausted': 'bg-amber-500',
  'silent-done':      'bg-orange-400',
};

const BUCKET_PILL: Record<HealthBucket, string> = {
  healthy:            'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  stuck:              'bg-amber-400/10 text-amber-300 border-amber-400/25',
  'crash-loop':       'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'iteration-exhausted': 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  'silent-done':      'bg-orange-400/12 text-orange-300 border-orange-400/30',
};

/** Chip for one health bucket. Hidden when count is 0. */
function Chip({ bucket, count }: ChipProps) {
  const prefersReducedMotion = useReducedMotion();
  if (count === 0) return null;
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${BUCKET_PILL[bucket]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${BUCKET_DOT[bucket]}`} />
      <span>{count}</span>
      <span className="text-slate-400">{BUCKET_TH[bucket]}</span>
    </div>
  );
}

/**
 * Team health summary strip — reads agent healthFlag from SSE store,
 * aggregates into buckets, renders chips in priority order:
 *   crash-loop > iteration-exhausted > stuck > healthy
 *
 * Mounted in App header (not inside OfficeMap/ProviderPanel/liveness).
 * Reduced-motion safe — dot colours + text are sufficient signal.
 */
export function HealthStrip() {
  const agents = useStore((s) => s.agents);
  const counts = aggregateHealthCounts(agents);

  // Priority order per spec
  const buckets: HealthBucket[] = ['crash-loop', 'iteration-exhausted', 'stuck', 'healthy'];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buckets.map((bucket) => (
        <Chip key={bucket} bucket={bucket} count={counts[bucket]} />
      ))}
    </div>
  );
}
