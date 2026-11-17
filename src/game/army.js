// Renders every soldier with GPU instancing: one InstancedMesh per (unit type x part).
// The "livery" part is tinted per-instance with the soldier's team colour; the "gear" part
// (skin, steel, wood) is not. Animation is procedural: walk bob, combat lean, death fall.
import * as THREE from 'three';
import {
  SNAP_STRIDE, ARROW_STRIDE, MAX_ARROWS, NUM_TYPES, ARCHER, SWORD, SPEAR, CAVALRY, HERO,
  ST_FIGHT, ST_SHOOT, ST_ROUT, ST_DEAD, STATS, TEAM_REBEL, SIM_DT,
} from '../shared/constants.js';
import { groundY, mergeSimple } from './world.js';

const SKIN = 0xd2a27c, STEEL = 0x9aa1a8, DARK = 0x3a3128, WOOD = 0x6d4c2c, LEATHER = 0x5a4026, HORSE = 0x6b4a33;
export const TEAM_COLORS = [new THREE.Color(0xe0b341), new THREE.Color(0xc8323c)];
const TEAM_ALT = [new THREE.Color(0x3f6e3a), new THREE.Color(0x24407f)];

function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return g.translate(x, y, z);
}
function cyl(r, h, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, 5);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
}

// Returns [liveryGeometry, gearGeometry] for a unit type. Models face +z.
function buildModel(type) {
  const livery = [], gear = [], gearCol = [];
  const g = (geo, col) => { gear.push(geo); gearCol.push(col); };
  const human = (y0 = 0, scale = 1) => {
    if (y0 === 0) {
      g(box(0.16, 0.8, 0.2, -0.11, 0.4, 0), DARK);
      g(box(0.16, 0.8, 0.2, 0.11, 0.4, 0), DARK);
    }
    livery.push(box(0.52 * scale, 0.7, 0.32, 0, y0 + 1.15, 0));
    g(box(0.14, 0.6, 0.14, -0.33, y0 + 1.15, 0.05), STEEL);
    g(box(0.14, 0.6, 0.14, 0.33, y0 + 1.15, 0.05), STEEL);
    g(new THREE.SphereGeometry(0.14, 6, 5).translate(0, y0 + 1.62, 0), SKIN);
  };
  switch (type) {
    case ARCHER:
      human();
      g(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 7).translate(0, 1.76, 0), LEATHER); // cap
      g(box(0.04, 1.8, 0.04, 0.38, 1.2, 0.2), WOOD); // longbow
      g(box(0.12, 0.5, 0.12, -0.18, 1.3, -0.2, 0.3), LEATHER); // quiver
      break;
    case SWORD:
      human();
      g(new THREE.ConeGeometry(0.18, 0.3, 7).translate(0, 1.82, 0), STEEL);
      g(box(0.06, 0.9, 0.04, 0.42, 1.25, 0.25, -0.5), STEEL); // sword
      livery.push(box(0.08, 0.6, 0.45, -0.42, 1.1, 0.12)); // shield
      break;
    case SPEAR:
      human();
      g(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.66, 0), STEEL);
      g(cyl(0.03, 3.6, 0.36, 1.5, 0.6, 1.2), WOOD); // spear angled forward
      g(new THREE.ConeGeometry(0.05, 0.3, 4).rotateX(Math.PI / 2).rotateX(-0.37).translate(0.36, 2.2, 2.3), STEEL);
      break;
    case CAVALRY: {
      // horse
      g(box(0.55, 0.65, 1.9, 0, 1.25, 0), HORSE);
      for (const [x, z] of [[-0.2, 0.7], [0.2, 0.7], [-0.2, -0.7], [0.2, -0.7]]) g(box(0.14, 1.0, 0.14, x, 0.5, z), HORSE);
      g(box(0.3, 0.75, 0.35, 0, 1.75, 1.0, -0.6), HORSE); // neck
      g(box(0.24, 0.26, 0.6, 0, 2.05, 1.35), HORSE); // head
      livery.push(box(0.65, 0.5, 1.6, 0, 1.15, 0)); // caparison
      // rider
      human(0.85, 1);
      g(box(0.16, 0.5, 0.2, -0.3, 1.45, 0.1), DARK);
      g(box(0.16, 0.5, 0.2, 0.3, 1.45, 0.1), DARK);
      g(new THREE.ConeGeometry(0.18, 0.32, 7).translate(0, 2.68, 0), STEEL);
      g(cyl(0.035, 3.4, 0.4, 2.1, 1.0, 1.35), WOOD); // lance
      break;
    }
    case HERO:
      human(0, 1.1);
      livery.push(box(0.6, 1.0, 0.05, 0, 1.05, -0.22)); // cape
      g(new THREE.ConeGeometry(0.2, 0.32, 8).translate(0, 1.84, 0), STEEL);
      g(new THREE.TorusGeometry(0.15, 0.03, 4, 10).rotateX(Math.PI / 2).translate(0, 1.95, 0), 0xf0c040); // circlet
      g(box(0.07, 1.2, 0.05, 0.45, 1.3, 0.3, -0.4), 0xdedede); // greatsword
      // banner pole carried behind
      g(cyl(0.03, 4.0, -0.3, 2.0, -0.3), WOOD);
      livery.push(box(0.03, 0.9, 0.7, -0.3, 3.5, -0.65));
      break;
  }
  return [mergeSimple(livery), mergeSimple(gear, gearCol)];
}

