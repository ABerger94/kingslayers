// Off-map fire support: the airstrike (jet bombing run) and the attack helicopter.
import * as THREE from 'three';
import { groundY } from './world.js';
import { TEAM_CROWN } from '../shared/constants.js';

export const SUPPORT = {
  airstrike: { name: 'Airstrike', key: 'Z', cooldown: 50 },
  gunship: { name: 'Gunship', key: 'X', cooldown: 80, duration: 30 },
};

function buildJet() {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0x8a9096 });
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 14, 8).rotateX(Math.PI / 2), m));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 3.5), m);
  wing.position.z = -1.5;
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 2), m);
  tail.position.set(0, 1.3, -5.5);
  g.add(tail);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.z = -8;
  g.add(flame);
  return g;
}

function buildHeli() {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0x3d4535 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 6), m);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.6), new THREE.MeshPhongMaterial({ color: 0x1b2630, shininess: 80 }));
  nose.position.set(0, 0.2, 3.4);
  g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 6), m);
  boom.position.set(0, 0.4, -5.5);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), m);
  fin.position.set(0, 1.1, -8.3);
  g.add(fin);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 1), m);
  wings.position.set(0, -0.2, 0.2);
  g.add(wings);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.2;
  g.add(rotor);
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  g.add(rotor2);
  g.userData.rotors = [rotor, rotor2];
  return g;
}

