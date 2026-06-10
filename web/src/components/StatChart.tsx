import { useState, useEffect, useRef } from 'react';
import type { AgentId } from '../types';

interface HourBucket {
  hour: string;
  total: number;
  input: number;
  output: number;
  cacheRead: number;
}

interface DayBucket {
  day: string;
  total: number;
  input: number;
  output: number;
  cacheRead: number;
}

type Window = '24h' | '7d' | '30d';

export function StatChart({ agentId, compact = false }: { agentId: AgentId; compact?: boolean }) {
  const [window, setWindow] = useState<Window>('24h');
  const [buckets, setBuckets] = useState<HourBucket[] | DayBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{
    bucket: HourBucket | DayBucket;
    x: number;
    y: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const loadingStartRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    loadingStartRef.current = Date.now();
    setLoading(true);

    const endpoint = `/api/usage/${window}?agent=${agentId}`;
    fetch(`${base}${endpoint}`)
      .then((r) => r.json())
      .then((data: { agent: string; buckets: HourBucket[] | DayBucket[] }) => {
        if (!cancelled) setBuckets(data.buckets ?? []);
      })
      .catch(() => { /* silent */ })
      .finally(() => {
        if (!cancelled) {
          const elapsed = Date.now() - loadingStartRef.current;
          const remaining = Math.max(0, 200 - elapsed);
          setTimeout(() => setLoading(false), remaining);
        }
      });
    return () => { cancelled = true; };
  }, [agentId, window]);

  const windowLabel = window === '24h' ? '24h' : window === '7d' ? '7d' : '30d';

  if (loading) {
    return <div className="text-xs text-slate-500 py-2">โหลดข้อมูล...</div>;
  }

  if (buckets.length === 0) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {!compact && (
          <div className="flex gap-1">
            {(['24h', '7d', '30d'] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  w === window
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        )}
        <div className="text-xs text-slate-500 py-2">ไม่มีข้อมูล {windowLabel}</div>
      </div>
    );
  }

  const allZero = buckets.every((b) => b.total === 0);
  if (allZero) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {!compact && (
          <div className="flex gap-1">
            {(['24h', '7d', '30d'] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  w === window
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        )}
        <div className="text-xs text-slate-500 py-2">ไม่มีข้อมูล token usage ใน {windowLabel}</div>
      </div>
    );
  }

  // SVG dimensions
  const W = 400;
  const H = compact ? 80 : 120;
  const PAD_L = 10;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 24;
  const CHART_W = W - PAD_L - PAD_R;
  const CHART_H = H - PAD_T - PAD_B;

  const barCount = buckets.length;
  const barW = CHART_W / barCount;
  const gap = Math.max(1, barW * 0.2);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const getBarHeight = (total: number) => Math.max(2, (total / maxTotal) * CHART_H);

  // X-axis labels depend on window type
  const isDaily = window !== '24h';

  const getLabel = (i: number): string => {
    const b = buckets[i];
    if (!b) return '';
    if (isDaily) {
      // DayBucket: label is YYYY-MM-DD → show "Jun 01" style
      const d = new Date((b as DayBucket).day);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      const h = new Date((b as HourBucket).hour).getHours();
      return `${String(h).padStart(2, '0')}:00`;
    }
  };

  // Show every ~5 labels to avoid crowding
  const labelStep = isDaily
    ? Math.max(1, Math.floor(barCount / 5))
    : Math.max(1, Math.floor(barCount / 5));
  const labelIndices = Array.from(
    { length: Math.ceil(barCount / labelStep) },
    (_, idx) => Math.min(idx * labelStep, barCount - 1)
  );

  return (
    <div className="mt-3 flex flex-col gap-2">
      {/* Window selector */}
      {!compact && (
        <div className="flex gap-1">
          {(['24h', '7d', '30d'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${
                w === window
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          className="block"
          style={{ overflow: 'visible' }}
        >
          {/* Bars */}
          {buckets.map((bucket, i) => {
            const x = PAD_L + i * barW + gap / 2;
            const barHeight = getBarHeight(bucket.total);
            const barActualW = barW - gap;
            const y = PAD_T + (CHART_H - barHeight);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barActualW}
                height={barHeight}
                fill={bucket.total > 0 ? '#6366f1' : '#334155'}
                opacity={tooltip?.bucket === bucket ? 1 : 0.75}
                rx={2}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => {
                  const rect = svgRef.current!.getBoundingClientRect();
                  setTooltip({
                    bucket,
                    x: rect.left + x + barActualW / 2,
                    y: rect.top + y,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}

          {/* X-axis labels */}
          {labelIndices.map((i) => {
            const x = PAD_L + i * barW + barW / 2;
            return (
              <text
                key={i}
                x={x}
                y={H - 4}
                textAnchor="middle"
                fontSize={10}
                fill="#64748b"
              >
                {getLabel(i)}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-xl max-w-[200px]"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="font-medium text-slate-200 mb-1">
              {isDaily
                ? new Date((tooltip.bucket as DayBucket).day).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : `${new Date((tooltip.bucket as HourBucket).hour).getHours().toString().padStart(2, '0')}:00`}
            </div>
            <div className="text-slate-400 space-y-0.5">
              <div>
                input: <span className="text-slate-200">{tooltip.bucket.input.toLocaleString()}</span>
              </div>
              <div>
                output: <span className="text-slate-200">{tooltip.bucket.output.toLocaleString()}</span>
              </div>
              <div>
                cache: <span className="text-slate-200">{tooltip.bucket.cacheRead.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-600 pt-0.5 mt-1">
                total:{' '}
                <span className="text-indigo-400 font-medium">
                  {tooltip.bucket.total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}