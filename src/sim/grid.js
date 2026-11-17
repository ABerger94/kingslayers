// Uniform spatial hash used for neighbour queries (separation, target acquisition, arrow hits).
// Implemented as a counting-sort into flat typed arrays so a rebuild is O(n) and allocation free.
import { HALF_WORLD, WORLD_SIZE } from '../shared/constants.js';

export class SpatialGrid {
  constructor(capacity, cellSize = 6) {
    this.cellSize = cellSize;
    this.dim = Math.ceil(WORLD_SIZE / cellSize);
    const cells = this.dim * this.dim;
    this.cellStart = new Int32Array(cells + 1);
    this.cellCount = new Int32Array(cells);
    this.items = new Int32Array(capacity);
    this.unitCell = new Int32Array(capacity);
  }

  cellOf(x, z) {
    let cx = Math.floor((x + HALF_WORLD) / this.cellSize);
    let cz = Math.floor((z + HALF_WORLD) / this.cellSize);
    if (cx < 0) cx = 0; else if (cx >= this.dim) cx = this.dim - 1;
    if (cz < 0) cz = 0; else if (cz >= this.dim) cz = this.dim - 1;
    return cz * this.dim + cx;
  }

  rebuild(n, xs, zs, alive) {
    const { cellCount, cellStart, items, unitCell } = this;
    cellCount.fill(0);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) { unitCell[i] = -1; continue; }
      const c = this.cellOf(xs[i], zs[i]);
      unitCell[i] = c;
      cellCount[c]++;
    }
    let acc = 0;
    for (let c = 0; c < cellCount.length; c++) {
      cellStart[c] = acc;
      acc += cellCount[c];
    }
    cellStart[cellCount.length] = acc;
    cellCount.fill(0);
    for (let i = 0; i < n; i++) {
      const c = unitCell[i];
      if (c < 0) continue;
      items[cellStart[c] + cellCount[c]++] = i;
    }
  }

  // Calls fn(index) for every unit whose cell intersects the square of radius r around (x, z).
  // Returns early if fn returns true.
  query(x, z, r, fn) {
    const cs = this.cellSize, dim = this.dim;
    let x0 = Math.floor((x - r + HALF_WORLD) / cs), x1 = Math.floor((x + r + HALF_WORLD) / cs);
    let z0 = Math.floor((z - r + HALF_WORLD) / cs), z1 = Math.floor((z + r + HALF_WORLD) / cs);
    if (x0 < 0) x0 = 0; if (z0 < 0) z0 = 0;
    if (x1 >= dim) x1 = dim - 1; if (z1 >= dim) z1 = dim - 1;
    const { cellStart, items } = this;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cz * dim + cx;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          if (fn(items[k])) return;
        }
      }
    }
  }
}
