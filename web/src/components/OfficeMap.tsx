import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { AgentId, AgentSnapshot, AgentStatus } from '../types';
import { useStore } from '../store';
import { RiveAvatar } from './RiveAvatar';
import { IsoDesk } from './IsoDesk';
import { isoProject, depthZ, depthZFromCoords, ISO_GRID, GRID_SIZE, AUTO_FIT } from '../lib/iso';

// ─── B1.5 — Room zone overlay (3 large iso diamonds) ────────────────────────
// Each zone covers the iso tile range that holds its agents.  Rendered as
// a single SVG polygon (one per zone) BEHIND the floor tiles, so the
// checkerboard tile pattern shows on top while the zone colour tints the
// underlying area.  Zones are defined in grid coords (col,row) and the
// diamond vertices are the four corner tiles of each zone's bbox — using
// tile corners (not centers) so adjacent zones share edges without gaps.
//
// Layout (from ISO_GRID):
//   - Core Room  : ziyue at (2,0). Zone covers col 1..3, row 0..1.
//   - Review Bay : anmaioyi at (2,2). Zone covers col 1..3, row 1..3.
//   - Developer  : wenshu/yanxin/jianfeng/shihao/yefan at row 4.
//                  Zone covers col 0..4, row 3..4.
// Colour choices:
//   - Core   = indigo  (matches the room's strategic / top-of-tree vibe)
//   - Review = cyan    (anmaioyi's role; reflects "review/check" cyan accent)
//   - Dev    = emerald (matches the working-status border colour, ties the
//                        zone visually to "agents actively working")
// B1.5 — each zone also gets a thin stroke + a soft top-edge label so
// the boundary reads as an "office floor" not just a coloured shape.
const ROOM_ZONES = [
  {
    name: 'Core Room',
    color: '99, 102, 241', // indigo-500
    bbox: { colMin: 1, colMax: 3, rowMin: 0, rowMax: 1 },
  },
  {
    name: 'Review Bay',
    color: '34, 211, 238', // cyan-400
    bbox: { colMin: 1, colMax: 3, rowMin: 1, rowMax: 3 },
  },
  {
    name: 'Developer Bay',
    color: '16, 185, 129', // emerald-500
    bbox: { colMin: 0, colMax: 4, rowMin: 3, rowMax: 4 },
  },
] as const;

/**
 * The four "corner tiles" of a rectangular grid bbox project to a single
 * large iso diamond on screen.  Returns the diamond's 4 vertices in the
 * viewBox 0..100 space (so they line up with the diamond floor tiles,
 * which use the same isoProject function).  We use the bbox corner tiles
 * — not the agent tiles — so the zone fully covers its area, including
 * the unoccupied floor around the agent.
 */
function zoneDiamond(bbox: { colMin: number; colMax: number; rowMin: number; rowMax: number }) {
  // The 4 corners of the bbox (col,row):
  //   (colMin, rowMin) — top corner
  //   (colMax, rowMin) — right corner
  //   (colMax, rowMax) — bottom corner
  //   (colMin, rowMax) — left corner
  return {
    top:    isoProject(bbox.colMin, bbox.rowMin),
    right:  isoProject(bbox.colMax, bbox.rowMin),
    bottom: isoProject(bbox.colMax, bbox.rowMax),
    left:   isoProject(bbox.colMin, bbox.rowMax),
  };
}

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

// Home coordinates for each agent — anchored at the iso-tile center.
// Computed once from ISO_GRID. (B1.2: replaces the old flat % DESK_COORDS.)
const HOME_COORDS: Record<AgentId, Coords> = Object.fromEntries(
  (Object.keys(ISO_GRID) as AgentId[]).map((id) => {
    const { col, row } = ISO_GRID[id];
    return [id, isoProject(col, row)];
  })
) as Record<AgentId, Coords>;

// Semicircular delivery offsets around Anmaioyi's desk (sibling agents
// gather in a small semicircle while delivering).  These are in screen-%,
// not iso coords, so they remain unchanged across the iso migration.
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

// B1.3 — sprite-ready character. Drop a PNG at web/public/characters/<id>.png
// and it renders as the avatar. If the file is missing (404) the <img>'s
// onError flips spriteOk[id] → false and we fall back to the RiveAvatar
// emoji renderer. พี่เบญ replace sprite ได้โดยไม่ต้องแก้โค้ด.
const CHARACTER_SPRITE: Record<AgentId, string> = {
  ziyue:    '/characters/ziyue.png',
  anmaioyi: '/characters/anmaioyi.png',
  wenshu:   '/characters/wenshu.png',
  yanxin:   '/characters/yanxin.png',
  jianfeng: '/characters/jianfeng.png',
  shihao:   '/characters/shihao.png',
  yefan:    '/characters/yefan.png',
};

