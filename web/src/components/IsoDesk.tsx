// IsoDesk — fake-iso 2.5D box (B1.2)
//
// Renders a small cuboid that sits on a diamond floor tile:
//   - top face: diamond (the visible top of the desk)
//   - right wall: parallelogram (the right side of the desk)
//   - left wall:  parallelogram (the left side of the desk)
//
// Geometry: the **bottom diamond center** (the footprint on the floor)
// is at the local origin (0, 0). The **top diamond center** is shifted
// UP in screen-y by `depth` — this is the "world up" of the cuboid.
// 1 viewBox unit = 1% of the office container, so vertex coords and
// halfW/halfH/depth can be tuned in screen-% directly.
//
// SVG is the cleanest vehicle for this geometry (sharp edges, scales
// cleanly with the wrapper, no skew/clip-path tuning).

interface IsoDeskProps {
  /** Agent id — used to color the desk top tint per role */
  agentId: string;
  /** Tint color (hex) for the top face — usually agent.color */
  color: string;
  /** Half-width of the diamond footprint, in % of the office container. Default 9. */
  halfW?: number;
  /** Half-height of the diamond footprint, in %. Default 4.5 (iso 2:1). */
  halfH?: number;
  /** Box "height" in screen-%. Default 2.4 — just enough to read as 3D. */
  depth?: number;
  /** When true, the monitor screen glows (status-aware). */
  active?: boolean;
}

export function IsoDesk({
  agentId,
  color,
  halfW = 9,
  halfH = 4.5,
  depth = 2.4,
  active = false,
}: IsoDeskProps) {
  // Cuboid vertices. Bottom diamond center is at the origin (0, 0);
  // top diamond center is at (0, -depth). In screen-% this means the
  // footprint lands on the office floor and the top of the desk sits
  // 2.4% above it.
  const top    = { x: 0,       y: -depth - halfH };   // back tip of top diamond
  const tr     = { x: halfW,   y: -depth };           // right tip of top diamond
  const tb     = { x: 0,       y: -depth + halfH };   // front tip of top diamond (shared with right & left walls)
  const tl     = { x: -halfW,  y: -depth };           // left tip of top diamond
  const br     = { x: halfW,   y: 0 };                // right tip of bottom diamond (on the floor)
  const bot    = { x: 0,       y: halfH };            // front tip of bottom diamond
  const bl     = { x: -halfW,  y: 0 };                // left tip of bottom diamond

  // Faces
  const topPts   = [top, tr, tb, tl];               // top diamond
  const rightPts = [tr, br, bot, tb];               // right parallelogram wall
  const leftPts  = [tl, tb, bot, bl];               // left parallelogram wall

  const pointsToStr = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p) => `${p.x},${p.y}`).join(' ');

  // Wall colors derived from the top tint — right is darker (away from
  // ambient light), left is slightly lighter (closer to it). The diff is
  // small (slate-900 vs slate-800) but reads as 3D in dark mode.
  const topFill    = `${color}33`; // tinted glass, ~20% alpha
  const topStroke  = `${color}aa`;
  const rightFill  = 'rgba(2, 6, 23, 0.92)';        // very dark, almost black
  const rightStroke = 'rgba(148, 163, 184, 0.20)';
  const leftFill   = 'rgba(51, 65, 85, 0.85)';      // slate-700ish — lighter
  const leftStroke = 'rgba(203, 213, 225, 0.25)';   // lighter stroke too

  // Monitor sits on the top face — a small dark rect centered, with a
  // glowing border when the agent is active.
  const monitorW = halfW * 0.55;
  const monitorH = halfH * 0.4;
  const monitorX = -monitorW / 2;
  const monitorY = -depth - monitorH / 2;
  const monitorFill   = active ? 'rgba(56, 189, 248, 0.55)' : 'rgba(15, 23, 42, 0.85)';
  const monitorStroke = active ? 'rgba(125, 211, 252, 0.85)' : 'rgba(148, 163, 184, 0.35)';

  // ViewBox: span the full cuboid bbox (x: -halfW..+halfW,
  // y: -depth-halfH..+halfH) plus 1 unit padding so strokes don't clip.
  const pad = 1;
  const vbX = -halfW - pad;
  const vbY = -depth - halfH - pad;
  const vbW = (halfW + pad) * 2;
  const vbH = depth + (halfH + pad) * 2;

  // B1.5 — ground contact shadow. Sits on the floor at the bottom
  // diamond's widest point (around (0, 0)) so it reads as the cuboid
  // "casting onto" the iso plane. Drawn FIRST so the walls + top
  // cover it where they overlap — only the outer halo shows.
  // rx/ry in iso plane: a ground contact shadow is wider on x than y
  // (the iso compresses the y axis by ISO_ASPECT=0.5).
  const shadowRx = halfW * 1.5;
  const shadowRy = halfH * 0.9;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      aria-hidden
    >
      {/* B1.5 — ground contact shadow (radial gradient, drawn before the
          cuboid so only the outer halo shows around the desk feet).
          The gradient id is per-agent (url(#ground-shadow-${agentId}))
          because SVG <defs> ids are document-global; reusing the same
          id across many IsoDesk instances would make url() resolve to
          whichever element was first in the DOM. */}
      <ellipse
        cx={0}
        cy={halfH * 0.4}
        rx={shadowRx}
        ry={shadowRy}
        fill={`url(#ground-shadow-${agentId})`}
      />
      {/* Right wall — drawn first so the top face sits on top */}
      <polygon
        points={pointsToStr(rightPts)}
        fill={rightFill}
        stroke={rightStroke}
        strokeWidth={0.12}
        strokeLinejoin="round"
      />
      {/* Left wall */}
      <polygon
        points={pointsToStr(leftPts)}
        fill={leftFill}
        stroke={leftStroke}
        strokeWidth={0.12}
        strokeLinejoin="round"
      />
      {/* Top diamond (the desktop) — tinted with agent color */}
      <polygon
        points={pointsToStr(topPts)}
        fill={topFill}
        stroke={topStroke}
        strokeWidth={0.18}
        strokeLinejoin="round"
      />
      {/* Monitor (small screen on the top face) */}
      <rect
        x={monitorX}
        y={monitorY}
        width={monitorW}
        height={monitorH}
        rx={0.4}
        ry={0.4}
        fill={monitorFill}
        stroke={monitorStroke}
        strokeWidth={0.1}
        className={active ? 'computer-glow' : undefined}
      />
      {/* Defs — shared gradient for the ground-contact shadow. */}
      <defs>
        <radialGradient id={`ground-shadow-${agentId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(2, 6, 23, 0.55)" />
          <stop offset="60%" stopColor="rgba(2, 6, 23, 0.28)" />
          <stop offset="100%" stopColor="rgba(2, 6, 23, 0)" />
        </radialGradient>
      </defs>
    </svg>
  );
}
