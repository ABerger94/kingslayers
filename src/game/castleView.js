// Renders the royal castle (curtain walls, towers, gatehouse, keep, banners) and its destruction.
import * as THREE from 'three';
import { groundY, mergeSimple } from './world.js';
import { setStructure } from './structures.js';
import {
  castleCells, cellX, cellZ, CELL_WALL, CELL_GATE, CELL_KEEP, KEEP,
  WALL_H, TOWER_H, KEEP_H, CASTLE,
} from '../shared/castle.js';
import { NAV_CELL } from '../shared/constants.js';

const STONE = 0x9a958a, STONE_DARK = 0x77736a, WOOD = 0x5b3d22, IRON = 0x2a2a2a, ROOF = 0x3c4656;

function merlonRing(size, y, count, radius) {
  const parts = [];
  if (radius) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      parts.push(new THREE.BoxGeometry(1.1, 1.8, 1.1).translate(Math.cos(a) * radius, y + 0.9, Math.sin(a) * radius));
    }
  } else {
    const h = size / 2 - 0.55;
    for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) parts.push(new THREE.BoxGeometry(1.1, 2, 1.1).translate(x, y + 1, z));
  }
  return parts;
}

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  // Quartered royal arms, simplified: red and blue fields with gold
  g.fillStyle = '#24407f'; g.fillRect(0, 0, 32, 20); g.fillRect(32, 20, 32, 20);
  g.fillStyle = '#c8323c'; g.fillRect(32, 0, 32, 20); g.fillRect(0, 20, 32, 20);
  g.fillStyle = '#f0c040';
  for (const [x, y] of [[10, 6], [16, 10], [22, 6], [42, 26], [48, 30], [54, 26]]) g.fillRect(x, y, 4, 4);
  return new THREE.CanvasTexture(c);
}