// Org-chart edges for connection lines (reduces empty space + shows hierarchy)
const EDGES: Array<[AgentId, AgentId]> = [
  ['ziyue', 'anmaioyi'],
  ['anmaioyi', 'wenshu'],
  ['anmaioyi', 'yanxin'],
  ['anmaioyi', 'jianfeng'],
  ['anmaioyi', 'shihao'],
  ['anmaioyi', 'yefan'],
];

// C1 — idle breathing bob per-agent stagger.  delay 0..2s spread so 7
// agents never sync (spec: each agent out of phase, ดูเป็นธรรมชาติ).
// Reuses the org-chart hierarchy ordering so the stagger reads as
// "cascade" (top→down) rather than random.
const IDLE_BOB_STAGGER: Record<AgentId, number> = {
  ziyue:    0.0,
  anmaioyi: 0.6,
  wenshu:   1.2,
  yanxin:   1.8,
  jianfeng: 0.3,
  shihao:   0.9,
  yefan:    1.5,
};

// Agent wrapper dimensions — single source of truth so the desk SVG and
// the avatar sit at the same iso anchor. The wrapper contains the full
// cuboid bbox: 2*halfW wide (footprint) and depth+2*halfH tall (box
// height + footprint span). The wrapper is centered on the cuboid's
// bottom diamond center, which lines up with the isoProject tile center.
//
// halfW/halfH/depth are sized so the desk reads as a clear 3D box
// without overlapping neighbours (tiles are 26% apart in iso x, so
// desk width 2*halfW=24% leaves a 2% gap).
// B1.3b — desk footprint sized to fit the auto-fit iso grid.
// With Sx=11.33 between agent centers, the wrapper must be ≤ 11% wide
// to avoid neighbour overlap. The footprint below (2*halfW=9) leaves
// a 2% margin around the desk itself; the wrapper adds 1% padding on
// each side for sprite/label clearance.
const ISO_DESK_HALF_W = 4.5;
const ISO_DESK_HALF_H = 2.25;
const ISO_DESK_DEPTH  = 2.0;
const ISO_DESK_PAD    = 1;
const AGENT_WRAPPER_W = (ISO_DESK_HALF_W + ISO_DESK_PAD) * 2;  // 11
const AGENT_WRAPPER_H = ISO_DESK_DEPTH + (ISO_DESK_HALF_H + ISO_DESK_PAD) * 2;  // 2 + 6.5 = 8.5
// Top of the desk in wrapper-local % = where the avatar's feet should sit.
// The cuboid's top diamond center is at viewBox y=-depth; mapped to SVG
// (which fills the wrapper), that's y = (depth + halfH + pad) / vbH.
const DESK_TOP_Y_PCT = ((ISO_DESK_DEPTH + ISO_DESK_HALF_H + ISO_DESK_PAD) / AGENT_WRAPPER_H) * 100;

