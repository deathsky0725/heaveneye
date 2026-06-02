// Isometric projection utilities for Heaveneye OfficeMap (Phase B1.1)
// Pure math, no CSS 3D / PixiJS — fake-iso 2.5D per plan.phase-b-isometric.md
//
// Grid (col, row) → screen percent (x, y) within the office container.
// Tune TILE_W/TILE_H for the look — TILE_H ≈ TILE_W/2 is the "iso" ratio.

import type { AgentId } from '../types';

export const TILE_W = 13;   // half-width of a diamond tile (%)
export const TILE_H = 6.5;  // half-height (%)

export const ORIGIN_X = 50; // center the grid horizontally (%)
export const ORIGIN_Y = 14; // top padding (%)

/** Grid coordinate (col, row) → screen percent { x, y }. */
export function isoProject(col: number, row: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + (col - row) * TILE_W,
    y: ORIGIN_Y + (col + row) * TILE_H,
  };
}

/**
 * Depth-sort key: things "lower/closer" (higher col+row) render on top.
 * Returns an integer for stable use as a CSS z-index.
 */
export function depthZ(col: number, row: number): number {
  return Math.round((col + row) * 10);
}

/** Grid extent — 5x5 covers 7 agents (ziyue top, anmaioyi mid, 5 along the bottom row). */
export const GRID_SIZE = 5;

/** Agent home positions on the iso grid. */
export const ISO_GRID: Record<AgentId, { col: number; row: number }> = {
  ziyue:    { col: 2, row: 0 }, // top    — Core Room
  anmaioyi: { col: 2, row: 2 }, // middle — Review Bay
  wenshu:   { col: 0, row: 4 }, // bottom — Developer Bay
  yanxin:   { col: 1, row: 4 },
  jianfeng: { col: 2, row: 4 },
  shihao:   { col: 3, row: 4 },
  yefan:    { col: 4, row: 4 },
};