export class CastleView {
  constructor(scene, fx, audio) {
    this.scene = scene; this.fx = fx; this.audio = audio;
    this.parts = new Map(); // cell -> [{ mesh, index }]
    this.flags = [];
    const cells = castleCells();
    const walls = cells.filter((c) => c.type === CELL_WALL && !c.tower);
    const towers = cells.filter((c) => c.tower);
    const gates = cells.filter((c) => c.type === CELL_GATE);
    const stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const M = new THREE.Matrix4();
    const col = new THREE.Color();

    // ---- curtain wall blocks
    const wallGeo = mergeSimple([
      new THREE.BoxGeometry(NAV_CELL, WALL_H + 2, NAV_CELL).translate(0, (WALL_H + 2) / 2 - 2, 0),
      ...merlonRing(NAV_CELL, WALL_H, 4),
    ]);
    this.wallMesh = this.instanced(wallGeo, stoneMat, walls, (cell, k, mesh) => {
      M.makeTranslation(cellX(cell.cx), groundY(cellX(cell.cx), cellZ(cell.cz)), cellZ(cell.cz));
      mesh.setMatrixAt(k, M);
      col.setHex(STONE).multiplyScalar(0.85 + ((cell.cx * 7 + cell.cz * 13) % 10) / 40);
      mesh.setColorAt(k, col);
    });

    // ---- towers (round, crenellated; corner towers get slate roofs)
    const towerGeo = mergeSimple([
      new THREE.CylinderGeometry(3.3, 3.7, TOWER_H + 2, 14).translate(0, (TOWER_H + 2) / 2 - 2, 0),
      new THREE.CylinderGeometry(3.7, 3.7, 0.6, 14).translate(0, TOWER_H, 0),
      ...merlonRing(0, TOWER_H, 8, 3.3),
    ], [STONE, STONE_DARK, ...new Array(8).fill(STONE)]);
    this.towerMesh = this.instanced(towerGeo, stoneMat, towers, (cell, k, mesh) => {
      M.makeTranslation(cellX(cell.cx), groundY(cellX(cell.cx), cellZ(cell.cz)), cellZ(cell.cz));
      mesh.setMatrixAt(k, M);
    });
    const corners = towers.filter((c) => (c.cx === CASTLE.cx0 || c.cx === CASTLE.cx1) && (c.cz === CASTLE.cz0 || c.cz === CASTLE.cz1));
    const roofGeo = new THREE.ConeGeometry(4.1, 6, 14).translate(0, TOWER_H + 3.2, 0);
    this.roofMesh = this.instanced(roofGeo, new THREE.MeshLambertMaterial({ color: ROOF }), corners, (cell, k, mesh) => {
      M.makeTranslation(cellX(cell.cx), groundY(cellX(cell.cx), cellZ(cell.cz)), cellZ(cell.cz));
      mesh.setMatrixAt(k, M);
    });
    // Banners on the corner towers
    const tex = flagTexture();
    for (const cell of corners) {
      const x = cellX(cell.cx), z = cellZ(cell.cz), y = groundY(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
      pole.position.set(x, y + TOWER_H + 8, z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2).translate(1.6, 0, 0), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      flag.position.set(x, y + TOWER_H + 9.4, z);
      this.scene.add(pole, flag);
      this.flags.push(flag);
      this.track(cell.c, { obj: pole }); this.track(cell.c, { obj: flag });
    }

    // ---- gatehouse: stone arch above a heavy wooden gate
    const lintelGeo = mergeSimple([
      new THREE.BoxGeometry(NAV_CELL, 3.6, NAV_CELL).translate(0, WALL_H - 1.8, 0),
      ...merlonRing(NAV_CELL, WALL_H, 4),
    ]);
    this.gateStone = this.instanced(lintelGeo, stoneMat, gates, (cell, k, mesh) => {
      M.makeTranslation(cellX(cell.cx), groundY(cellX(cell.cx), cellZ(cell.cz)), cellZ(cell.cz));
      mesh.setMatrixAt(k, M);
      mesh.setColorAt(k, col.setHex(STONE_DARK));
    });
    const doorGeo = mergeSimple([
      new THREE.BoxGeometry(NAV_CELL, WALL_H - 3.4, 0.7).translate(0, (WALL_H - 3.4) / 2, -NAV_CELL / 2 + 0.6),
      new THREE.BoxGeometry(NAV_CELL, 0.25, 0.8).translate(0, 1.2, -NAV_CELL / 2 + 0.55),
      new THREE.BoxGeometry(NAV_CELL, 0.25, 0.8).translate(0, 3.4, -NAV_CELL / 2 + 0.55),
    ], [WOOD, IRON, IRON]);
    this.doorMesh = this.instanced(doorGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), gates, (cell, k, mesh) => {
      M.makeTranslation(cellX(cell.cx), groundY(cellX(cell.cx), cellZ(cell.cz)), cellZ(cell.cz));
      mesh.setMatrixAt(k, M);
    });

    // ---- the keep (indestructible)
    const kx0 = cellX(KEEP.cx0) - NAV_CELL / 2, kx1 = cellX(KEEP.cx1) + NAV_CELL / 2;
    const kz0 = cellZ(KEEP.cz0) - NAV_CELL / 2, kz1 = cellZ(KEEP.cz1) + NAV_CELL / 2;
    const kw = kx1 - kx0, kd = kz1 - kz0, kx = (kx0 + kx1) / 2, kz = (kz0 + kz1) / 2;
    const keepParts = [new THREE.BoxGeometry(kw, KEEP_H + 2, kd).translate(0, (KEEP_H + 2) / 2 - 2, 0)];
    const keepCols = [STONE];
    for (let x = -kw / 2 + 0.6; x <= kw / 2 - 0.5; x += 2.2) {
      keepParts.push(new THREE.BoxGeometry(1.1, 1.8, 1.1).translate(x, KEEP_H + 0.9, -kd / 2 + 0.55), new THREE.BoxGeometry(1.1, 1.8, 1.1).translate(x, KEEP_H + 0.9, kd / 2 - 0.55));
      keepCols.push(STONE, STONE);
    }
    for (const [x, z] of [[-kw / 2, -kd / 2], [kw / 2, -kd / 2], [-kw / 2, kd / 2], [kw / 2, kd / 2]]) {
      keepParts.push(new THREE.CylinderGeometry(2.4, 2.4, KEEP_H + 6, 10).translate(x, (KEEP_H + 6) / 2 - 2, z));
      keepCols.push(STONE_DARK);
    }
    // doorway and windows
    keepParts.push(new THREE.BoxGeometry(4, 6, 0.3).translate(0, 3, -kd / 2 - 0.1));
    keepCols.push(0x2a1d12);
    for (const x of [-10, -4, 4, 10]) { keepParts.push(new THREE.BoxGeometry(1, 2.2, 0.3).translate(x, 12, -kd / 2 - 0.1)); keepCols.push(0x1a1a1a); }
    const keep = new THREE.Mesh(mergeSimple(keepParts, keepCols), new THREE.MeshLambertMaterial({ vertexColors: true }));
    keep.position.set(kx, groundY(kx, kz), kz);
    keep.castShadow = keep.receiveShadow = true;
    this.scene.add(keep);
    const kp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
    kp.position.set(kx, keep.position.y + KEEP_H + 4.5, kz);
    const kf = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.8).translate(3, 0, 0), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    kf.position.set(kx, keep.position.y + KEEP_H + 7.2, kz);
    this.scene.add(kp, kf);
    this.flags.push(kf);

