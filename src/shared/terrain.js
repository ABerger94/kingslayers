// Deterministic terrain shared by the simulation and the renderer.
// Gentle Shropshire hills, a ridge for the royal army, the River Severn to the north,
// and patches of woodland that block movement.
import { HALF_WORLD, RIVER_Z, RIVER_HALF_WIDTH } from './constants.js';

function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Woods: centres and radii. Units cannot pass through them.
export const WOODS = [
  { x: -230, z: 120, r: 38 },
  { x: -250, z: 40, r: 26 },
  { x: 220, z: 150, r: 42 },
  { x: 260, z: -120, r: 30 },
  { x: -120, z: -200, r: 24 },
  { x: 130, z: -190, r: 22 },
];

export function riverDistance(x, z) {
  // Meandering river line
  const centre = RIVER_Z + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.031 + 1.3) * 5;
  return Math.abs(z - centre);
}

export function inRiver(x, z) {
  return riverDistance(x, z) < RIVER_HALF_WIDTH;
}

export function inWoods(x, z) {
  for (const w of WOODS) {
    const dx = x - w.x, dz = z - w.z;
    if (dx * dx + dz * dz < w.r * w.r) return true;
  }
  return false;
}

export function heightAt(x, z) {
  let h = (fbm(x * 0.006 + 10, z * 0.006 + 20) - 0.5) * 22;
  // The royal army forms up on rising ground to the south (positive z)
  h += Math.max(0, z - 40) * 0.035;
  // The "pease field" in the middle is flatter
  const flat = Math.exp(-(x * x + z * z) / (2 * 150 * 150));
  h *= 1 - 0.55 * flat;
  // River valley
  const rd = riverDistance(x, z);
  if (rd < 60) {
    const t = 1 - rd / 60;
    h -= t * t * 9;
  }
  // Raise edges a little to frame the map
  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF_WORLD;
  if (edge > 0.85) h += (edge - 0.85) * 60;
  return h;
}

// Approximate surface normal for alignment of props
export function slopeAt(x, z) {
  const e = 1.5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return { dx: dx / (2 * e), dz: dz / (2 * e) };
}

// Pea field: an area of tangled crops that slows movement (historically documented at Shrewsbury)
export function inPeaField(x, z) {
  return x > -120 && x < 120 && z > -30 && z < 60;
}
