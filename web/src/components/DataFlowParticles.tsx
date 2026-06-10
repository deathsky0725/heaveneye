import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
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

interface PathGeom {
  id: string;
  from: AgentId;
  to: AgentId;
  x1: number; y1: number;
  x2: number; y2: number;
  mx: number; my: number; // bezier control point
  horizontal: boolean;
  length: number;
  color: string;
}

interface Particle {
  edgeId: string;
  t: number;         // 0–1 position along path
  speed: number;     // units per ms (randomised per burst)
  size: number;
  opacity: number;
  color: string;
  burst: boolean;    // true = burst particle (fast, large), false = ambient (slow, small)
}

const MAX_PARTICLES = 20;
const AMBIENT_PER_EDGE = 1;  // steady-state particles per active edge

function getPathGeom(agents: AgentSnapshot[], containerRef: React.RefObject<HTMLDivElement | null>): PathGeom[] {
  const root = containerRef.current;
  if (!root) return [];
  const rootBox = root.getBoundingClientRect();
  const byId = new Map(agents.map((a) => [a.id, a]));
  const result: PathGeom[] = [];

  for (const e of EDGES) {
    const fromEl = root.querySelector<HTMLElement>(`[data-agent-id="${e.from}"]`);
    const toEl   = root.querySelector<HTMLElement>(`[data-agent-id="${e.to}"]`);
    if (!fromEl || !toEl) continue;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const horizontal = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2)
                     < Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);

    let x1: number, y1: number, x2: number, y2: number, mx: number, my: number;
    if (horizontal) {
      x1 = a.right   - rootBox.left; y1 = a.top    + a.height / 2 - rootBox.top;
      x2 = b.left    - rootBox.left; y2 = b.top    + b.height / 2 - rootBox.top;
    } else {
      x1 = a.left    + a.width  / 2 - rootBox.left; y1 = a.bottom - rootBox.top;
      x2 = b.left    + b.width  / 2 - rootBox.left; y2 = b.top    - rootBox.top;
    }

    mx = (x1 + x2) / 2;
    my = (y1 + y2) / 2;

    // Approximate Bezier path length (good enough for uniform-speed t sampling)
    const cp1x = horizontal ? mx : x1, cp1y = horizontal ? y1 : my;
    const cp2x = horizontal ? mx : x2, cp2y = horizontal ? y2 : my;
    const segs = 20;
    let length = 0;
    let px = x1, py = y1;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const cx = cubicBez(t, x1, cp1x, cp2x, x2);
      const cy = cubicBez(t, y1, cp1y, cp2y, y2);
      const dx = cx - px, dy = cy - py;
      length += Math.sqrt(dx * dx + dy * dy);
      px = cx; py = cy;
    }

    result.push({
      id: `${e.from}-${e.to}`,
      from: e.from,
      to: e.to,
      x1, y1, x2, y2, mx, my, horizontal, length,
      color: byId.get(e.from)?.color ?? '#94a3b8',
    });
  }
  return result;
}