export class ArmyRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = []; // [type] -> {livery, gear}
    this.n = 0;
    this.prev = null; this.cur = null;
    this.curTime = 0; this.recvAt = 0;
    this.deathAt = null; // per unit, real time of death (for fall animation)
    this.instanceOf = null; // unit -> instance index within its type mesh
    this.typeOf = null;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3(1, 1, 1);
    this.color = new THREE.Color();
    // live interpolated positions for gameplay queries
    this.px = null; this.pz = null; this.py = null;
    this.arrowMesh = null;
  }

  init(n, snap) {
    this.n = n;
    this.deathAt = new Float32Array(n).fill(-1);
    this.px = new Float32Array(n); this.pz = new Float32Array(n); this.py = new Float32Array(n);
    this.typeOf = new Uint8Array(n);
    this.teamOf = new Uint8Array(n);
    this.stateOf = new Uint8Array(n);
    this.instanceOf = new Int32Array(n);
    const counts = new Array(NUM_TYPES).fill(0);
    for (let i = 0; i < n; i++) {
      const t = snap[i * SNAP_STRIDE + 3] & 7;
      this.typeOf[i] = t;
      this.instanceOf[i] = counts[t]++;
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let t = 0; t < NUM_TYPES; t++) {
      const [lg, gg] = buildModel(t);
      const cap = Math.max(1, counts[t]);
      const livery = new THREE.InstancedMesh(lg, mat, cap);
      const gear = new THREE.InstancedMesh(gg, mat, cap);
      livery.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      gear.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      livery.frustumCulled = gear.frustumCulled = false;
      for (let k = 0; k < cap; k++) livery.setColorAt(k, TEAM_COLORS[0]);
      if (t === CAVALRY || t === HERO) { livery.castShadow = gear.castShadow = true; }
      this.scene.add(livery, gear);
      this.meshes.push({ livery, gear });
    }
    // Arrows
    const ag = new THREE.BoxGeometry(0.035, 0.035, 0.95);
    this.arrowMesh = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ color: 0x2b2118 }), MAX_ARROWS);
    this.arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);
    this.prev = snap; this.cur = snap;
  }

  // Note: units can be added mid-battle (reinforcements), which requires a rebuild.
  needsRebuild(n) { return n !== this.n; }

  dispose() {
    for (const m of this.meshes) { this.scene.remove(m.livery, m.gear); m.livery.dispose(); m.gear.dispose(); }
    this.meshes = [];
    if (this.arrowMesh) { this.scene.remove(this.arrowMesh); this.arrowMesh.dispose(); }
  }

  push(snap, arrows, now) {
    const n = snap.length / SNAP_STRIDE;
    if (n !== this.n) {
      const oldDeath = this.deathAt;
      this.dispose();
      this.init(n, snap);
      if (oldDeath) this.deathAt.set(oldDeath.subarray(0, Math.min(oldDeath.length, n)));
    }
    this.prev = this.cur;
    this.cur = snap;
    this.arrows = arrows;
    this.recvAt = now;
  }

  // Interpolates between the last two snapshots and writes instance matrices.
  update(now, camPos) {
    if (!this.cur) return;
    const n = this.n, prev = this.prev.length === this.cur.length ? this.prev : this.cur, cur = this.cur;
    const alpha = Math.min(1, (now - this.recvAt) / (SIM_DT * 1000));
    const M = this.tmpM, Q = this.tmpQ, E = this.tmpE, P = this.tmpP, S = this.tmpS;
    const t = now / 1000;
    for (let i = 0; i < n; i++) {
      const k = i * SNAP_STRIDE;
      const x = prev[k] + (cur[k] - prev[k]) * alpha;
      const z = prev[k + 1] + (cur[k + 1] - prev[k + 1]) * alpha;
      let h0 = prev[k + 2], h1 = cur[k + 2];
      let dh = h1 - h0;
      if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
      const heading = h0 + dh * alpha;
      const packed = cur[k + 3];
      const type = packed & 7, team = (packed >> 3) & 1, state = (packed >> 4) & 7;
      const hpf = cur[k + 4];
      const speed = cur[k + 5];
      const y = groundY(x, z);
      this.px[i] = x; this.pz[i] = z; this.py[i] = y;
      this.teamOf[i] = team; this.stateOf[i] = state;
      const mesh = this.meshes[type];
      const idx = this.instanceOf[i];
      let lean = 0, bob = 0, roll = 0, sc = 1;
      if (state === ST_DEAD) {
        if (hpf < 0) { sc = 0; } // fled the field
        else {
          if (this.deathAt[i] < 0) this.deathAt[i] = t;
          const f = Math.min(1, (t - this.deathAt[i]) / 0.45);
          lean = -f * f * Math.PI / 2 * (type === CAVALRY ? 0 : 1);
          roll = type === CAVALRY ? f * Math.PI / 2 : 0;
          bob = -f * 0.15;
        }
      } else {
        this.deathAt[i] = -1;
        const phase = t * (4 + speed * 1.3) + i * 1.7;
        if (speed > 0.4) bob = Math.abs(Math.sin(phase)) * Math.min(0.12, speed * 0.03) * (type === CAVALRY ? 2 : 1);
        if (state === ST_FIGHT) lean = 0.15 + Math.max(0, Math.sin(t * 7 + i)) * 0.35;
        else if (state === ST_SHOOT) lean = -0.08;
        else if (state === ST_ROUT) lean = 0.35;
        else lean = Math.min(0.2, speed * 0.03);
      }
      E.set(lean, heading + (state === ST_ROUT ? Math.sin(t * 9 + i) * 0.2 : 0), roll);
      Q.setFromEuler(E);
      P.set(x, y + bob, z);
      S.setScalar(sc);
      M.compose(P, Q, S);
      mesh.livery.setMatrixAt(idx, M);
      mesh.gear.setMatrixAt(idx, M);
      // team colour, darkened when dead or wounded
      const c = this.color.copy(TEAM_COLORS[team]);
      if (type === HERO) c.lerp(TEAM_ALT[team], 0.5);
      if (state === ST_DEAD) c.multiplyScalar(0.35);
      else if (state === ST_ROUT) c.multiplyScalar(0.7);
      else if (i % 3 === 0) c.lerp(TEAM_ALT[team], 0.35);
      mesh.livery.setColorAt(idx, c);
    }
    for (const m of this.meshes) {
      m.livery.instanceMatrix.needsUpdate = true;
      m.gear.instanceMatrix.needsUpdate = true;
      if (m.livery.instanceColor) m.livery.instanceColor.needsUpdate = true;
    }
    this.updateArrows(now);
  }

  updateArrows(now) {
    const a = this.arrows;
    if (!a) return;
    const count = Math.min(MAX_ARROWS, a.length / ARROW_STRIDE);
    const dt = Math.min(SIM_DT, (now - this.recvAt) / 1000);
    const M = this.tmpM, Q = this.tmpQ, P = this.tmpP;
    const dir = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1);
    for (let n = 0; n < count; n++) {
      const k = n * ARROW_STRIDE;
      const vx = a[k + 3], vy = a[k + 4], vz = a[k + 5];
      P.set(a[k] + vx * dt, a[k + 1] + vy * dt - 4.9 * dt * dt, a[k + 2] + vz * dt);
      dir.set(vx, vy - 9.81 * dt, vz);
      if (dir.lengthSq() < 1e-4) dir.set(0.2, -1, 0.1); // stuck in the ground
      dir.normalize();
      Q.setFromUnitVectors(fwd, dir);
      M.compose(P, Q, this.tmpS.setScalar(1));
      this.arrowMesh.setMatrixAt(n, M);
    }
    this.arrowMesh.count = count;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
  }

  // Hit test a ray against every living soldier (approximated as a vertical capsule).
  // Returns { i, t, head } for the nearest hit, or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, ignoreTeam = TEAM_REBEL) {
    let best = maxT, bestI = -1, head = false;
    for (let i = 0; i < this.n; i++) {
      const st = this.stateOf[i];
      if (st === ST_DEAD) continue;
      if (this.teamOf[i] === ignoreTeam) continue;
      const type = this.typeOf[i];
      const r = type === CAVALRY ? 0.9 : 0.42;
      const h = type === CAVALRY ? 2.8 : 1.85;
      const cx = this.px[i], cz = this.pz[i], cy = this.py[i];
      const t = (cx - ox) * dx + (cy + h * 0.5 - oy) * dy + (cz - oz) * dz;
      if (t < 0 || t > best) continue;
      const qx = ox + dx * t - cx, qz = oz + dz * t - cz;
      if (qx * qx + qz * qz > r * r * 1.6) continue;
      // refine: check height of the ray where it's closest horizontally
      const qy = oy + dy * t - cy;
      if (qy < 0 || qy > h) continue;
      best = t; bestI = i; head = qy > h - 0.35;
    }
    return bestI >= 0 ? { i: bestI, t: best, head } : null;
  }

  // Units within radius (for vehicle ramming, gunship targeting)
  nearby(x, z, r, team, out = []) {
    out.length = 0;
    const r2 = r * r;
    for (let i = 0; i < this.n; i++) {
      if (this.stateOf[i] === ST_DEAD || (team !== undefined && this.teamOf[i] !== team)) continue;
      const dx = this.px[i] - x, dz = this.pz[i] - z;
      if (dx * dx + dz * dz < r2) out.push(i);
    }
    return out;
  }
}

export { STATS, SWORD, SPEAR };
