// Isometric projection utilities for Heaveneye OfficeMap (Phase B1.1 + B1.3b)
//
// Grid (col, row) → screen percent (x, y) within the office container.
// The projection is **auto-fit**: instead of hard-coding TILE_W/H + ORIGIN,
// we compute a single {Sx, Sy, X0, Y0} from the GRID layout so all agent
// wrappers fit inside the container with a small edge padding. Iso aspect
// (Sy / Sx = TILE_H / TILE_W = 0.5) is preserved.
//
// Design notes (B1.3b — auto-fit fix):
// - The previous hard-coded TILE_W=13 + ORIGIN_X=50 put wenshu at x=-2%
//   and ziyue at x=76% — both pushed off the visible area. Auto-fit
//   fixes the bbox in one place.
// - Wrapper half-extent is exposed as a constant so callers (OfficeMap)
//   can use the same number for "is this wrapper inside the container"
//   checks during dev. The runtime math doesn't depend on it.
// - isoProject(col,row) is now derived from the auto-fit constants so
//   any future grid change propagates without touching call sites.

import type { AgentId } from '../types';

/** Iso aspect ratio. Width-to-height of one tile is 2:1 (the classic iso diamond). */
export const ISO_ASPECT = 0.5; // Sy / Sx
/**
 * Agent wrapper half-width in % of the office container. Mirrors
 * AGENT_WRAPPER_W / 2 in OfficeMap.tsx — AGENT_WRAPPER_W =
 * (ISO_DESK_HALF_W + ISO_DESK_PAD) * 2 = (4.5 + 1) * 2 = 11, so the
 * half is 5.5. Used only by the auto-fit helper (usableX = 100 - 2*EDGE_PAD
 * - 2*WRAPPER_HALF_W) to ensure no wrapper gets clipped at the edge.
 *
 * Why 5.5 (not 13): the older value of 13 reserved ~26% of container width
 * for "wrapper margin that doesn't exist" — the desks/wrappers are
 * actually 11% wide. The 13 caused Sx to land at 11.33%, leaving the
 * office visibly small/loose. With 5.5, usableX jumps 68→83 (+22%) and
 * Sx scales accordingly so the office fills the container.
 */
export const WRAPPER_HALF_W = 5.5;
/** Auto-fit edge padding — the closest any agent wrapper may come to a container edge.
 *  B2 — bumped 3% → 5% so the bottom-left agent (wenshu, col=0,row=4 → xRaw=-4)
 *  has enough left-edge breathing room.  Previously the bbox-centered X0 put
 *  wenshu at wrapper x ≈ 24px on a 1120px container, leaving only 38px of
 *  label clearance from the container edge (label needed ≥ 80px from left
 *  to read cleanly).  5% gives ~56px margin which clears the 80px target. */
const EDGE_PAD = 5; // %

/**
 * The home grid — agent (col, row) coordinates. B1.3b: kept the same 5x5
 * layout as B1.3, but the projection now scales to fit the container.
 */
export const ISO_GRID: Record<AgentId, { col: number; row: number }> = {
  ziyue:    { col: 2, row: 0 }, // top    — Core Room
  anmaioyi: { col: 2, row: 2 }, // middle — Review Bay
  wenshu:   { col: 0, row: 4 }, // bottom — Developer Bay
  yanxin:   { col: 1, row: 4 },
  jianfeng: { col: 2, row: 4 },
  shihao:   { col: 3, row: 4 },
  yefan:    { col: 4, row: 4 },
};

/** Grid extent — 5x5 covers 7 agents (1 top, 1 mid, 5 along the bottom row). */
export const GRID_SIZE = 5;

/**
 * Auto-fit parameters — computed once at module load.
 *
 *   isoProject(col, row).x = X0 + (col - row) * Sx
 *   isoProject(col, row).y = Y0 + (col + row) * Sy
 *
 * Constraints (in priority order):
 *   1. Sy = Sx * ISO_ASPECT   (preserve diamond look)
 *   2. Wrapper x range ⊂ [EDGE_PAD, 100 - EDGE_PAD]   (no clipping)
 *   3. Wrapper y range ⊂ [EDGE_PAD, 100 - EDGE_PAD]   (no clipping)
 *   4. Agent BBOX center lands at (50, 50) so left/right edge
 *      padding is symmetric (C0.1 — was centroid-based, left
 *      asymmetric edge padding whenever xRawMin/xRawMax were not
 *      equidistant from the mean)
 */
