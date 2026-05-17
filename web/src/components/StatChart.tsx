import { useState, useEffect, useRef } from 'react';
import type { AgentId } from '../types';

interface Bucket {
  hour: string;
  total: number;
  input: number;
  output: number;
  cacheRead: number;
}

const HOUR_LABELS = ['00:00', '06:00', '12:00', '18:00'];

export function StatChart({ agentId }: { agentId: AgentId }) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ bucket: Bucket; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.DEV ? 'http://localhost:7878' : '';
    fetch(`${base}/api/usage/24h?agent=${agentId}`)
      .then((r) => r.json())
      .then((data: { agent: string; buckets: Bucket[] }) => {
        if (!cancelled) setBuckets(data.buckets ?? []);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return <div className="text-xs text-slate-500 py-2">โหลดข้อมูล...</div>;
  }

  if (buckets.length === 0) {
    return <div className="text-xs text-slate-500 py-2">ไม่มีข้อมูล 24 ชม.</div>;
  }

  // SVG dimensions
  const W = 400;
  const H = 120;
  const PAD_L = 10;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 24;
  const CHART_W = W - PAD_L - PAD_R;
  const CHART_H = H - PAD_T - PAD_B;

  const barCount = buckets.length; // 24
  const barW = CHART_W / barCount;
  const gap = Math.max(1, barW * 0.2);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);

  const getBarHeight = (total: number) => (total / maxTotal) * CHART_H;

  // X-axis label positions (every 6h)
  const labelHours = [0, 6, 12, 18];

  return (
    <div className="mt-3 relative">
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
          const hour = new Date(bucket.hour).getHours();
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
        {labelHours.map((h) => {
          const idx = buckets.findIndex((_, i) => new Date(buckets[i].hour).getHours() >= h);
          const x = idx >= 0 ? PAD_L + idx * barW + barW / 2 : 0;
          return (
            <text
              key={h}
              x={x}
              y={H - 4}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
            >
              {String(h).padStart(2, '0')}:00
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-xl"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-medium text-slate-200 mb-1">
            {new Date(tooltip.bucket.hour).getHours().toString().padStart(2, '0')}:00
          </div>
          <div className="text-slate-400 space-y-0.5">
            <div>input: <span className="text-slate-200">{tooltip.bucket.input.toLocaleString()}</span></div>
            <div>output: <span className="text-slate-200">{tooltip.bucket.output.toLocaleString()}</span></div>
            <div>cache: <span className="text-slate-200">{tooltip.bucket.cacheRead.toLocaleString()}</span></div>
            <div className="border-t border-slate-600 pt-0.5 mt-1">
              total: <span className="text-indigo-400 font-medium">{tooltip.bucket.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}