    // ---- rubble pool for destroyed sections
    this.rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshLambertMaterial({ color: STONE_DARK }), 900);
    this.rubble.count = 0;
    this.rubble.castShadow = true;
    this.scene.add(this.rubble);
  }

  instanced(geo, mat, cells, place) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cells.length));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cells.forEach((cell, k) => { place(cell, k, mesh); this.track(cell.c, { mesh, index: k }); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  track(c, part) {
    if (!this.parts.has(c)) this.parts.set(c, []);
    this.parts.get(c).push(part);
  }

  update(time) {
    for (let k = 0; k < this.flags.length; k++) {
      const f = this.flags[k];
      f.rotation.y = Math.sin(time * 1.3 + k) * 0.35 - Math.PI / 2;
    }
  }

  // A wall section or gate has been destroyed: hide it, leave rubble, raise dust
  destroy(c, type, camPos) {
    const parts = this.parts.get(c);
    if (!parts) return false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of parts) {
      if (p.mesh) { p.mesh.setMatrixAt(p.index, zero); p.mesh.instanceMatrix.needsUpdate = true; }
      if (p.obj) p.obj.visible = false;
    }
    this.parts.delete(c);
    setStructure(c, 0);
    const cell = castleCells().find((q) => q.c === c);
    const x = cellX(cell.cx), z = cellZ(cell.cz), y = groundY(x, z);
    // rubble heap
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const E = new THREE.Euler();
    for (let k = 0; k < 14 && this.rubble.count < 900; k++) {
      P.set(x + (Math.random() - 0.5) * 6, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 6);
      Q.setFromEuler(E.set(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      S.setScalar(0.6 + Math.random() * 1.3);
      M.compose(P, Q, S);
      this.rubble.setMatrixAt(this.rubble.count++, M);
    }
    this.rubble.instanceMatrix.needsUpdate = true;
    // dust and flying stone
    this.fx.smoke(x, y + 3, z, 60, 8, 5, 5);
    for (let k = 0; k < 50; k++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 10;
      this.fx.spawn(x, y + 2 + Math.random() * 6, z, Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s, 0.5, 0.48, 0.44, 0.4 + Math.random() * 0.5, 1.5 + Math.random(), 9.8);
    }
    if (type === CELL_GATE) {
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8;
        this.fx.spawn(x, y + 3, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.36, 0.24, 0.13, 0.3, 1.6, 9.8);
      }
    }
    this.fx.shake = Math.max(this.fx.shake, camPos ? Math.max(0, 1 - Math.hypot(camPos.x - x, camPos.z - z) / 150) : 0.5);
    this.audio.crumble(camPos ? Math.hypot(camPos.x - x, camPos.z - z) : 0);
    return true;
  }
}

export { CELL_KEEP };
