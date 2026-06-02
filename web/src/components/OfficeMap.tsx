import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { AgentId, AgentSnapshot, AgentStatus } from '../types';
import { useStore } from '../store';
import { RiveAvatar } from './RiveAvatar';
import { isoProject, depthZ, ISO_GRID, TILE_W, TILE_H, GRID_SIZE } from '../lib/iso';

// Status-aware speech bubble copy (พูดเองได้ ฟีลมีชีวิต)
const SPEECH_LINES: Partial<Record<AgentStatus, string[]>> = {
  done:    ['เสร็จแล้วค่ะ!', 'ส่งงานนะ!', 'ตรวจให้ที!', 'จบงานละ ✓'],
  blocked: ['ขอ review ที!', 'ติดอยู่ค่ะ...', 'รอความเห็น'],
  failed:  ['ติดปัญหา', 'พังแล้ว 😵'],
  working: ['กำลังทำงาน...', 'อืม...'],
  thinking:['คิดอยู่...', 'รอแป๊บ'],
};

function pickLine(status: AgentStatus): string {
  const lines = SPEECH_LINES[status] ?? ['ส่งงาน!'];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

interface Coords {
  x: number;
  y: number;
}

// Each agent's home coords come from the iso projection (B1.1).
// On B1.2+ these will also drive desk/avatar placement; for now we keep the
// %-based desk offset that the original code used, but anchor it at the iso
// tile position rather than a flat percent.
//
// DESK_COORDS[agent] = { x: % horizontally, y: % vertically } — anchor for the
// iso tile that the agent stands on.  Computed once from ISO_GRID.
const DESK_COORDS: Record<AgentId, Coords> = Object.fromEntries(
  (Object.keys(ISO_GRID) as AgentId[]).map((id) => {
    const { col, row } = ISO_GRID[id];
    return [id, isoProject(col, row)];
  })
) as Record<AgentId, Coords>;

// Floor anchor for the desk monitor — sits *on* the iso tile, just below
// the center.  Constant offset works because the iso grid is uniformly
// scaled.
const DESK_FLOOR_DROP = 4; // % below tile center

// Semicircular delivery offsets around Anmaioyi's desk (sibling agents gather
// in a small semicircle while delivering).  These are in screen-%, not iso
// coords, so they remain unchanged.
const DELIVERY_OFFSETS: Record<AgentId, Coords> = {
  ziyue:    { x: 0, y: 0 },
  anmaioyi: { x: 0, y: 0 },
  wenshu:   { x: -10, y: 4 },
  yanxin:   { x: -5,  y: 6 },
  jianfeng: { x: 0,   y: 8 },
  shihao:   { x: 5,   y: 6 },
  yefan:    { x: 10,  y: 4 },
};

const STATUS_BORDER: Record<AgentStatus, string> = {
  idle:     'border-slate-800',
  thinking: 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]',
  working:  'border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]',
  done:     'border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]',
  failed:   'border-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]',
  blocked:  'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse',
};

const STATUS_TEXT_TH: Record<AgentStatus, string> = {
  idle:     'ว่าง',
  thinking: 'กำลังคิด',
  working:  'ทำงาน',
  done:     'เสร็จสิ้น',
  failed:   'ล้มเหลว',
  blocked:  'รอตรวจ',
};

