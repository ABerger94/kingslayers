// Scene setup: sky, lighting, terrain mesh, river, woods, pea field and a fast height lookup.
import * as THREE from 'three';
import { WORLD_SIZE, HALF_WORLD, NAV_CELL, NAV_DIM } from '../shared/constants.js';
import { heightAt, inPeaField, riverDistance, WOODS } from '../shared/terrain.js';
import { RIVER_HALF_WIDTH } from '../shared/constants.js';

// Bilinear height lookup table: heightAt() is too slow to call thousands of times per frame.
const LUT_RES = 2;
const LUT_DIM = WORLD_SIZE / LUT_RES + 1;
const lut = new Float32Array(LUT_DIM * LUT_DIM);
for (let j = 0; j < LUT_DIM; j++) {
  for (let i = 0; i < LUT_DIM; i++) lut[j * LUT_DIM + i] = heightAt(i * LUT_RES - HALF_WORLD, j * LUT_RES - HALF_WORLD);
}
export function groundY(x, z) {
  let fx = (x + HALF_WORLD) / LUT_RES, fz = (z + HALF_WORLD) / LUT_RES;
  if (fx < 0) fx = 0; else if (fx > LUT_DIM - 1.001) fx = LUT_DIM - 1.001;
  if (fz < 0) fz = 0; else if (fz > LUT_DIM - 1.001) fz = LUT_DIM - 1.001;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const k = iz * LUT_DIM + ix;
  const a = lut[k], b = lut[k + 1], c = lut[k + LUT_DIM], d = lut[k + LUT_DIM + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function createWorld(renderer) {
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0xb9c9d6);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(0xb9c9d6, 180, 620);

  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x4a5a32, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-160, 220, -120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // ---- terrain
  const seg = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x5f7d3a), grass2 = new THREE.Color(0x7a8f45), mud = new THREE.Color(0x6b5a3c);
  const pea = new THREE.Color(0x8aa04a), peaRow = new THREE.Color(0x667a33), bank = new THREE.Color(0x5a5236);
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const y = heightAt(x, z);
    pos.setY(v, y);
    const n = (Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.031 + z * 0.027)) * 0.25 + 0.5;
    c.copy(grass).lerp(grass2, n);
    if (inPeaField(x, z)) c.copy((Math.floor((x + 300) / 2.5) % 2) ? pea : peaRow);
    const rd = riverDistance(x, z);
    if (rd < RIVER_HALF_WIDTH + 8) c.copy(bank);
    // trampled mud near the centre where the armies will clash
    const m = Math.exp(-((x * x) / (2 * 160 * 160) + ((z - 10) * (z - 10)) / (2 * 50 * 50)));
    c.lerp(mud, m * 0.25 * n);
    colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);

  // ---- river Severn
  const riverGeo = new THREE.PlaneGeometry(WORLD_SIZE, 1, 128, 1);
  riverGeo.rotateX(-Math.PI / 2);
  const rp = riverGeo.attributes.position;
  for (let v = 0; v < rp.count; v++) {
    const x = rp.getX(v);
    const side = rp.getZ(v) > 0 ? 1 : -1;
    const centre = -250 + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.031 + 1.3) * 5;
    rp.setZ(v, centre + side * (RIVER_HALF_WIDTH + 2));
    rp.setY(v, heightAt(x, centre) + 1.4);
  }
  const river = new THREE.Mesh(riverGeo, new THREE.MeshPhongMaterial({ color: 0x3d6a7d, shininess: 90, transparent: true, opacity: 0.88 }));
  scene.add(river);

  // ---- woods (instanced trees)
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 4, 6).translate(0, 2, 0);
  const crownGeo = new THREE.ConeGeometry(2.6, 7, 7).translate(0, 7, 0);
  const treeSpots = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const w of WOODS) {
    const count = Math.floor(w.r * w.r * 0.05);
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * w.r;
      treeSpots.push([w.x + Math.cos(a) * r, w.z + Math.sin(a) * r, 0.7 + rnd() * 0.7]);
    }
  }
  // scattered hedgerow trees
  for (let k = 0; k < 120; k++) {
    const x = (rnd() - 0.5) * WORLD_SIZE * 0.95, z = (rnd() - 0.5) * WORLD_SIZE * 0.95;
    if (Math.abs(x) < 260 && z > -200 && z < 220) continue; // keep the battlefield open
    if (riverDistance(x, z) < RIVER_HALF_WIDTH + 4) continue;
    treeSpots.push([x, z, 0.8 + rnd() * 0.5]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4a3622 }), treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2f4a24 }), treeSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  treeSpots.forEach(([x, z, sc], k) => {
    p.set(x, heightAt(x, z) - 0.2, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    s.set(sc, sc * (0.8 + rnd() * 0.5), sc);
    m4.compose(p, q, s);
    trunks.setMatrixAt(k, m4);
    crowns.setMatrixAt(k, m4);
    crowns.setColorAt(k, new THREE.Color().setHSL(0.27 + rnd() * 0.06, 0.4, 0.18 + rnd() * 0.08));
  });
  crowns.castShadow = true;
  scene.add(trunks, crowns);

  // ---- camps / banners for flavour
  const tentGeo = new THREE.ConeGeometry(3, 4, 4).translate(0, 2, 0);
  const tents = [
    [-40, -190, 0xd9c48a], [-20, -195, 0xe0b341], [10, -192, 0xd9c48a], [30, -186, 0xe0b341],
    [-30, 225, 0xc8323c], [0, 230, 0xe5e0d0], [30, 225, 0xc8323c], [60, 232, 0x2b4a9a], [-60, 232, 0x2b4a9a],
  ];
  for (const [x, z, col] of tents) {
    const t = new THREE.Mesh(tentGeo, new THREE.MeshLambertMaterial({ color: col }));
    t.position.set(x, heightAt(x, z), z);
    t.rotation.y = 0.8;
    t.castShadow = true;
    scene.add(t);
  }

  return { scene, sun, terrain };
}

