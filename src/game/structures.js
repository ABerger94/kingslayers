// Main-thread view of solid structures (castle walls, gate, keep, palisades) on the nav grid.
// Used for player/vehicle collision and to stop bullets and grenades. Kept in sync with the
// simulation through 'forts' / 'cellGone' events.
import { NAV_CELL, NAV_DIM, HALF_WORLD } from '../shared/constants.js';
import { castleCells, structureHeight } from '../shared/castle.js';

const top = new Float32Array(NAV_DIM * NAV_DIM);
for (const cell of castleCells()) top[cell.c] = structureHeight(cell.type, cell.tower);

export const PALISADE_H = 3.2;

export function cellOf(x, z) {
  const cx = Math.floor((x + HALF_WORLD) / NAV_CELL), cz = Math.floor((z + HALF_WORLD) / NAV_CELL);
  if (cx < 0 || cz < 0 || cx >= NAV_DIM || cz >= NAV_DIM) return -1;
  return cz * NAV_DIM + cx;
}

// Height of the structure standing at (x, z) above the ground, or 0
export function structTop(x, z) {
  const c = cellOf(x, z);
  return c < 0 ? 0 : top[c];
}

export function setStructure(c, h) { top[c] = h; }