// Status pill — calm semantics. idle = neutral grey (NOT red), red is only for real failure.
// Replaces the old health-score badge that turned the whole board red on restart.
const STATUS_PILL: Record<AgentStatus, { dot: string; pill: string }> = {
  idle:     { dot: 'bg-slate-500',                pill: 'bg-slate-700/40 text-slate-400 border-slate-600/40' },
  thinking: { dot: 'bg-amber-400 animate-pulse',  pill: 'bg-amber-400/10 text-amber-300 border-amber-400/25' },
  working:  { dot: 'bg-emerald-400 animate-pulse',pill: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25' },
  done:     { dot: 'bg-cyan-400',                 pill: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/25' },
  failed:   { dot: 'bg-rose-500',                 pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  blocked:  { dot: 'bg-amber-500',                pill: 'bg-amber-500/12 text-amber-300 border-amber-500/30' },
};

// Core agents render larger to establish visual hierarchy
const CORE_AGENTS = new Set<AgentId>(['ziyue', 'anmaioyi']);

// Org-chart edges for connection lines (reduces empty space + shows hierarchy)
const EDGES: Array<[AgentId, AgentId]> = [
  ['ziyue', 'anmaioyi'],
  ['anmaioyi', 'wenshu'],
  ['anmaioyi', 'yanxin'],
  ['anmaioyi', 'jianfeng'],
  ['anmaioyi', 'shihao'],
  ['anmaioyi', 'yefan'],
];

export function OfficeMap() {
  const agents = useStore((s) => s.agents);
  const openDetailPanel = useStore((s) => s.openDetailPanel);

  // Position state for each agent (can be different from home desk when walking)
  const [positions, setPositions] = useState<Record<AgentId, Coords>>(() => ({ ...DESK_COORDS }));
  // Waddling state to trigger wobbling keyframes
  const [waddling, setWaddling] = useState<Record<AgentId, boolean>>(() => ({
    ziyue: false, anmaioyi: false, wenshu: false, yanxin: false, jianfeng: false, shihao: false, yefan: false
  }));
  // Delivery speech bubble state — bubble text per agent
  const [deliveries, setDeliveries] = useState<Record<AgentId, string | null>>(() => ({
    ziyue: null, anmaioyi: null, wenshu: null, yanxin: null, jianfeng: null, shihao: null, yefan: null
  }));
  // Celebration burst (sparkle) on arrival — keyed by agent id with timestamp
  const [sparkles, setSparkles] = useState<Record<AgentId, number | null>>(() => ({
    ziyue: null, anmaioyi: null, wenshu: null, yanxin: null, jianfeng: null, shihao: null, yefan: null
  }));

  const prevStatuses = useRef<Record<AgentId, AgentStatus>>({
    ziyue: 'idle', anmaioyi: 'idle', wenshu: 'idle', yanxin: 'idle', jianfeng: 'idle', shihao: 'idle', yefan: 'idle'
  });

  const getAgent = (id: AgentId): AgentSnapshot | undefined => agents.find((a) => a.id === id);

  // Trigger walk animation
  const triggerWalk = (agentId: AgentId, targetId: AgentId) => {
    // 1. Start waddling
    setWaddling((prev) => ({ ...prev, [agentId]: true }));
    // 2. Set target coordinates to target desk with offset if targeting Anmaioyi
    const baseCoords = DESK_COORDS[targetId];
    const offset = targetId === 'anmaioyi' ? (DELIVERY_OFFSETS[agentId] || { x: 0, y: 0 }) : { x: 0, y: 0 };
    setPositions((prev) => ({
      ...prev,
      [agentId]: {
        x: baseCoords.x + offset.x,
        y: baseCoords.y + offset.y
      }
    }));
  };

  useEffect(() => {
    for (const agent of agents) {
      const prev = prevStatuses.current[agent.id];
      const next = agent.status;
      if (prev !== next) {
        prevStatuses.current[agent.id] = next;
        // Trigger delivery walk if specialist finished working (blocked/done status)
        if (
          prev &&
          (next === 'blocked' || next === 'done') &&
          agent.id !== 'anmaioyi' &&
          agent.id !== 'ziyue'
        ) {
          triggerWalk(agent.id, 'anmaioyi');
        }
      }
    }
  }, [agents]);

  const handleArrival = (id: AgentId) => {
    const currentPos = positions[id];
    if (!currentPos) return;

    const offset = DELIVERY_OFFSETS[id] || { x: 0, y: 0 };
    const targetPos = {
      x: DESK_COORDS['anmaioyi'].x + offset.x,
      y: DESK_COORDS['anmaioyi'].y + offset.y
    };
    const ownPos = DESK_COORDS[id];
    const agent = getAgent(id);

    // Arrived at Anmaioyi's desk — show speech bubble + sparkle burst
    if (Math.abs(currentPos.x - targetPos.x) < 1 && Math.abs(currentPos.y - targetPos.y) < 1) {
      const line = pickLine(agent?.status ?? 'done');
      setDeliveries((prev) => ({ ...prev, [id]: line }));
      setSparkles((prev) => ({ ...prev, [id]: Date.now() }));
      // Stay 2.4 sec to hand-off + show speech, then return home
      setTimeout(() => {
        setDeliveries((prev) => ({ ...prev, [id]: null }));
        setPositions((prev) => ({ ...prev, [id]: ownPos }));
      }, 2400);
    }
    // Returned home — stop waddling
    else if (Math.abs(currentPos.x - ownPos.x) < 1 && Math.abs(currentPos.y - ownPos.y) < 1) {
      setWaddling((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Stagger waddling transition parameters
  const waddleTransition = {
    rotate: { repeat: Infinity, repeatType: 'mirror' as const, duration: 0.15 },
    y: { repeat: Infinity, repeatType: 'mirror' as const, duration: 0.15 },
    left: { type: 'spring' as const, stiffness: 50, damping: 14 },
    top: { type: 'spring' as const, stiffness: 50, damping: 14 },
  };

  const normalTransition = { type: 'spring' as const, stiffness: 80, damping: 16 };

  // Diamond floor grid (5x5) — each tile is rendered as a rotated div (45°)
  // scaled vertically (50%) so the rotated square lands as an iso diamond.
  // Checkerboard colour comes from the parity of (col+row).
  const tiles: Array<{ col: number; row: number; x: number; y: number; depth: number; tone: 'a' | 'b' }> = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      const { x, y } = isoProject(col, row);
      tiles.push({
        col,
        row,
        x,
        y,
        depth: depthZ(col, row),
        tone: (col + row) % 2 === 0 ? 'a' : 'b',
      });
    }
  }

  return (
    <div className="relative w-full h-[450px] bg-slate-950/70 border border-white/10 rounded-3xl overflow-hidden office-isofloor p-6 shadow-2xl">
      {/* Connection lines — org hierarchy, drawn behind desks/avatars */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {EDGES.map(([from, to]) => {
          const a = DESK_COORDS[from];
          const b = DESK_COORDS[to];
          const fromAgent = getAgent(from);
          const active = fromAgent && fromAgent.status !== 'idle';
          return (
            <line
              key={`edge-${from}-${to}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? '#34d399' : '#475569'}
              strokeWidth={0.18}
              strokeOpacity={active ? 0.5 : 0.25}
              strokeDasharray={active ? '0' : '1.5 1.5'}
            />
          );
        })}
      </svg>

      {/* Diamond floor — render BEFORE desks/avatars so agents sit on top. */}
      {/* Each tile is a div rotated 45° + scaleY 0.5 to become a diamond.   */}
      {/* Width/height in % = 2*TILE_W / 2*TILE_H to cover the iso tile area.*/}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {tiles.map((t) => {
          const toneBg =
            t.tone === 'a'
              ? 'rgba(99, 102, 241, 0.10)'  // indigo (lighter)
              : 'rgba(99, 102, 241, 0.05)'; // indigo (deeper wash)
          const toneBorder =
            t.tone === 'a'
              ? 'rgba(165, 180, 252, 0.18)'
              : 'rgba(99, 102, 241, 0.12)';
          return (
            <div
              key={`tile-${t.col}-${t.row}`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${TILE_W * 2}%`,
                height: `${TILE_H * 4}%`, // unscaled height: 2 * TILE_H = the side length of the rotated square
                backgroundColor: toneBg,
                borderColor: toneBorder,
                transform: 'translate(-50%, -50%) rotate(45deg) scaleY(0.5)',
                zIndex: t.depth, // lower tiles render first
              }}
              className="absolute border"
            />
          );
        })}
      </div>

      {/* Render Desks in Background — sit on the iso tile of each agent */}
      {Object.entries(DESK_COORDS).map(([id, coords]) => {
        const agent = getAgent(id as AgentId);
        if (!agent) return null;
        const active = agent.status !== 'idle';

        return (
          <div
            key={`desk-${id}`}
            style={{ left: `${coords.x}%`, top: `${coords.y + DESK_FLOOR_DROP}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-9 rounded-lg bg-slate-900/40 border border-white/5 flex items-center justify-center shadow-inner pointer-events-none transition-all duration-300"
          >
            {/* glowing monitor — status shown via the avatar pill, screen just glows when active */}
            <div
              className={`w-7 h-4 rounded bg-slate-950/80 border transition-all ${
                active ? 'computer-glow border-sky-400/50' : 'border-slate-700/60'
              }`}
            />
          </div>
        );
      })}

      {/* Render Moving Agents */}
      {agents.map((agent) => {
        const coords = positions[agent.id];
        if (!coords) return null;
        const isWaddling = waddling[agent.id] ?? false;
        const speech = deliveries[agent.id];
        const sparkleAt = sparkles[agent.id];
        const isThinking = agent.status === 'thinking';
        const isWorking = agent.status === 'working';
        const isCore = CORE_AGENTS.has(agent.id);

        return (
          <motion.div
            key={`agent-sprite-${agent.id}`}
            animate={{
              left: `${coords.x}%`,
              top: `${coords.y - 6}%`,
              rotate: isWaddling ? [-4, 4] : 0,
              y: isWaddling ? [0, -6] : 0,
            }}
            transition={isWaddling ? waddleTransition : normalTransition}
            onAnimationComplete={() => handleArrival(agent.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer flex flex-col items-center group"
            onClick={() => openDetailPanel(agent.id)}
            style={{ originY: 0.9 }}
          >
            {/* 💭 Thought bubble while thinking (idle conversation) */}
            <AnimatePresence>
              {isThinking && !speech && (
                <motion.div
                  key="thought"
                  initial={{ scale: 0, opacity: 0, y: 8 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute -top-7 text-lg pointer-events-none select-none"
                >
                  💭
                </motion.div>
              )}
            </AnimatePresence>

            {/* 💬 Speech bubble at delivery — replaces old box popup */}
            <AnimatePresence>
              {speech && (
                <motion.div
                  key="speech"
                  initial={{ scale: 0.6, y: 12, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.6, y: -4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="absolute -top-9 z-30 pointer-events-none select-none"
                >
                  <div className="relative bg-white text-slate-900 text-[9px] font-semibold px-2 py-1 rounded-2xl shadow-lg whitespace-nowrap border border-slate-200">
                    {speech}
                    {/* Bubble tail */}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-white border-b border-r border-slate-200" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ✨ Sparkle burst on arrival */}
            <AnimatePresence>
              {sparkleAt && Date.now() - sparkleAt < 1200 && (
                <motion.div
                  key={`spark-${sparkleAt}`}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center text-2xl pointer-events-none z-30"
                >
                  ✨
                </motion.div>
              )}
            </AnimatePresence>

            {/* 📄 Trailing task paper while walking with a task */}
            <AnimatePresence>
              {isWaddling && (
                <motion.div
                  key="paper"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1, rotate: [-8, 8] }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    rotate: { repeat: Infinity, repeatType: 'mirror', duration: 0.3 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute -right-3 top-1 text-base pointer-events-none select-none drop-shadow"
                >
                  📄
                </motion.div>
              )}
            </AnimatePresence>

            {/* ⚙️ Working indicator — small gear spin near worker while working */}
            <AnimatePresence>
              {isWorking && !isWaddling && !speech && (
                <motion.div
                  key="gear"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, rotate: 360 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    rotate: { repeat: Infinity, ease: 'linear', duration: 3 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute -right-3 -top-1 text-[10px] pointer-events-none select-none opacity-70"
                >
                  ⚙️
                </motion.div>
              )}
            </AnimatePresence>

            {/* Avatar & ring — core agents (ziyue/anmaioyi) render larger for hierarchy */}
            <div
              className={`rounded-xl bg-slate-900/90 border transition-all duration-300 group-hover:scale-105 ${
                isCore ? 'p-1 ring-1 ring-white/10' : 'p-0.5'
              } ${STATUS_BORDER[agent.status]}`}
              style={{ boxShadow: isWaddling ? '0 6px 10px -3px rgba(0,0,0,0.5)' : undefined }}
            >
              <RiveAvatar id={agent.id} status={agent.status} color={agent.color} size={isCore ? 'md' : 'sm'} />
            </div>

            {/* Name + role + status pill (replaces the red health badge) */}
            <div className="mt-1.5 flex flex-col items-center gap-0.5 bg-slate-950/70 rounded-lg px-2 py-1 backdrop-blur-sm">
              <span className={`font-semibold leading-none ${isCore ? 'text-[11px]' : 'text-[9px]'}`} style={{ color: agent.color }}>
                {agent.name}
              </span>
              <span className="text-[7px] text-slate-500 leading-none">{agent.role}</span>
              <span
                className={`mt-0.5 flex items-center gap-1 text-[8px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_PILL[agent.status].pill}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_PILL[agent.status].dot}`} />
                {STATUS_TEXT_TH[agent.status]}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