export function OfficeMap() {
  const agents = useStore((s) => s.agents);
  const openDetailPanel = useStore((s) => s.openDetailPanel);
  // C1 — a11y: respect prefers-reduced-motion.  motion/react hook
  // mirrors window.matchMedia('(prefers-reduced-motion: reduce)') and
  // re-renders on change.  When true, the idle bob is skipped entirely
  // (return transform-free, no animation) so the office stays static
  // for users who need it.
  const prefersReducedMotion = useReducedMotion();

  // Position state for each agent (can be different from home desk when walking)
  const [positions, setPositions] = useState<Record<AgentId, Coords>>(() => ({ ...HOME_COORDS }));
  // Waddling state to trigger wobbling keyframes
  const [waddling, setWaddling] = useState<Record<AgentId, boolean>>(() => ({
    ziyue: false, anmaioyi: false, wenshu: false, yanxin: false, jianfeng: false, shihao: false, yefan: false
  }));
  // Delivery speech bubble state — bubble text per agent
  const [deliveries, setDeliveries] = useState<Record<AgentId, string | null>>(() => ({
    ziyue: null, anmaioyi: null, wenshu: null, yanxin: null, jianfeng: null, shihao: null, yefan: null,
  }));
  // Celebration burst (sparkle) on arrival — keyed by agent id with timestamp
  const [sparkles, setSparkles] = useState<Record<AgentId, number | null>>(() => ({
    ziyue: null, anmaioyi: null, wenshu: null, yanxin: null, jianfeng: null, shihao: null, yefan: null,
  }));
  // B1.3 — per-agent sprite availability. Starts true; flips false on <img> error.
  const [spriteOk, setSpriteOk] = useState<Record<AgentId, boolean>>(() => ({
    ziyue: true, anmaioyi: true, wenshu: true, yanxin: true, jianfeng: true, shihao: true, yefan: true,
  }));
  // C1 — per-agent hover state.  Hover should suppress the idle bob
  // (B1.5 hover raise takes over the y channel).  Tracked locally
  // (not in zustand) because it's UI-local and never needs to outlive
  // the office view.
  const [hovered, setHovered] = useState<Record<AgentId, boolean>>(() => ({
    ziyue: false, anmaioyi: false, wenshu: false, yanxin: false, jianfeng: false, shihao: false, yefan: false,
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
    const baseCoords = HOME_COORDS[targetId];
    const offset = targetId === 'anmaioyi' ? (DELIVERY_OFFSETS[agentId] || { x: 0, y: 0 }) : { x: 0, y: 0 };
    setPositions((prev) => ({
      ...prev,
      [agentId]: {
        x: baseCoords.x + offset.x,
        y: baseCoords.y + offset.y
      }
    }));
  };

  // C3 — listen for handoff events from SSE to route delivery walks to
  // anmaioyi (the delivery coordinator). The `to_agent` field in the handoff
  // event means "who owns the next task in the chain" — NOT the delivery
  // destination. All specialist → specialist handoffs route through anmaioyi.
  const events = useStore((s) => s.events);
  useEffect(() => {
    const handoff = events[0];
    if (!handoff || handoff.kind !== 'handoff') return;
    const { from_agent } = handoff;
    if (!from_agent) return;
    // `prefers-reduced-motion`: skip animation, still route logically
    if (prefersReducedMotion) return;
    // Route to anmaioyi (delivery coordinator) — NEVER walk to another specialist
    triggerWalk(from_agent, 'anmaioyi');
    // Deduplicate: only react to the newest event (events[0] is newest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

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
      x: HOME_COORDS['anmaioyi'].x + offset.x,
      y: HOME_COORDS['anmaioyi'].y + offset.y
    };
    const ownPos = HOME_COORDS[id];
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
          const a = HOME_COORDS[from];
          const b = HOME_COORDS[to];
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

      {/* B1.5 — Room zone overlay. Three large iso diamonds tinted with
          the room colour.  Drawn BEHIND the floor tiles so the
          checkerboard tile pattern shows on top while the zone colour
          tints the underlying area.  Each zone is a single SVG polygon
          (4 vertices from the bbox corner tiles) — no DOM-tile fan-out
          so the cost stays constant regardless of grid size.
          Depth z-order: the top zone (Core) renders first, the bottom
          zone (Developer) renders last so it sits visually closer
          (matches the floor's depth-z "lower = closer" rule). */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {ROOM_ZONES.map((zone) => {
          const d = zoneDiamond(zone.bbox);
          const pts = `${d.top.x},${d.top.y} ${d.right.x},${d.right.y} ${d.bottom.x},${d.bottom.y} ${d.left.x},${d.left.y}`;
          // Compute a soft top-edge label position (midpoint of the
          // zone's top edge, slightly above the diamond's top corner).
          const labelX = (d.top.x + d.right.x) / 2;
          const labelY = d.top.y - 0.5;
          return (
            <g key={`zone-${zone.name}`}>
              <polygon
                points={pts}
                fill={`rgba(${zone.color}, 0.10)`}
                stroke={`rgba(${zone.color}, 0.45)`}
                strokeWidth={0.12}
                strokeDasharray="0.4 0.3"
                strokeLinejoin="round"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fontSize={1.2}
                fontWeight={600}
                letterSpacing="0.4"
                fill={`rgba(${zone.color}, 0.75)`}
                style={{ textTransform: 'uppercase' }}
              >
                {zone.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Diamond floor — render BEFORE desks/avatars so agents sit on top. */}
      {/* Each tile is a div rotated 45° + scaleY 0.5 to become a diamond.   */}
      {/* Width/height in % = 2*AUTO_FIT.Sx / 2*AUTO_FIT.Sy to cover the iso tile area.
          The tile is the unrotated square that gets rotated 45° + scaleY 0.5, so
          its unscaled height must be 2 * the desired screen height (Sy). */}
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
                width: `${AUTO_FIT.Sx * 2}%`,
                height: `${AUTO_FIT.Sy * 4}%`, // unscaled: 2 * desired screen y (Sy)
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

      {/* Per-agent group: desk (iso box) + avatar (billboard). Each wrapper
          is anchored at the agent's iso tile center; the wrapper's zIndex
          = depthZ(home col, home row) so foreground agents sit on top of
          background ones. The outer motion.div handles delivery walk —
          the entire station (desk + avatar) translates together — while a
          nested motion.div carries the waddle rotate/y bob on the avatar
          alone (so the desk doesn't tilt). */}
      {agents.map((agent) => {
        const coords = positions[agent.id];
        if (!coords) return null;
        const isWaddling = waddling[agent.id] ?? false;
        const speech = deliveries[agent.id];
        const sparkleAt = sparkles[agent.id];
        const isThinking = agent.status === 'thinking';
        const isWorking = agent.status === 'working';
        // C1 — idle bob trigger.  Only when the agent is at rest (not
        // waddling/walking, not hover, not working, not thinking) and
        // the user hasn't opted out of motion.  Hover state lives on
        // the inner motion.div (whileHover y:-2.5) and is intentionally
        // NOT checked here — the wrapper-level hover raise and the
        // idle bob use different motion nodes so they compose cleanly.
        const isHovered = hovered[agent.id] ?? false;
        const isIdle = agent.status === 'idle' && !isWaddling && !isWorking && !isThinking && !isHovered;
        const shouldBob = isIdle && !prefersReducedMotion;
        // C2 — typing lean trigger.  Only when the agent is at the desk
        // actively working, not waddling, not hovered, and the user
        // hasn't opted out of motion.  Mirrors the C1 shouldBob gate so
        // the two poses share the same a11y behavior.  Hover suppresses
        // lean so the hover raise (B1.5 y:-2.5) reads cleanly without
        // competing with the rotate/scaleY pose.
        const shouldLean = isWorking && !isWaddling && !isHovered && !prefersReducedMotion;
        const bobDelay = IDLE_BOB_STAGGER[agent.id] ?? 0;
        const isCore = CORE_AGENTS.has(agent.id);
        const { row: homeRow, col: homeCol } = ISO_GRID[agent.id];
        // B2 — depth-aware sprite scaling.  Front-row agents (high col+row)
        // render larger than back-row (low col+row) so the iso depth gradient
        // is reinforced visually.  Two ranges (core vs non-core) preserve
        // the visual hierarchy set up in B1.5: core agents stay slightly
        // larger than non-core across all depths.
        //   back row  (ziyue  col+row=2) → depthScore 0.25 → smallest
        //   front row (yefan   col+row=8) → depthScore 1.0  → largest
        // Caps the existing 12px (core) / 10px (non-core) booleans at the
        // back, and grows to 14px / 12px at the front — keeps the
        // wenshu/anmaioyi rows readable while the front row gets the
        // visual weight the iso perspective implies.
        const depthScore = (homeCol + homeRow) / 8; // 0 (back) → 1 (front) on 5x5
        const spriteBase = isCore ? 12 : 10; // px — back-row anchor
        const spriteSize = spriteBase + depthScore * 2; // back=base, front=base+2
        const active = agent.status !== 'idle';

        return (
          <motion.div
            key={`agent-group-${agent.id}`}
            data-agent-id={agent.id}
            animate={{
              left: `${coords.x}%`,
              top: `${coords.y}%`,
            }}
            transition={normalTransition}
            onAnimationComplete={() => handleArrival(agent.id)}
            className="absolute flex flex-col items-center"
            style={{
              // B1.2 — z-index tracks depthZ of the **current** screen
              // position. B1.4: previously bound to home (col,row) so
              // the waddling specialist kept the home-tile z-index even
              // mid-walk — which made them disappear behind anmaioyi
              // (same depth) or briefly sit behind a foreground row.
              // depthZFromCoords unprojects the current position so the
              // z-index smoothly tracks the iso walk line. When the
              // agent is at home the value matches depthZ(home) exactly.
              zIndex: depthZFromCoords(coords.x, coords.y),
              width: `${AGENT_WRAPPER_W}%`,
              height: `${AGENT_WRAPPER_H}%`,
              // Anchor wrapper at its top-left, but children inside use the
              // wrapper's centre as the iso origin. So we shift the wrapper
              // left by half its width and up by half its height to keep
              // isoProject(col,row) as the visual anchor.
              marginLeft: `-${AGENT_WRAPPER_W / 2}%`,
              marginTop: `-${AGENT_WRAPPER_H / 2}%`,
            }}
          >
            {/* Iso desk — the SVG fills the wrapper directly. ViewBox is
                centered on the cuboid's bottom diamond center (which sits
                on the floor tile center) and spans the full cuboid
                bbox. 1 viewBox unit = 1% of the office container, so the
                geometry matches the wrapper %-units.
                C2 — pass explicit `mode` so the monitor colour + glow
                class match the avatar state. We map the agent status to
                monitorMode directly: idle→idle, thinking→thinking,
                working→working, anything else (done/failed/blocked) →
                idle (monitor is off when not actively working). */}
            <IsoDesk
              agentId={agent.id}
              color={agent.color}
              halfW={ISO_DESK_HALF_W}
              halfH={ISO_DESK_HALF_H}
              depth={ISO_DESK_DEPTH}
              mode={
                agent.status === 'working' || agent.status === 'thinking'
                  ? agent.status
                  : 'idle'
              }
            />

            {/* Avatar billboard — flat, ตั้งตรง, no rotate. Anchored so
                its bottom sits on the desk top.
                Outer <div>: positioning — left/top + translate(-50%, -100%)
                so the bottom-center of the inner motion.div lands on the
                desk top.
                Inner <motion.div>: waddle rotate + y bob ONLY. Motion
                rewrites the entire transform on animation, so the
                positioning translate has to live on the parent
                (otherwise the avatar snaps to the top-left during the
                waddle). */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: `${DESK_TOP_Y_PCT}%`,
                transform: 'translate(-50%, -100%)',
                transformOrigin: '50% 100%',
              }}
            >
              <motion.div
                animate={{
                  // C1 — idle breathing bob.  Y oscillates ±1.5px around 0
                  // (subtle, ฟีลหายใจ).  Compose with waddle by ADDING
                  // values instead of replacing — waddle is [-4,4] rotate
                  // and [0,-3] y, idle bob is [−1.5,1.5] y.  When both
                  // are active the waddle wins on y (we only flip to
                  // waddle values here when isWaddling).  When neither,
                  // y stays at 0 (no animation).  `rotate` is waddle-only;
                  // idle bob never rotates.
                  // C2 — typing lean when working (not waddling, not
                  // hovered).  Subtle periodic rotate sway (-2°→+2°)
                  // with a small y/scaleY pulse to feel like leaning
                  // into the keyboard.  Sits between waddle and bob:
                  //   isWaddling   → waddle values
                  //   shouldLean   → lean values (rotate + y + scaleY)
                  //   shouldBob    → idle bob
                  //   else         → static (duration: 0)
                  // `rotate` is now 3-way: waddle | lean | 0.
                  rotate: isWaddling
                    ? [-4, 4]
                    : shouldLean
                    ? [-2, 2]
                    : 0,
                  y: isWaddling
                    ? [0, -3]
                    : shouldLean
                    ? [-1, 0.5]
                    : shouldBob
                    ? [-1.5, 1.5]
                    : 0,
                  // C2 — scaleY squash to read as "leaning into the desk"
                  // while typing.  Only set in the lean branch; waddle
                  // and bob use the default 1 (motion will not animate a
                  // missing key, but we pass 1 explicitly to be safe so
                  // the previous scaleY value doesn't linger from a
                  // lean→idle transition).
                  scaleY: shouldLean ? [0.97, 1] : 1,
                }}
                transition={
                  isWaddling
                    ? waddleTransition
                    : shouldLean
                    ? {
                        rotate: {
                          repeat: Infinity,
                          repeatType: 'mirror',
                          duration: 1.4,
                          ease: 'easeInOut',
                        },
                        y: {
                          repeat: Infinity,
                          repeatType: 'mirror',
                          duration: 1.4,
                          ease: 'easeInOut',
                        },
                        scaleY: {
                          repeat: Infinity,
                          repeatType: 'mirror',
                          duration: 1.4,
                          ease: 'easeInOut',
                        },
                      }
                    : shouldBob
                    ? {
                        y: {
                          repeat: Infinity,
                          repeatType: 'mirror',
                          duration: 2.8,
                          ease: 'easeInOut',
                          delay: bobDelay,
                        },
                      }
                    : { duration: 0 }
                }
                className="flex flex-col items-center cursor-pointer group"
                style={{ transformOrigin: '50% 100%' }}
                onClick={() => openDetailPanel(agent.id)}
                onHoverStart={() => setHovered((prev) => ({ ...prev, [agent.id]: true }))}
                onHoverEnd={() => setHovered((prev) => ({ ...prev, [agent.id]: false }))}
                /* B1.5 — hover state lives on the wrapper so the inner
                    avatar/label can react via group-hover (CSS) while
                    the motion waddle still drives rotate/y. The raise
                    itself rides on a separate inner motion.div that
                    applies y ONLY when hovered, so it composes with
                    (never fights) the outer waddle y. */
              >
                <motion.div
                  className="flex flex-col items-center"
                  whileHover={{ y: -2.5 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
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

              {/* Avatar & ring — core agents (ziyue/anmaioyi) render larger for hierarchy.
                  B1.3 — try sprite PNG first; on 404 the <img> onError flips
                  spriteOk[id] to false and we fall through to the RiveAvatar
                  emoji renderer.
                  B1.5 — replaced group-hover:scale-105 with a status-coloured
                  ring + 1.04 scale, since the parent motion.div already
                  raises on hover (whileHover y:-2.5).  The ring colour
                  matches agent.color so the hover affordance reads as
                  "this agent is selectable" without competing with the
                  status border (which already encodes working/done/etc.). */}
              <div
                className={`rounded-xl bg-slate-900/90 border transition-all duration-300 group-hover:scale-[1.04] group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-offset-slate-950 ${
                  isCore ? 'p-1 ring-1 ring-white/10' : 'p-0.5'
                } ${STATUS_BORDER[agent.status]}`}
                style={{
                  boxShadow: isWaddling ? '0 6px 10px -3px rgba(0,0,0,0.5)' : undefined,
                  // B1.5 — hover ring tinted with agent color.  Tailwind
                  // can't compose dynamic color in ring-* class, so set
                  // --tw-ring-color inline. group-hover:ring-2 above
                  // activates the ring; this color overrides the default.
                  ['--tw-ring-color' as string]: agent.color,
                } as React.CSSProperties}
              >
                {spriteOk[agent.id] ? (
                  <img
                    src={CHARACTER_SPRITE[agent.id]}
                    alt={agent.name}
                    onError={() => setSpriteOk((prev) => (prev[agent.id] ? prev : { ...prev, [agent.id]: false }))}
                    // B2 — depth-aware size.  Inline width/height beats the
                    // Tailwind className so we can interpolate non-discrete
                    // sizes (e.g. 11.25px for mid-row) the class system can't.
                    className="object-contain"
                    style={{ width: `${spriteSize}px`, height: `${spriteSize}px` }}
                    draggable={false}
                  />
                ) : (
                  <RiveAvatar
                    id={agent.id}
                    status={agent.status}
                    color={agent.color}
                    // B2 — pass numeric size so the emoji fallback tracks
                    // the same iso depth gradient as the sprite path.
                    width={spriteSize}
                    height={spriteSize}
                  />
                )}
              </div>

              {/* B1.3b — compact label (name + role only) positioned to avoid
                  overlap with neighbours. Status is shown via the sprite border
                  ring (STATUS_BORDER) and the name colour; the full status pill
                  is reserved for the detail panel so the map stays clean.

                  Stagger rule:
                  - row === ISO_GRID.max_row  (bottom row, no agent below)
                      → label ABOVE the sprite
                  - else (top/mid, an agent may be below)
                      → label BELOW the sprite
                  This way labels never fight with the row below, and the
                  bottom row's labels sit on the empty floor in front of them. */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none ${
                  homeRow === 4 ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
                style={{ width: 'max-content', maxWidth: '14%' }}
              >
                <span
                  className="font-semibold leading-none whitespace-nowrap"
                  style={{ color: agent.color, fontSize: isCore ? '10px' : '8.5px' }}
                >
                  {agent.name}
                </span>
                <span className="mt-0.5 text-slate-400 leading-none whitespace-nowrap" style={{ fontSize: '6.5px' }}>
                  {agent.role}
                </span>
              </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