// Palisade cell meshes (built by the player in command mode)
export function createFortRenderer(scene) {
  const post = new THREE.CylinderGeometry(0.22, 0.26, 3.2, 5).translate(0, 1.4, 0);
  const tip = new THREE.ConeGeometry(0.26, 0.6, 5).translate(0, 3.3, 0);
  const geo = mergeSimple([post, tip]);
  const POSTS = 5;
  const max = 3000 * POSTS;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x7a5a36 }), max);
  mesh.count = 0;
  mesh.castShadow = true;
  scene.add(mesh);
  const cells = new Map(); // cell -> first instance index
  const m4 = new THREE.Matrix4();
  const rebuild = () => {
    let k = 0;
    for (const c of cells.keys()) {
      const cx = c % NAV_DIM, cz = (c / NAV_DIM) | 0;
      const x0 = cx * NAV_CELL - HALF_WORLD, z0 = cz * NAV_CELL - HALF_WORLD;
      for (let p = 0; p < POSTS; p++) {
        for (let r = 0; r < 1; r++) {
          const x = x0 + 0.4 + (p / (POSTS - 1)) * (NAV_CELL - 0.8);
          const z = z0 + NAV_CELL / 2 + Math.sin(p * 2.3 + c) * 0.25;
          // second row offset across the cell so the wall looks solid from all directions
          m4.makeRotationZ(Math.sin(p + c) * 0.08);
          m4.setPosition(x, groundY(x, z), z);
          mesh.setMatrixAt(k++, m4);
          const x2 = x0 + NAV_CELL / 2 + Math.cos(p * 1.7 + c) * 0.25;
          const z2 = z0 + 0.4 + (p / (POSTS - 1)) * (NAV_CELL - 0.8);
          m4.makeRotationX(Math.sin(p * 1.3 + c) * 0.08);
          m4.setPosition(x2, groundY(x2, z2), z2);
          if (k < max) mesh.setMatrixAt(k++, m4);
        }
      }
    }
    mesh.count = Math.min(k, max);
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    add(list) { for (const c of list) cells.set(c, true); rebuild(); },
    remove(c) { cells.delete(c); rebuild(); },
  };
}

// Minimal geometry merge (non-indexed) with optional per-part vertex colours.
export function mergeSimple(geos, colors) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  parts.forEach((g, gi) => {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    const cc = new THREE.Color(colors ? colors[gi] : 0xffffff);
    for (let v = 0; v < g.attributes.position.count; v++) {
      col[(o + v) * 3] = cc.r; col[(o + v) * 3 + 1] = cc.g; col[(o + v) * 3 + 2] = cc.b;
    }
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
