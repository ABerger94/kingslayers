// Your settlement in 3D, for missions fought at home (the Sycharth defense and Endless Siege):
// the Temporal Beacon plus the buildings you placed on the settlement screen.
import * as THREE from 'three';
import { groundY } from './world.js';

function hut(color, roof, w, d, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  body.position.y = h / 2;
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.8, 4), new THREE.MeshLambertMaterial({ color: roof }));
  r.position.y = h + h * 0.4;
  r.rotation.y = Math.PI / 4;
  g.add(body, r);
  body.castShadow = r.castShadow = true;
  return g;
}

function buildingMesh(type) {
  switch (type) {
    case 'house': return hut(0xc9b48a, 0x7a4a2a, 4, 4, 2.6);
    case 'barracks': {
      const g = hut(0x7d6a55, 0x4a3a2a, 9, 4.5, 3);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), new THREE.MeshLambertMaterial({ color: 0x5a3e22 }));
      pole.position.set(4, 3, 0);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: 0xe0b341, side: THREE.DoubleSide }));
      flag.position.set(4.8, 5.4, 0);
      g.add(pole, flag);
      return g;
    }
    case 'mill': {
      const g = hut(0x6d4c2c, 0x3d2c1a, 6, 4, 2.6);
      for (let k = 0; k < 3; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
        log.position.set(0, 0.25 + k * 0.45, 3);
        g.add(log);
      }
      return g;
    }
    case 'farm': {
      const g = new THREE.Group();
      const field = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 8), new THREE.MeshLambertMaterial({ color: 0xb8a14a }));
      field.position.y = 0.1;
      g.add(field, hut(0xa08a60, 0x6a4a2a, 3, 3, 2).translateX(-7.5));
      return g;
    }
  }
  return null;
}

export function buildSettlementScene(scene, beacon, buildings) {
  const group = new THREE.Group();
  scene.add(group);
  // The Temporal Beacon: a modern pylon with a glowing core
  const by = groundY(beacon.x, beacon.z);
  const pylon = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 2, 8), new THREE.MeshLambertMaterial({ color: 0x2a3238 }));
  base.position.y = 1;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 9, 8), new THREE.MeshPhongMaterial({ color: 0x5a646c, shininess: 80 }));
  mast.position.y = 6.5;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8ff0ff }));
  core.position.y = 11.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: 0x8ff0ff }));
  ring.position.y = 11.5;
  const light = new THREE.PointLight(0x8ff0ff, 30, 40, 2);
  light.position.y = 11.5;
  pylon.add(base, mast, core, ring, light);
  pylon.position.set(beacon.x, by, beacon.z);
  for (const m of [base, mast]) m.castShadow = true;
  group.add(pylon);

  // Buildings: settlement-screen positions (0..1) mapped onto the ground around the Beacon
  for (const b of buildings) {
    if (b.type === 'beacon') continue;
    const mesh = buildingMesh(b.type);
    if (!mesh) continue;
    const x = beacon.x + (b.x - 0.5) * 150;
    const z = beacon.z + (b.y - 0.52) * 70;
    if (Math.hypot(x - beacon.x, z - beacon.z) < 8) continue;
    mesh.position.set(x, groundY(x, z), z);
    mesh.rotation.y = (b.x * 13 + b.y * 7) % (Math.PI * 2);
    group.add(mesh);
  }

  let alive = true;
  return {
    update(t) {
      if (!alive) return;
      ring.rotation.x = t * 1.3;
      ring.rotation.y = t * 0.7;
      core.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    },
    destroyBeacon(fx, camPos) {
      if (!alive) return;
      alive = false;
      fx.explosion(beacon.x, beacon.z, 9, camPos);
      core.visible = ring.visible = false;
      light.intensity = 0;
      mast.rotation.z = 1.2;
      mast.position.set(3, 2, 0);
    },
  };
}
