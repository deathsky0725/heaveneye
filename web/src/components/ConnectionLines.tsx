import { useEffect, useState } from 'react';
import type { AgentSnapshot, AgentId } from '../types';

interface Edge { from: AgentId; to: AgentId }

const EDGES: Edge[] = [
  { from: 'ziyue',    to: 'anmaioyi' },
  { from: 'anmaioyi', to: 'wenshu' },
  { from: 'anmaioyi', to: 'yanxin' },
  { from: 'anmaioyi', to: 'jianfeng' },
  { from: 'anmaioyi', to: 'shihao' },
  { from: 'anmaioyi', to: 'yefan' },
];

interface LineGeom { id: string; x1: number; y1: number; x2: number; y2: number; active: boolean; color: string }

function isActive(status: AgentSnapshot['status']) {
  return status === 'working' || status === 'thinking' || status === 'done';
}

export function ConnectionLines({ agents, containerRef }: {
  agents: AgentSnapshot[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [lines, setLines] = useState<LineGeom[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const compute = () => {
      const root = containerRef.current;
      if (!root) return;
      const rootBox = root.getBoundingClientRect();
      setSize({ w: rootBox.width, h: rootBox.height });
      const byId = new Map(agents.map((a) => [a.id, a]));
      const next: LineGeom[] = [];
      for (const e of EDGES) {
        const fromEl = root.querySelector<HTMLElement>(`[data-agent-id="${e.from}"]`);
        const toEl   = root.querySelector<HTMLElement>(`[data-agent-id="${e.to}"]`);
        if (!fromEl || !toEl) continue;
        const a = fromEl.getBoundingClientRect();
        const b = toEl.getBoundingClientRect();
        // From right-center of source to left-center of target (for ziyue→anmaioyi)
        // From bottom-center to top-center for vertical edges
        const horizontal = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);
        let x1: number, y1: number, x2: number, y2: number;
        if (horizontal) {
          x1 = a.right - rootBox.left;
          y1 = a.top + a.height / 2 - rootBox.top;
          x2 = b.left - rootBox.left;
          y2 = b.top + b.height / 2 - rootBox.top;
        } else {
          x1 = a.left + a.width / 2 - rootBox.left;
          y1 = a.bottom - rootBox.top;
          x2 = b.left + b.width / 2 - rootBox.left;
          y2 = b.top - rootBox.top;
        }
        const fromAgent = byId.get(e.from);
        const toAgent   = byId.get(e.to);
        // เส้นกระพริบเมื่อ toAgent กำลังรับงานอยู่ (ไม่ใช่ fromAgent ทำงาน)
        next.push({
          id: `${e.from}-${e.to}`,
          x1, y1, x2, y2,
          active: toAgent ? isActive(toAgent.status) : false,
          color: fromAgent?.color ?? '#94a3b8',
        });
      }
      setLines(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [agents, containerRef]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size.w}
      height={size.h}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <style>{`
          @keyframes march { to { stroke-dashoffset: -24; } }
          .edge-active { animation: march 0.8s linear infinite; }
        `}</style>
      </defs>
      {lines.map((l) => {
        const mx = (l.x1 + l.x2) / 2;
        const path = l.x1 === l.x2 || l.y1 === l.y2
          ? `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`
          : `M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`;
        return (
          <g key={l.id}>
            <path
              d={path}
              fill="none"
              stroke={l.active ? l.color : '#334155'}
              strokeWidth={l.active ? 2 : 1.5}
              strokeDasharray="6 6"
              strokeLinecap="round"
              opacity={l.active ? 1 : 0.4}
              className={l.active ? 'edge-active' : ''}
              style={{ filter: l.active ? `drop-shadow(0 0 6px ${l.color})` : undefined }}
            />
            <circle cx={l.x2} cy={l.y2} r={l.active ? 4 : 2.5} fill={l.active ? l.color : '#475569'}
              opacity={l.active ? 1 : 0.6}
              style={{ filter: l.active ? `drop-shadow(0 0 6px ${l.color})` : undefined }}
            />
          </g>
        );
      })}
    </svg>
  );
}