function computeAutoFit(grid: Record<AgentId, { col: number; row: number }>) {
  let xRawMin = Infinity, xRawMax = -Infinity;
  let yRawMin = Infinity, yRawMax = -Infinity;
  for (const { col, row } of Object.values(grid)) {
    const xr = col - row;
    const yr = col + row;
    if (xr < xRawMin) xRawMin = xr;
    if (xr > xRawMax) xRawMax = xr;
    if (yr < yRawMin) yRawMin = yr;
    if (yr > yRawMax) yRawMax = yr;
  }

  const xSpanRaw = xRawMax - xRawMin; // > 0
  const ySpanRaw = yRawMax - yRawMin; // > 0

  // Required Sx to fit wrapper extents horizontally.
  // wrapper x range = [X0 + xRawMin*Sx - WRAPPER_HALF_W, X0 + xRawMax*Sx + WRAPPER_HALF_W]
  // We want this to be ⊂ [EDGE_PAD, 100 - EDGE_PAD], so:
  //   X0 + xRawMin*Sx - WRAPPER_HALF_W >= EDGE_PAD
  //   X0 + xRawMax*Sx + WRAPPER_HALF_W <= 100 - EDGE_PAD
  // Subtracting: (xRawMax - xRawMin) * Sx <= 100 - 2*EDGE_PAD - 2*WRAPPER_HALF_W
  const usableX = 100 - 2 * EDGE_PAD - 2 * WRAPPER_HALF_W;
  const usableY = 100 - 2 * EDGE_PAD; // y wrapper extent comes from depth label etc.
  const SxFromX = usableX / xSpanRaw;
  const SxFromY = (usableY / ySpanRaw) / ISO_ASPECT; // because Sy = Sx * ISO_ASPECT
  const Sx = Math.min(SxFromX, SxFromY);
  const Sy = Sx * ISO_ASPECT;

  // X0: center the agent BBOX (not the centroid). Centering the centroid
  // leaves asymmetric edge padding whenever xRawMin/xRawMax are not
  // equidistant from the mean (e.g. the current grid has wenshu at
  // xRaw=-4 and ziyue at xRaw=+2, so a centroid-based X0 puts ziyue
  // ~0.28*Sx closer to the right edge than wenshu is to the left).
  // Bbox-centering gives equal EDGE_PAD on both sides.
  const xBboxCenter = (xRawMin + xRawMax) / 2;
  const yBboxCenter = (yRawMin + yRawMax) / 2;
  const X0 = 50 - xBboxCenter * Sx;
  const Y0 = 50 - yBboxCenter * Sy;

  return { Sx, Sy, X0, Y0 };
}

const FIT = computeAutoFit(ISO_GRID);

/** Public so tests / debug overlays can read what we ended up with. */
export const AUTO_FIT = FIT;

/** Grid coordinate (col, row) → screen percent { x, y } (auto-fit). */
export function isoProject(col: number, row: number): { x: number; y: number } {
  return {
    x: FIT.X0 + (col - row) * FIT.Sx,
    y: FIT.Y0 + (col + row) * FIT.Sy,
  };
}

/**
 * Depth-sort key: things "lower/closer" (higher col+row) render on top.
 * Returns an integer for stable use as a CSS z-index.
 */
export function depthZ(col: number, row: number): number {
  return Math.round((col + row) * 10);
}

/**
 * Inverse projection: screen percent { x, y } → fractional grid
 * (col, row). Used during a waddle walk to compute the depth-sort
 * z-index for the **current** screen position — important because
 * as a specialist walks from their home tile toward anmaioyi's tile
 * the (col+row) along the iso line can change (e.g. home row 4 →
 * anmaioyi (2,2) means row goes 4→3→2). The result is fractional
 * (the walking agent isn't sitting on a tile center); callers
 * (depthZFromCoords) round it for z-index use.
 *
 * B1.4 — added so the wrapper z-index can track walk progress
 * instead of staying fixed at the home tile's depthZ.
 */
export function isoUnproject(x: number, y: number): { col: number; row: number } {
  // x = X0 + (col - row) * Sx  → col - row = (x - X0) / Sx
  // y = Y0 + (col + row) * Sy  → col + row = (y - Y0) / Sy
  // solve:
  const cr = (x - FIT.X0) / FIT.Sx; // col - row
  const sr = (y - FIT.Y0) / FIT.Sy; // col + row
  return { col: (cr + sr) / 2, row: (sr - cr) / 2 };
}

/**
 * Depth-sort z-index for an arbitrary screen position (used during
 * the waddle walk). Equivalent to depthZ on the fractional (col,row)
 * that the screen position unprojects to. Result is an integer so it
 * stays stable as a CSS z-index.
 */
export function depthZFromCoords(x: number, y: number): number {
  const { col, row } = isoUnproject(x, y);
  return Math.round((col + row) * 10);
}
