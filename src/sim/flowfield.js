// Navigation grid + cached flow fields.
// A flow field is an integration field (Dijkstra distance to the goal) over the nav grid;
// any number of soldiers heading to the same goal share one field, which is what makes
// pathfinding for thousands of agents cheap.
import { NAV_CELL, NAV_DIM, HALF_WORLD } from '../shared/constants.js';
import { inRiver, inWoods } from '../shared/terrain.js';
import { castleCells, CELL_GATE, WALL_HP, GATE_HP } from '../shared/castle.js';

const N = NAV_DIM * NAV_DIM;
const INF = 1e9;
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export class NavGrid {
  constructor() {
    this.blocked = new Uint8Array(N); // 1 = terrain, 2 = fortification
    this.fortHp = new Float32Array(N);
    for (let cz = 0; cz < NAV_DIM; cz++) {
      for (let cx = 0; cx < NAV_DIM; cx++) {
        const x = (cx + 0.5) * NAV_CELL - HALF_WORLD;
        const z = (cz + 0.5) * NAV_CELL - HALF_WORLD;
        if (inRiver(x, z) || inWoods(x, z)) this.blocked[cz * NAV_DIM + cx] = 1;
      }
    }
    // The royal castle: walls and gate are blocked but destructible (fortHp), the keep is solid
    for (const cell of castleCells()) {
      this.blocked[cell.c] = cell.type;
      this.fortHp[cell.c] = cell.type === CELL_GATE ? GATE_HP : WALL_HP;
    }
    this.cache = new Map();
    this.version = 0;
    // scratch for Dijkstra
    this.heap = new Int32Array(N * 4);
    this.heapCost = new Float32Array(N * 4);
  }

  cellIndex(x, z) {
    let cx = Math.floor((x + HALF_WORLD) / NAV_CELL);
    let cz = Math.floor((z + HALF_WORLD) / NAV_CELL);
    if (cx < 0) cx = 0; else if (cx >= NAV_DIM) cx = NAV_DIM - 1;
    if (cz < 0) cz = 0; else if (cz >= NAV_DIM) cz = NAV_DIM - 1;
    return cz * NAV_DIM + cx;
  }

  isBlocked(x, z) {
    return this.blocked[this.cellIndex(x, z)] !== 0;
  }

  // Place an arbitrary destructible structure (e.g. the Temporal Beacon, type 6)
  setCell(x, z, type, hp) {
    const c = this.cellIndex(x, z);
    this.blocked[c] = type;
    this.fortHp[c] = hp;
    this.invalidate();
    return c;
  }

  setFort(x, z, hp) {
    const c = this.cellIndex(x, z);
    if (this.blocked[c] === 1) return false;
    this.blocked[c] = 2;
    this.fortHp[c] = hp;
    this.invalidate();
    return true;
  }

  // Is this cell a destructible structure (palisade, castle wall or gate)?
  destructible(c) {
    const b = this.blocked[c];
    return b === 2 || b === 3 || b === 4 || b === 6;
  }

  clearCell(c) {
    if (!this.destructible(c)) return 0;
    const type = this.blocked[c];
    this.blocked[c] = 0;
    this.fortHp[c] = 0;
    this.invalidate();
    return type;
  }

  invalidate() {
    this.version++;
    this.cache.clear();
  }

  // Returns a Float32Array distance field for the goal (cached).
  field(gx, gz) {
    const goal = this.cellIndex(gx, gz);
    let f = this.cache.get(goal);
    if (f) {
      // LRU refresh
      this.cache.delete(goal);
      this.cache.set(goal, f);
      return f;
    }
    f = this.compute(goal);
    this.cache.set(goal, f);
    if (this.cache.size > 96) this.cache.delete(this.cache.keys().next().value);
    return f;
  }

  compute(goal) {
    const dist = new Float32Array(N).fill(INF);
    const { heap, heapCost, blocked } = this;
    let size = 0;
    const push = (i, c) => {
      let k = size++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapCost[p] <= c) break;
        heap[k] = heap[p]; heapCost[k] = heapCost[p];
        k = p;
      }
      heap[k] = i; heapCost[k] = c;
    };
    const pop = () => {
      const top = heap[0];
      const lastI = heap[--size], lastC = heapCost[size];
      let k = 0;
      for (;;) {
        let ch = 2 * k + 1;
        if (ch >= size) break;
        if (ch + 1 < size && heapCost[ch + 1] < heapCost[ch]) ch++;
        if (heapCost[ch] >= lastC) break;
        heap[k] = heap[ch]; heapCost[k] = heapCost[ch];
        k = ch;
      }
      heap[k] = lastI; heapCost[k] = lastC;
      return top;
    };
    dist[goal] = 0;
    push(goal, 0);
    while (size > 0) {
      const c = heapCost[0];
      const i = pop();
      if (c > dist[i]) continue;
      const cx = i % NAV_DIM, cz = (i / NAV_DIM) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NX[k], nz = cz + NZ[k];
        if (nx < 0 || nz < 0 || nx >= NAV_DIM || nz >= NAV_DIM) continue;
        const ni = nz * NAV_DIM + nx;
        if (blocked[ni]) continue;
        // No corner cutting
        if (k >= 4 && (blocked[cz * NAV_DIM + nx] || blocked[nz * NAV_DIM + cx])) continue;
        const nc = c + NC[k];
        if (nc < dist[ni]) {
          dist[ni] = nc;
          if (size < heap.length) push(ni, nc);
        }
      }
    }
    return dist;
  }

  // Steering direction from (x, z) down the gradient of the field. Writes into out {x, z}.
  direction(field, x, z, out) {
    const i = this.cellIndex(x, z);
    const cx = i % NAV_DIM, cz = (i / NAV_DIM) | 0;
    let best = field[i], bx = 0, bz = 0;
    if (this.blocked[i]) best = INF * 2; // escape from inside a blocked cell
    for (let k = 0; k < 8; k++) {
      const nx = cx + NX[k], nz = cz + NZ[k];
      if (nx < 0 || nz < 0 || nx >= NAV_DIM || nz >= NAV_DIM) continue;
      const ni = nz * NAV_DIM + nx;
      if (this.blocked[ni]) continue;
      if (k >= 4 && (this.blocked[cz * NAV_DIM + nx] || this.blocked[nz * NAV_DIM + cx])) continue;
      const v = field[ni];
      if (v < best) { best = v; bx = NX[k]; bz = NZ[k]; }
    }
    const l = Math.hypot(bx, bz);
    if (l === 0) { out.x = 0; out.z = 0; return false; }
    out.x = bx / l; out.z = bz / l;
    return true;
  }

  // Cheap straight-line walkability test (sampled), used to skip flow fields when the way is clear.
  clearLine(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (NAV_CELL * 0.75));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this.isBlocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }
}