function cubicBez(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function sampleBezPath(geom: PathGeom, t: number): { x: number; y: number } {
  const { x1, y1, x2, y2, mx, my, horizontal } = geom;
  const cp1x = horizontal ? mx : x1, cp1y = horizontal ? y1 : my;
  const cp2x = horizontal ? mx : x2, cp2y = horizontal ? y2 : my;
  return { x: cubicBez(t, x1, cp1x, cp2x, x2), y: cubicBez(t, y1, cp1y, cp2y, y2) };
}

function particleSvgPath(geom: PathGeom): string {
  const { x1, y1, x2, y2, mx, my, horizontal } = geom;
  if (x1 === x2 || y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function DataFlowParticles({ agents, containerRef }: {
  agents: AgentSnapshot[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const activeBursts = useStore((s) => s.activeParticleBursts);
  const triggerBurst  = useStore((s) => s.triggerParticleBurst);
  const agentsRef     = useRef(agents);
  agentsRef.current   = agents;

  const [geoms, setGeoms]         = useState<PathGeom[]>([]);
  const [size, setSize]           = useState({ w: 0, h: 0 });
  const [particleList, setPList]   = useState<Particle[]>([]);

  const rafRef        = useRef<number>(0);
  const particlesRef  = useRef<Particle[]>([]);
  const lastTimeRef   = useRef<number>(0);
  const burstsRef     = useRef<Record<string, number>>({});

  // Recompute geometry when agents or container size changes
  useEffect(() => {
    const compute = () => {
      const root = containerRef.current;
      if (!root) return;
      const rootBox = root.getBoundingClientRect();
      setSize({ w: rootBox.width, h: rootBox.height });
      setGeoms(getPathGeom(agentsRef.current, containerRef));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
  }, [agents, containerRef]);

  // Sync bursts from store → ref
  useEffect(() => {
    burstsRef.current = activeBursts;
  }, [activeBursts]);

  // Sync particles ref → state (throttled to ~30fps to avoid excessive renders)
  useEffect(() => {
    let raf: number;
    let lastSetTime = 0;
    const INTERVAL = 32; // ~30fps

    const tick = (now: number) => {
      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16;
      lastTimeRef.current = now;

      // Remove expired particles
      particlesRef.current = particlesRef.current.filter(
        (p) => p.t < 1.05 && p.opacity > 0.01,
      );

      // Spawn ambient particles on active edges (one per active edge, lazily)
      for (const geom of geoms) {
        const hasAmbient = particlesRef.current.some(
          (p) => p.edgeId === geom.id && !p.burst,
        );
        const isActive = !!(agentsRef.current.find((a) => a.id === geom.to && a.status !== 'idle'));
        if (isActive && !hasAmbient && particlesRef.current.length < MAX_PARTICLES) {
          particlesRef.current.push(makeAmbient(geom));
        }
      }

      // Advance particles
      for (const p of particlesRef.current) {
        p.t        += p.speed * dt / (p.burst ? 400 : 2000);
        p.opacity   = p.burst
          ? Math.max(0, 1 - (p.t / 1.0) * 1.2)
          : 0.7 + Math.sin(now * 0.003 + p.speed * 10) * 0.2;
      }

      // Throttle setPList to ~30fps (32ms interval)
      if (now - lastSetTime >= INTERVAL) {
        lastSetTime = now;
        setPList([...particlesRef.current]);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geoms]);

  // React to new burst triggers
  useEffect(() => {
    const prevKeys = new Set(Object.keys(burstsRef.current));
    const nextKeys = new Set(Object.keys(activeBursts));

    for (const key of nextKeys) {
      if (!prevKeys.has(key)) {
        const expiry = activeBursts[key]!;
        if (expiry > Date.now()) spawnBurst(key, expiry);
      }
    }
  }, [activeBursts]);

  function spawnBurst(edgeId: string, _expiry: number) {
    const geom = geoms.find((g) => g.id === edgeId);
    if (!geom) return;
    const count = 6;
    for (let i = 0; i < count; i++) {
      if (particlesRef.current.length >= MAX_PARTICLES) break;
      const t = i / count * 0.3; // stagger along first 30% of path
      particlesRef.current.push({
        edgeId,
        t,
        speed: 0.0006 + Math.random() * 0.0004,
        size: 3 + Math.random() * 2.5,
        opacity: 1,
        color: geom.color,
        burst: true,
      });
    }
  }

  function makeAmbient(geom: PathGeom): Particle {
    return {
      edgeId:  geom.id,
      t:       Math.random() * 0.15,
      speed:   0.00015 + Math.random() * 0.0001,
      size:    1.5 + Math.random() * 1,
      opacity: 0.6 + Math.random() * 0.3,
      color:   geom.color,
      burst:   false,
    };
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size.w}
      height={size.h}
      style={{ overflow: 'visible' }}
    >
      {/* CSS fallback animated dashes (shown when no JS particles active) */}
      <defs>
        <style>{`
          @keyframes dash-flow {
            to { stroke-dashoffset: -24; }
          }
          .edge-flow-fallback {
            animation: dash-flow 0.9s linear infinite;
            opacity: 0.35;
          }
        `}</style>
      </defs>

      {/* Static dashed path backgrounds (CSS fallback layer) */}
      {geoms.map((g) => (
        <path
          key={g.id}
          d={particleSvgPath(g)}
          fill="none"
          stroke={g.color}
          strokeWidth={1.5}
          strokeDasharray="6 6"
          strokeLinecap="round"
          className="edge-flow-fallback"
        />
      ))}

      {/* Particle layer — rendered via rAF in React state */}
      {particleList.map((p, i) => {
        const geom = geoms.find((g) => g.id === p.edgeId);
        if (!geom) return null;
        const { x, y } = sampleBezPath(geom, Math.min(p.t, 1));
        return (
          <circle
            key={`${p.edgeId}-${i}`}
            cx={x}
            cy={y}
            r={p.size}
            fill={p.color}
            opacity={Math.max(0, p.opacity)}
            style={{
              filter: `drop-shadow(0 0 ${p.burst ? 8 : 3}px ${p.color})`,
              transition: 'opacity 80ms ease-out',
            }}
          />
        );
      })}
    </svg>
  );
}