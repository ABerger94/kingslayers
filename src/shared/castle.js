// The royal castle at the south end of the field. Laid out on the navigation grid so the simulation
// can treat walls and the gate as blocked (and destructible) cells, and the renderer can draw them.
//
//   north wall faces the battlefield, with the gatehouse in the middle
//   archers garrison the walls; King Henry and his guard hold the courtyard in front of the keep
import { NAV_CELL, NAV_DIM, HALF_WORLD } from './constants.js';

// Cell rectangle (inclusive) of the curtain wall
export const CASTLE = { cx0: 69, cx1: 90, cz0: 132, cz1: 145 };
// Gate cells in the north wall
export const GATE_CELLS = [79, 80];
// Keep footprint (inside the south half of the courtyard)
export const KEEP = { cx0: 76, cx1: 83, cz0: 140, cz1: 144 };

export const CELL_WALL = 3;
export const CELL_GATE = 4;
export const CELL_KEEP = 5; // indestructible

export const WALL_H = 8; // wall-walk height where archers stand
export const WALL_TOP = 10; // top of the merlons
export const TOWER_H = 14;
export const KEEP_H = 20;
export const WALL_HP = 2600;
export const GATE_HP = 1800;

export const cellX = (cx) => cx * NAV_CELL - HALF_WORLD + NAV_CELL / 2;
export const cellZ = (cz) => cz * NAV_CELL - HALF_WORLD + NAV_CELL / 2;

// World-space bounds
export const CASTLE_BOUNDS = {
  x0: CASTLE.cx0 * NAV_CELL - HALF_WORLD,
  x1: (CASTLE.cx1 + 1) * NAV_CELL - HALF_WORLD,
  z0: CASTLE.cz0 * NAV_CELL - HALF_WORLD,
  z1: (CASTLE.cz1 + 1) * NAV_CELL - HALF_WORLD,
};
export const CASTLE_CENTER = { x: (CASTLE_BOUNDS.x0 + CASTLE_BOUNDS.x1) / 2, z: (CASTLE_BOUNDS.z0 + CASTLE_BOUNDS.z1) / 2 };
// Where attackers mass to batter the gate (just outside it)
export const GATE_FRONT = { x: cellX(79) + NAV_CELL / 2, z: CASTLE_BOUNDS.z0 - 3 };
// Inside the gate
export const GATE_INSIDE = { x: GATE_FRONT.x, z: CASTLE_BOUNDS.z0 + 10 };

export function isTowerCell(cx, cz) {
  const { cx0, cx1, cz0, cz1 } = CASTLE;
  const corner = (cx === cx0 || cx === cx1) && (cz === cz0 || cz === cz1);
  const gateFlank = cz === cz0 && (cx === GATE_CELLS[0] - 1 || cx === GATE_CELLS[1] + 1);
  const mid = (cx === cx0 || cx === cx1) && cz === Math.round((cz0 + cz1) / 2);
  return corner || gateFlank || mid;
}

// Every castle cell: { c, cx, cz, type, tower }
export function castleCells() {
  const out = [];
  const { cx0, cx1, cz0, cz1 } = CASTLE;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const edge = cx === cx0 || cx === cx1 || cz === cz0 || cz === cz1;
      const keep = cx >= KEEP.cx0 && cx <= KEEP.cx1 && cz >= KEEP.cz0 && cz <= KEEP.cz1;
      if (!edge && !keep) continue;
      let type = CELL_WALL;
      if (keep) type = CELL_KEEP;
      else if (cz === cz0 && GATE_CELLS.includes(cx)) type = CELL_GATE;
      out.push({ c: cz * NAV_DIM + cx, cx, cz, type, tower: type === CELL_WALL && isTowerCell(cx, cz) });
    }
  }
  return out;
}

// Cells along the walls where garrison archers stand (north wall and the northern half of the sides)
export function garrisonSpots() {
  const spots = [];
  for (const cell of castleCells()) {
    if (cell.type !== CELL_WALL) continue;
    const north = cell.cz === CASTLE.cz0;
    const sideNorth = (cell.cx === CASTLE.cx0 || cell.cx === CASTLE.cx1) && cell.cz < CASTLE.cz0 + 7;
    if (north || sideNorth) spots.push(cell);
  }
  return spots;
}

export function structureHeight(type, tower) {
  if (type === CELL_KEEP) return KEEP_H;
  if (tower) return TOWER_H;
  return WALL_TOP;
}