export class Support {
  constructor(scene, fx, audio, army, send, player) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.army = army; this.send = send; this.player = player;
    this.cd = { airstrike: 0, gunship: 0 };
    this.jets = [];
    this.bombs = [];
    this.heli = null;
    this.pending = [];
    this.onMessage = null;
  }

  ready(kind) { return this.cd[kind] <= 0; }

  callAirstrike(target) {
    if (!this.ready('airstrike')) { this.onMessage?.(`Airstrike not ready (${Math.ceil(this.cd.airstrike)}s)`); return false; }
    this.cd.airstrike = SUPPORT.airstrike.cooldown;
    this.audio.radio();
    this.onMessage?.('"Reaper Two-One, inbound. Thirty seconds… make that five hundred years."');
    // Bombing run from north to south, over the target
    const dir = new THREE.Vector3(0, 0, 1);
    this.pending.push({ at: 3.0, fn: () => this.spawnJet(target.clone(), dir) });
    this.marker(target);
    return true;
  }

  marker(target) {
    // Red smoke on the target
    for (let k = 0; k < 40; k++) {
      this.fx.spawn(target.x + (Math.random() - 0.5) * 2, groundY(target.x, target.z) + 0.5, target.z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 0.9, 0.15, 0.1, 1.2, 3 + Math.random() * 2, -0.4, 1.0);
    }
  }

  spawnJet(target, dir) {
    const jet = buildJet();
    const start = target.clone().addScaledVector(dir, -500);
    start.y = groundY(target.x, target.z) + 90;
    jet.position.copy(start);
    jet.lookAt(start.clone().add(dir));
    this.scene.add(jet);
    const drops = [];
    for (let k = -2; k <= 2; k++) drops.push(target.clone().addScaledVector(dir, k * 15));
    this.jets.push({ mesh: jet, dir, speed: 160, drops, life: 7 });
    this.audio.jet(Math.hypot(this.player.pos.x - target.x, this.player.pos.z - target.z));
  }

  callGunship(center) {
    if (!this.ready('gunship')) { this.onMessage?.(`Gunship not ready (${Math.ceil(this.cd.gunship)}s)`); return false; }
    if (this.heli) return false;
    this.cd.gunship = SUPPORT.gunship.cooldown;
    this.audio.radio();
    this.onMessage?.('"Viper One-Six on station. Painting targets."');
    const mesh = buildHeli();
    this.scene.add(mesh);
    this.heli = { mesh, center: center.clone(), t: 0, angle: 0, gunCd: 0, rocketCd: 2, target: -1, burst: 0 };
    mesh.position.set(center.x, groundY(center.x, center.z) + 120, center.z - 250);
    return true;
  }

  update(dt, camPos) {
    this.cd.airstrike = Math.max(0, this.cd.airstrike - dt);
    this.cd.gunship = Math.max(0, this.cd.gunship - dt);
    for (let k = this.pending.length - 1; k >= 0; k--) {
      const p = this.pending[k];
      p.at -= dt;
      if (p.at <= 0) { this.pending.splice(k, 1); p.fn(); }
    }
    // Jets
    for (let k = this.jets.length - 1; k >= 0; k--) {
      const j = this.jets[k];
      j.mesh.position.addScaledVector(j.dir, j.speed * dt);
      j.life -= dt;
      for (let d = j.drops.length - 1; d >= 0; d--) {
        const drop = j.drops[d];
        // Release so that the bomb lands on target (simple lead)
        const along = (drop.clone().sub(j.mesh.position)).dot(j.dir);
        if (along < 160 * 1.6) {
          j.drops.splice(d, 1);
          this.bombs.push({ p: j.mesh.position.clone(), v: j.dir.clone().multiplyScalar(j.speed * 0.7), target: drop });
        }
      }
      if (j.life <= 0) { this.scene.remove(j.mesh); this.jets.splice(k, 1); }
    }
    // Bombs: steer onto their aim point while falling
    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const b = this.bombs[k];
      b.v.y -= 9.81 * dt * 3;
      const to = b.target.clone().sub(b.p);
      to.y = 0;
      b.v.x += to.x * dt * 2; b.v.z += to.z * dt * 2;
      b.v.x *= 0.97; b.v.z *= 0.97;
      b.p.addScaledVector(b.v, dt);
      this.fx.spawn(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.6, -0.1, 0.5);
      if (b.p.y <= groundY(b.p.x, b.p.z)) {
        this.bombs.splice(k, 1);
        this.send({ t: 'explode', x: b.p.x, z: b.p.z, r: 10, dmg: 450 });
        this.fx.explosion(b.p.x, b.p.z, 10, camPos);
        this.audio.explosion(Math.hypot(camPos.x - b.p.x, camPos.z - b.p.z));
      }
    }
    this.updateHeli(dt, camPos);
  }

  updateHeli(dt, camPos) {
    const h = this.heli;
    if (!h) return;
    h.t += dt;
    const dur = SUPPORT.gunship.duration;
    const m = h.mesh;
    for (const r of m.userData.rotors) r.rotation.y += dt * 30;
    // Orbit centre follows the player loosely so it supports them
    h.center.lerp(this.player.pos, dt * 0.05);
    const gy = groundY(h.center.x, h.center.z);
    let want;
    if (h.t > dur) {
      want = new THREE.Vector3(h.center.x, gy + 140, h.center.z - 400);
      if (h.t > dur + 8) { this.scene.remove(m); this.heli = null; this.onMessage?.('Gunship returning to base.'); return; }
    } else {
      h.angle += dt * 0.35;
      want = new THREE.Vector3(h.center.x + Math.cos(h.angle) * 55, gy + 42, h.center.z + Math.sin(h.angle) * 55);
    }
    const prev = m.position.clone();
    m.position.lerp(want, Math.min(1, dt * (h.t < 4 ? 0.6 : 1.5)));
    const vel = m.position.clone().sub(prev);
    if (h.t > dur || h.target < 0) {
      if (vel.lengthSq() > 1e-4) m.rotation.y = Math.atan2(vel.x, vel.z);
    }
    if (h.t < 3 || h.t > dur) return;
    // Pick targets: royal soldiers near the orbit centre
    const army = this.army;
    if (h.target < 0 || army.stateOf[h.target] === 5) {
      const cand = army.nearby(h.center.x, h.center.z, 75, TEAM_CROWN);
      h.target = cand.length ? cand[(Math.random() * cand.length) | 0] : -1;
      h.burst = 12 + (Math.random() * 10) | 0;
    }
    if (h.target >= 0) {
      const tp = new THREE.Vector3(army.px[h.target], army.py[h.target] + 1, army.pz[h.target]);
      m.rotation.y = Math.atan2(tp.x - m.position.x, tp.z - m.position.z);
      m.rotation.x = 0.25;
      h.gunCd -= dt;
      if (h.gunCd <= 0 && h.burst > 0) {
        h.gunCd = 0.06;
        h.burst--;
        const muzzle = m.position.clone().add(new THREE.Vector3(0, -1, 0));
        const spread = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
        const end = tp.clone().add(spread);
        this.fx.tracer(muzzle, end, [1, 0.6, 0.3]);
        this.audio.minigun();
        // Damage anyone near the impact
        for (const i of army.nearby(end.x, end.z, 1.4, TEAM_CROWN)) {
          this.player.hits.push(i, 90);
          this.fx.blood(army.px[i], army.py[i] + 1, army.pz[i], 5);
        }
        this.fx.dirt(end.x, groundY(end.x, end.z), end.z, 2);
        if (h.burst === 0) { h.target = -1; h.gunCd = 0.6; }
      }
      h.rocketCd -= dt;
      if (h.rocketCd <= 0) {
        h.rocketCd = 3;
        const x = tp.x, z = tp.z;
        this.fx.tracer(m.position, tp, [1, 0.9, 0.7]);
        this.send({ t: 'explode', x, z, r: 6, dmg: 260 });
        this.fx.explosion(x, z, 6, camPos);
        this.audio.explosion(Math.hypot(camPos.x - x, camPos.z - z));
      }
    }
  }
}
