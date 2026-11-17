// The time-travelling operative: third-person movement, camera, modern weapons, a longsword,
// breaching charges and the armoured SUV.
import * as THREE from 'three';
import { groundY } from './world.js';
import { structTop } from './structures.js';
import { inRiver, inWoods } from '../shared/terrain.js';
import { HALF_WORLD, TEAM_REBEL, TEAM_CROWN } from '../shared/constants.js';

const UP = new THREE.Vector3(0, 1, 0);
const SPAWN = new THREE.Vector3(24, 0, -158);
export const SWORD_SLOT = 3;
export const MAX_C4 = 3;
const C4_FUSE = 4;

export const WEAPONS = [
  { name: 'Assault Rifle', short: 'AR', magSize: 30, reserve: 300, rpm: 700, auto: true, reload: 1.8, dmg: 70, pellets: 1, spread: 0.008, aimSpread: 0.002, range: 400 },
  { name: 'Combat Shotgun', short: 'SG', magSize: 8, reserve: 64, rpm: 75, auto: false, reload: 2.6, dmg: 32, pellets: 10, spread: 0.06, aimSpread: 0.045, range: 60 },
  { name: 'Grenade Launcher', short: 'GL', magSize: 6, reserve: 30, rpm: 80, auto: false, reload: 3.0, projectile: true, radius: 7, blast: 280 },
  { name: 'Longsword', short: 'SW', melee: true, magSize: 0, reserve: 0 },
];

// Sword moves: range (m), arc (radians, centred on facing), damage, max targets,
// duration and the moment in the swing when the blade connects.
const MOVES = {
  light: { range: 2.9, arc: 2.3, dmg: [75, 90], max: 3, dur: 0.36, hitAt: 0.14 },
  spin: { range: 3.3, arc: Math.PI * 2, dmg: [130], max: 8, dur: 0.55, hitAt: 0.3 },
  heavy: { range: 3.6, arc: 1.9, dmg: [270], max: 6, dur: 0.62, hitAt: 0.38 },
  lunge: { range: 3.2, arc: 1.5, dmg: [120], max: 3, dur: 0.42, hitAt: 0.2 },
};
const HEAVY_CHARGE = 0.35;

function buildOperative() {
  const g = new THREE.Group();
  const camo = new THREE.MeshLambertMaterial({ color: 0x3b4233 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e1c });
  const tan = new THREE.MeshLambertMaterial({ color: 0x6e6449 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = add(new THREE.BoxGeometry(0.2, 0.85, 0.22).translate(0, -0.42, 0), camo, -0.13, 0.88, 0);
  const legR = add(new THREE.BoxGeometry(0.2, 0.85, 0.22).translate(0, -0.42, 0), camo, 0.13, 0.88, 0);
  add(new THREE.BoxGeometry(0.55, 0.7, 0.34), tan, 0, 1.25, 0); // plate carrier
  add(new THREE.BoxGeometry(0.5, 0.35, 0.3), camo, 0, 0.95, 0);
  add(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc89878 }), 0, 1.72, 0);
  add(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), dark, 0, 1.76, 0); // helmet
  add(new THREE.BoxGeometry(0.22, 0.06, 0.08), dark, 0, 1.78, 0.14); // NVG mount
  const armL = add(new THREE.BoxGeometry(0.14, 0.55, 0.14), camo, -0.36, 1.22, 0.12);
  armL.rotation.x = -0.9;
  const armR = add(new THREE.BoxGeometry(0.14, 0.55, 0.14), camo, 0.36, 1.22, 0.12);
  armR.rotation.x = -1.2;
  const gun = add(new THREE.BoxGeometry(0.08, 0.14, 0.85), dark, 0.18, 1.35, 0.45);
  add(new THREE.BoxGeometry(0.2, 0.3, 0.25), tan, 0, 1.25, -0.28); // pack
  // Longsword on a shoulder pivot: blade points along +z of the pivot
  const swordPivot = new THREE.Group();
  swordPivot.position.set(0.3, 1.38, 0.08);
  swordPivot.rotation.order = 'YXZ';
  g.add(swordPivot);
  const steel = new THREE.MeshPhongMaterial({ color: 0xd8dde3, shininess: 120, specular: 0xffffff });
  add(new THREE.BoxGeometry(0.06, 0.016, 1.15), steel, 0, 0, 0.95, swordPivot); // blade
  add(new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2), steel, 0, 0, 1.58, swordPivot); // point
  add(new THREE.BoxGeometry(0.34, 0.04, 0.05), dark, 0, 0, 0.36, swordPivot); // crossguard
  add(new THREE.BoxGeometry(0.04, 0.04, 0.26), new THREE.MeshLambertMaterial({ color: 0x3a2618 }), 0, 0, 0.22, swordPivot); // grip
  add(new THREE.SphereGeometry(0.035, 6, 5), dark, 0, 0, 0.08, swordPivot); // pommel
  const tip = new THREE.Object3D();
  tip.position.set(0, 0, 1.55);
  swordPivot.add(tip);
  const mid = new THREE.Object3D();
  mid.position.set(0, 0, 1.0);
  swordPivot.add(mid);
  g.userData = { legL, legR, gun, armL, armR, swordPivot, tip, mid };
  return g;
}

function buildSUV() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2a2d2a });
  const glass = new THREE.MeshPhongMaterial({ color: 0x223040, shininess: 100 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.1, 0.9, 4.8), body, 0, 0.95, 0);
  add(new THREE.BoxGeometry(1.9, 0.75, 2.8), body, 0, 1.75, -0.3);
  add(new THREE.BoxGeometry(1.92, 0.5, 0.05), glass, 0, 1.8, 1.12).rotation.x = -0.3;
  add(new THREE.BoxGeometry(2.25, 0.35, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }), 0, 0.75, 2.45); // ram bar
  const wheels = [];
  for (const [x, z] of [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]]) {
    const w = add(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x111111 }), x, 0.48, z);
    wheels.push(w);
  }
  add(new THREE.BoxGeometry(1.4, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffcc }), 0, 2.16, 0.6);
  // ammunition crates on the roof rack: the resupply point
  add(new THREE.BoxGeometry(0.9, 0.35, 0.6), new THREE.MeshLambertMaterial({ color: 0x4d5a3a }), 0, 2.3, -0.9);
  g.userData.wheels = wheels;
  return g;
}

function buildCharge() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.25), new THREE.MeshLambertMaterial({ color: 0x5d5a3c })));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  light.position.y = 0.14;
  g.add(light);
  g.userData.light = light;
  return g;
}

const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export class Player {
  constructor(scene, fx, audio, send) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.send = send;
    this.model = buildOperative();
    this.model.rotation.order = 'YXZ';
    scene.add(this.model);
    this.pos = SPAWN.clone();
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.yaw = 0; // facing +z (toward the royal army)
    this.pitch = -0.05;
    this.hp = 250; this.maxHp = 250;
    this.damageTaken = 1; // set by difficulty
    this.alive = true; this.respawnT = 0;
    this.lastHurt = -99;
    this.weapon = 0;
    this.lastGun = 0;
    this.ammo = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.reserve }));
    this.fireCd = 0; this.reloading = 0;
    this.aiming = false;
    this.grenades = [];
    this.walkPhase = 0;
    this.hits = []; // pending gun/vehicle damage to send to the sim
    this.swordHits = []; // pending sword damage (knockback + inspiration)
    this.camera = null;
    this.aimPoint = new THREE.Vector3();
    this.camShake = 0;
    this.recoil = 0; // temporary upward kick from firing; recovers on its own
    this.assist = 1; // smoothed controller aim-assist slowdown
    // sword state
    this.swing = null;
    this.combo = 0; this.comboT = 0;
    this.charging = false; this.charge = 0;
    this.queued = false;
    this.blocking = false;
    // breaching charges
    this.c4 = MAX_C4;
    this.charges = [];
    // SUV
    this.suv = { model: buildSUV(), pos: new THREE.Vector3(32, 0, -168), heading: 0, speed: 0, hp: 1500, alive: true };
    this.suv.pos.y = groundY(this.suv.pos.x, this.suv.pos.z);
    scene.add(this.suv.model);
    this.inVehicle = false;
    this.resupplying = false;
    this.resupplyT = 0; this.c4T = 0;
    this.sprinting = false;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._o = new THREE.Vector3();
    this.updateWeaponModel();
  }

  get w() { return WEAPONS[this.weapon]; }
  get melee() { return !!this.w.melee; }

  // ------------------------------------------------------------------ per-frame
  // ownsCamera is false in command mode, where the overhead camera is in charge
  update(dt, input, army, camera, time, active, ownsCamera = true) {
    this.camera = camera;
    this.fireCd -= dt;
    this.updateCharges(dt);
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      if (ownsCamera) this.updateCamera(camera, dt);
      return;
    }
    if (time - this.lastHurt > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 18 * dt);
    this.recoil *= Math.exp(-dt * 9);

    if (active) {
      const sens = this.aiming ? 0.0012 : 0.0024;
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens;
      // Controller look: rate-based, slower when aiming down sights, with light aim assist
      const pad = input.pad;
      // Aim assist eases in and out instead of snapping, so the stick doesn't feel sticky/jerky
      const wantAssist = this.aimOnEnemy && !this.inVehicle && !this.melee ? 0.6 : 1;
      this.assist += (wantAssist - this.assist) * Math.min(1, dt * 6);
      if (pad.connected && (pad.rx || pad.ry)) {
        const rate = (this.aiming ? 1.4 : 3.0) * this.assist;
        // squared response curve gives fine control near the centre
        const cx = pad.rx * Math.abs(pad.rx), cy = pad.ry * Math.abs(pad.ry);
        this.yaw -= cx * rate * dt;
        this.pitch -= cy * rate * 0.7 * dt;
      }
      this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch));
      if (input.hit('KeyF')) this.toggleVehicle();
      if (input.hit('KeyG') && !this.inVehicle) this.placeCharge();
    }

    if (this.inVehicle) this.driveSUV(dt, input, army, active);
    else this.walk(dt, input, active);
    this.resupply(dt);
    if (ownsCamera) this.updateCamera(camera, dt);
    if (ownsCamera) this.computeAim(army);
    if (active && !this.inVehicle) this.handleWeapons(dt, input, army, time);
    else { this.aiming = false; this.blocking = false; this.charging = false; }
    this.updateSword(dt, army);
    this.updateGrenades(dt, army);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const a = this.ammo[this.weapon];
        const need = this.w.magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take;
      }
    }
  }

  // Try to move to (nx, nz), sliding along walls
  tryMove(nx, nz) {
    const lim = HALF_WORLD - 6;
    const ok = (x, z) => !inRiver(x, z) && Math.abs(x) < lim && Math.abs(z) < lim && structTop(x, z) === 0;
    if (ok(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return true; }
    if (ok(nx, this.pos.z)) { this.pos.x = nx; return true; }
    if (ok(this.pos.x, nz)) { this.pos.z = nz; return true; }
    return false;
  }

  walk(dt, input, active) {
    const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = this._d.set(-f.z, 0, f.x);
    let mx = 0, mz = 0;
    if (active) {
      if (input.down('KeyW')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyA')) { mx += r.x * -1; mz += r.z * -1; }
      if (input.down('KeyD')) { mx += r.x; mz += r.z; }
      // Controller left stick (analog: partial tilt walks slower)
      const pad = input.pad;
      if (pad.connected && (pad.lx || pad.ly)) {
        mx += f.x * -pad.ly + r.x * pad.lx;
        mz += f.z * -pad.ly + r.z * pad.lx;
      }
    }
    const l = Math.hypot(mx, mz);
    const mag = Math.min(1, l);
    const sprint = active && input.down('ShiftLeft') && !this.aiming && !this.blocking;
    this.sprinting = sprint && l > 0.1;
    let speed = this.aiming ? 3.2 : sprint ? 9 : 5.5;
    if (this.blocking) speed = 2.6;
    if (this.swing) speed *= this.swing.kind === 'lunge' ? 0 : 0.35;
    if (l > 0 && speed > 0) {
      this.tryMove(this.pos.x + mx / l * speed * mag * dt, this.pos.z + mz / l * speed * mag * dt);
      this.walkPhase += dt * speed * 1.6;
    } else this.walkPhase *= 0.9;
    // Lunge carries us forward
    if (this.swing && this.swing.kind === 'lunge' && this.swing.t < 0.25) {
      this.tryMove(this.pos.x + Math.sin(this.swing.face) * 11 * dt, this.pos.z + Math.cos(this.swing.face) * 11 * dt);
    }
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.model.position.copy(this.pos);
    // Body faces the camera direction when aiming/firing/fighting, otherwise the move direction
    const facingCamera = this.aiming || this.blocking || this.charging || (!this.melee && input.mouse.left);
    let face = l > 0 && !facingCamera ? Math.atan2(mx, mz) : this.yaw;
    if (this.swing) face = this.swing.face + (this.swing.kind === 'spin' ? (this.swing.t / this.swing.dur) * Math.PI * 2 : 0);
    const d = angleDiff(face, this.model.rotation.y);
    this.model.rotation.y += this.swing ? d : d * Math.min(1, dt * 12);
    const s = Math.sin(this.walkPhase) * 0.6 * Math.min(1, l);
    this.model.userData.legL.rotation.x = s;
    this.model.userData.legR.rotation.x = -s;
    this.model.visible = true;
  }

  toggleVehicle() {
    const suv = this.suv;
    if (this.inVehicle) {
      this.inVehicle = false;
      const side = new THREE.Vector3(Math.cos(suv.heading), 0, -Math.sin(suv.heading)).multiplyScalar(-2.6);
      this.pos.copy(suv.pos).add(side);
      this.yaw = suv.heading;
    } else if (suv.alive && this.pos.distanceTo(suv.pos) < 5) {
      this.inVehicle = true;
      this.swing = null; this.charging = false;
      this.audio.tone(80, 0.6, 0.25, 'sawtooth', 1.5);
    }
  }

  driveSUV(dt, input, army, active) {
    const suv = this.suv;
    let throttle = 0, steer = 0;
    if (active) {
      if (input.down('KeyW')) throttle += 1;
      if (input.down('KeyS')) throttle -= 1;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
      // Controller: RT accelerate, LT brake / reverse, left stick steer
      const pad = input.pad;
      if (pad.connected) {
        throttle += pad.rt - pad.lt;
        steer -= pad.lx;
        throttle = Math.max(-1, Math.min(1, throttle));
        steer = Math.max(-1, Math.min(1, steer));
      }
    }
    const maxF = 26, maxR = -8;
    if (throttle > 0.05) suv.speed += (suv.speed < 0 ? 30 : 11) * throttle * dt;
    else if (throttle < -0.05) suv.speed -= (suv.speed > 0 ? 30 : 8) * -throttle * dt;
    else suv.speed *= Math.exp(-dt * 0.8);
    suv.speed = Math.max(maxR, Math.min(maxF, suv.speed));
    suv.heading += steer * dt * Math.min(1, Math.abs(suv.speed) / 6) * 1.4 * Math.sign(suv.speed || 1);
    const nx = suv.pos.x + Math.sin(suv.heading) * suv.speed * dt;
    const nz = suv.pos.z + Math.cos(suv.heading) * suv.speed * dt;
    const lim = HALF_WORLD - 6;
    // probe the front bumper for walls
    const fx = Math.sin(suv.heading), fz = Math.cos(suv.heading);
    const bump = Math.sign(suv.speed) * 2.4;
    const solid = structTop(nx + fx * bump, nz + fz * bump) > 0;
    if (inRiver(nx, nz) || inWoods(nx, nz) || Math.abs(nx) > lim || Math.abs(nz) > lim || solid) {
      if (solid && Math.abs(suv.speed) > 8) { this.hurt(Math.abs(suv.speed) * 6, 0, 'crash'); this.fx.dirt(nx + fx * bump, suv.pos.y + 1, nz + fz * bump, 12); this.camShake = 0.8; }
      suv.speed *= -0.3;
    } else { suv.pos.x = nx; suv.pos.z = nz; }
    suv.pos.y = groundY(suv.pos.x, suv.pos.z);
    // Pitch/roll to terrain
    const hf = groundY(suv.pos.x + fx * 2, suv.pos.z + fz * 2), hb = groundY(suv.pos.x - fx * 2, suv.pos.z - fz * 2);
    const hr = groundY(suv.pos.x + fz, suv.pos.z - fx), hl = groundY(suv.pos.x - fz, suv.pos.z + fx);
    suv.model.position.copy(suv.pos);
    suv.model.rotation.set(0, 0, 0);
    suv.model.rotation.order = 'YXZ';
    suv.model.rotation.y = suv.heading;
    suv.model.rotation.x = -Math.atan2(hf - hb, 4);
    suv.model.rotation.z = Math.atan2(hr - hl, 2);
    for (const w of suv.model.userData.wheels) w.rotation.x += suv.speed * dt / 0.48;
    this.pos.copy(suv.pos);
    this.model.visible = false;
    // Ramming
    if (Math.abs(suv.speed) > 4) {
      const ahead = suv.speed > 0 ? 1.8 : -1.8;
      const cx = suv.pos.x + fx * ahead, cz = suv.pos.z + fz * ahead;
      for (const i of army.nearby(cx, cz, 2.6, TEAM_CROWN)) {
        if (army.onWall(i)) continue;
        this.hits.push(i, 60 * Math.abs(suv.speed));
        this.onRumble?.(0.5, 0.3, 120);
        this.fx.blood(army.px[i], army.py[i] + 1, army.pz[i], 12);
        suv.speed *= army.typeOf[i] === 3 ? 0.75 : 0.95;
      }
      if (Math.random() < dt * 10) this.fx.dirt(suv.pos.x - fx * 2.4, suv.pos.y + 0.3, suv.pos.z - fz * 2.4, 2);
    }
    if (active && input.down('Space')) suv.speed *= Math.exp(-dt * 4); // handbrake
  }

  // Standing by the SUV refills ammunition, breaching charges and health
  resupply(dt) {
    const suv = this.suv;
    this.resupplying = !this.inVehicle && suv.alive && this.pos.distanceTo(suv.pos) < 6;
    if (!this.resupplying) { this.resupplyT = 0; return; }
    this.resupplyT += dt;
    this.c4T += dt;
    if (this.resupplyT >= 1) {
      this.resupplyT = 0;
      WEAPONS.forEach((w, k) => {
        if (w.melee) return;
        this.ammo[k].reserve = Math.min(w.reserve, this.ammo[k].reserve + Math.ceil(w.reserve * 0.15));
      });
      this.hp = Math.min(this.maxHp, this.hp + 25);
    }
    if (this.c4T >= 6) {
      this.c4T = 0;
      if (this.c4 < MAX_C4) { this.c4++; this.audio.reload(); }
    }
  }

  updateCamera(camera, dt) {
    const target = this._o.copy(this.inVehicle ? this.suv.pos : this.pos);
    let dist, side, height;
    if (this.inVehicle) { dist = 10; side = 0; height = 3.5; }
    else if (this.aiming) { dist = 1.9; side = 0.75; height = 1.6; }
    else if (this.melee) { dist = 4.8; side = 0.6; height = 1.8; }
    else { dist = 4.2; side = 0.9; height = 1.65; }
    const pitch = Math.min(0.95, this.pitch + this.recoil);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = this._v.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    const right = this._d.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const head = new THREE.Vector3(target.x, target.y + height, target.z);
    const want = head.clone().addScaledVector(fwd, -dist).addScaledVector(right, side);
    // Don't let the camera end up inside castle walls: pull in toward the head
    for (let k = 1; k <= 8; k++) {
      const p = head.clone().lerp(want, k / 8);
      if (p.y < groundY(p.x, p.z) + structTop(p.x, p.z) + 0.3 && structTop(p.x, p.z) > 0) { want.copy(head.lerp(want, (k - 1) / 8)); break; }
    }
    const gy = groundY(want.x, want.z) + 0.4;
    if (want.y < gy) want.y = gy;
    if (!this.camInit) { camera.position.copy(want); this.camInit = true; }
    camera.position.lerp(want, Math.min(1, dt * 18));
    const look = camera.position.clone().add(fwd);
    camera.lookAt(look);
    const fov = this.aiming ? 45 : 70;
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
  }

  // Where the crosshair points: first soldier or terrain along the camera ray.
  computeAim(army) {
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const o = cam.position;
    const tTerrain = marchTerrain(o, dir, 500);
    const hit = army.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, tTerrain);
    this.aimOnEnemy = !!hit && hit.t < 150;
    const t = hit ? hit.t : tTerrain;
    this.aimPoint.copy(o).addScaledVector(dir, t);
    this.aimDir = dir;
  }

  muzzlePos() {
    const m = this.model;
    return new THREE.Vector3(0.18, 1.38, 0.9).applyAxisAngle(UP, m.rotation.y).add(this.pos);
  }

  handleWeapons(dt, input, army, time) {
    if (input.hit('Digit1')) this.switchWeapon(0);
    if (input.hit('Digit2')) this.switchWeapon(1);
    if (input.hit('Digit3')) this.switchWeapon(2);
    if (input.hit('Digit4')) this.switchWeapon(SWORD_SLOT);
    if (input.hit('KeyQ')) this.switchWeapon(this.melee ? this.lastGun : SWORD_SLOT);
    if (input.mouse.wheel) this.switchWeapon((this.weapon + (input.mouse.wheel > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length);

    if (this.melee) { this.handleSword(dt, input); return; }
    this.aiming = input.mouse.right;
    const a = this.ammo[this.weapon];
    if (input.hit('KeyR') && a.mag < this.w.magSize && a.reserve > 0 && this.reloading <= 0) this.startReload();
    const trigger = this.w.auto ? input.mouse.left : input.mouse.leftClicked;
    if (trigger && this.fireCd <= 0 && this.reloading <= 0) {
      if (a.mag <= 0) {
        if (a.reserve > 0) this.startReload(); else if (input.mouse.leftClicked) this.audio.click();
        return;
      }
      a.mag--;
      this.fireCd = 60 / this.w.rpm;
      this.fire(army, time);
      if (a.mag === 0 && a.reserve > 0) this.startReload();
    }
  }

  switchWeapon(i) {
    if (i === this.weapon) return;
    if (!WEAPONS[this.weapon].melee) this.lastGun = this.weapon;
    this.weapon = i;
    this.reloading = 0;
    this.fireCd = 0.3;
    this.swing = null; this.charging = false; this.blocking = false; this.aiming = false;
    if (WEAPONS[i].melee) this.audio.swoosh(); else this.audio.reload();
    this.updateWeaponModel();
  }

  updateWeaponModel() {
    const u = this.model.userData;
    u.gun.visible = !this.melee;
    u.swordPivot.visible = this.melee;
  }

  // ------------------------------------------------------------------ sword
  handleSword(dt, input) {
    const m = input.mouse;
    this.aiming = false;
    this.blocking = m.right && !this.swing;
    if (this.blocking) { this.charging = false; return; }
    if (m.leftClicked) {
      if (this.swing) this.queued = true;
      else if (this.sprinting) this.startSwing('lunge');
      else { this.charging = true; this.charge = 0; }
    }
    if (this.charging) {
      this.charge += dt;
      if (this.charge >= HEAVY_CHARGE && Math.random() < dt * 30) {
        const tip = this.model.userData.tip.getWorldPosition(this._o);
        this.fx.spawn(tip.x, tip.y, tip.z, 0, 0.6, 0, 1, 0.75, 0.3, 0.12, 0.25, 0);
      }
      if (!m.left || m.leftReleased) {
        this.charging = false;
        if (this.charge >= HEAVY_CHARGE) this.startSwing('heavy');
        else this.startSwing(this.combo === 2 ? 'spin' : 'light');
      }
    }
  }

  startSwing(kind) {
    const mv = MOVES[kind];
    let dmg = mv.dmg[0];
    if (kind === 'light') dmg = mv.dmg[Math.min(this.combo, mv.dmg.length - 1)];
    this.swing = { kind, t: 0, dur: mv.dur, hitAt: mv.hitAt, hit: false, dmg, face: this.yaw, dir: this.combo % 2 ? -1 : 1 };
    if (kind === 'light') this.combo = (this.combo + 1) % 3;
    else this.combo = 0;
    this.comboT = 0;
    this.audio.swoosh(kind === 'heavy' || kind === 'spin');
  }

  updateSword(dt, army) {
    const u = this.model.userData, pv = u.swordPivot;
    if (!this.melee) return;
    this.comboT += dt;
    if (!this.swing && this.comboT > 0.9) this.combo = 0;
    const sw = this.swing;
    if (sw) {
      sw.t += dt;
      const f = Math.min(1, sw.t / sw.dur);
      if (sw.kind === 'light') {
        const e = Math.min(1, sw.t / (sw.hitAt * 1.7));
        pv.rotation.set(0.15, sw.dir * (1.5 - 3.0 * e), sw.dir * -0.4);
      } else if (sw.kind === 'heavy') {
        const wind = sw.hitAt * 0.8;
        if (sw.t < wind) pv.rotation.set(-2.0, 0, 0);
        else pv.rotation.set(-2.0 + Math.min(1, (sw.t - wind) / (sw.hitAt - wind + 0.05)) * 3.0, 0, 0);
      } else if (sw.kind === 'spin') {
        pv.rotation.set(0.1, -1.35, 0.3);
      } else if (sw.kind === 'lunge') {
        pv.rotation.set(0.05 - (f < 0.5 ? 0 : 0.4), 0, 0);
      }
      // blade trail
      const active = sw.t > sw.hitAt - 0.1 && sw.t < sw.hitAt + 0.08;
      if (active || sw.kind === 'spin') {
        for (const o of [u.tip, u.mid]) {
          const p = o.getWorldPosition(this._o);
          this.fx.spawn(p.x, p.y, p.z, 0, 0, 0, 0.75, 0.85, 1, 0.16, 0.18, 0);
        }
      }
      if (!sw.hit && sw.t >= sw.hitAt) { sw.hit = true; this.swordHit(sw, army); }
      if (sw.t >= sw.dur) {
        this.swing = null;
        if (this.queued) { this.queued = false; this.startSwing(this.combo === 2 ? 'spin' : 'light'); }
      }
    } else if (this.blocking) {
      pv.rotation.set(-0.5, -1.1, 1.3);
    } else if (this.charging) {
      pv.rotation.x += (-2.0 - pv.rotation.x) * Math.min(1, dt * 10);
      pv.rotation.y *= 0.8;
    } else {
      // relaxed guard, blade forward and low
      pv.rotation.x += (0.55 - pv.rotation.x) * Math.min(1, dt * 10);
      pv.rotation.y += (-0.25 - pv.rotation.y) * Math.min(1, dt * 10);
      pv.rotation.z += (0 - pv.rotation.z) * Math.min(1, dt * 10);
    }
  }

  swordHit(sw, army) {
    const mv = MOVES[sw.kind];
    const face = sw.kind === 'spin' ? 0 : sw.face;
    const cand = army.nearby(this.pos.x, this.pos.z, mv.range + 1.2, TEAM_CROWN);
    const hits = [];
    for (const i of cand) {
      if (army.py[i] - this.pos.y > 2.5) continue; // can't reach men on the walls
      const dx = army.px[i] - this.pos.x, dz = army.pz[i] - this.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = mv.range + (army.typeOf[i] === 3 ? 0.8 : 0.3);
      if (d > reach) continue;
      if (sw.kind !== 'spin' && Math.abs(angleDiff(Math.atan2(dx, dz), face)) > mv.arc / 2 && d > 0.9) continue;
      hits.push([i, d]);
    }
    hits.sort((a, b) => a[1] - b[1]);
    const n = Math.min(mv.max, hits.length);
    for (let k = 0; k < n; k++) {
      const i = hits[k][0];
      this.swordHits.push(i, sw.dmg * (0.9 + Math.random() * 0.2));
      this.fx.blood(army.px[i], army.py[i] + 1.2, army.pz[i], sw.kind === 'heavy' ? 18 : 10);
    }
    if (n) {
      this.audio.slash();
      if (Math.random() < 0.5) this.audio.clang();
      this.onHit?.();
      this.onRumble?.(sw.kind === 'heavy' ? 0.9 : 0.4, 0.5, sw.kind === 'heavy' ? 200 : 90);
      this.camShake = sw.kind === 'heavy' ? 0.7 : 0.25;
    }
    if (sw.kind === 'heavy') {
      // ground impact
      const fx = this.pos.x + Math.sin(face) * 2, fz = this.pos.z + Math.cos(face) * 2;
      this.fx.dirt(fx, groundY(fx, fz), fz, 10);
    }
  }

  // ------------------------------------------------------------------ guns
  startReload() {
    this.reloading = this.w.reload;
    this.audio.reload();
  }

  fire(army) {
    const w = this.w;
    const muzzle = this.muzzlePos();
    const base = this._v.copy(this.aimPoint).sub(muzzle).normalize();
    this.model.rotation.y = this.yaw;
    if (w.projectile) {
      const v = base.clone().multiplyScalar(48);
      v.y += 3;
      this.grenades.push({ p: muzzle.clone(), v, t: 0 });
      this.fx.muzzle(muzzle, base, true);
      this.audio.launcher();
      this.camShake = 0.3;
      this.onRumble?.(0.6, 0.4, 150);
      return;
    }
    w.pellets > 1 ? this.audio.shotgun() : this.audio.rifle();
    this.fx.muzzle(muzzle, base, w.pellets > 1);
    this.camShake = w.pellets > 1 ? 0.6 : 0.15;
    if (w.pellets > 1) this.onRumble?.(0.8, 0.6, 160); else this.onRumble?.(0.15, 0.35, 50);
    // Recoil: a kick that springs back, so holding the trigger doesn't walk the aim into the sky
    this.recoil = Math.min(0.12, this.recoil + (w.pellets > 1 ? 0.06 : 0.012));
    this.yaw += (Math.random() - 0.5) * 0.002;
    const spread = this.aiming ? w.aimSpread : w.spread;
    let anyHit = false;
    for (let p = 0; p < w.pellets; p++) {
      const d = this._d.copy(base);
      d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2;
      d.normalize();
      const tT = marchTerrain(muzzle, d, w.range);
      const hit = army.raycast(muzzle.x, muzzle.y, muzzle.z, d.x, d.y, d.z, tT);
      const end = muzzle.clone().addScaledVector(d, hit ? hit.t : tT);
      if (p < 3 || Math.random() < 0.3) this.fx.tracer(muzzle, end);
      if (hit) {
        const falloff = w.pellets > 1 ? Math.max(0.3, 1 - hit.t / w.range) : 1;
        const dmg = w.dmg * falloff * (hit.head ? 2.5 : 1);
        this.hits.push(hit.i, dmg);
        this.fx.blood(end.x, end.y, end.z, hit.head ? 14 : 7);
        anyHit = true;
      } else if (tT < w.range) {
        this.fx.dirt(end.x, end.y, end.z, 4);
      }
    }
    if (anyHit) this.onHit?.();
  }

  updateGrenades(dt, army) {
    for (let k = this.grenades.length - 1; k >= 0; k--) {
      const g = this.grenades[k];
      g.t += dt;
      g.v.y -= 9.81 * dt;
      g.p.addScaledVector(g.v, dt);
      if (Math.random() < 0.6) this.fx.spawn(g.p.x, g.p.y, g.p.z, 0, 0.5, 0, 0.6, 0.6, 0.6, 0.25, 0.5, -0.2, 0.3);
      const gy = groundY(g.p.x, g.p.z);
      let boom = g.p.y <= gy + 0.1 || g.p.y < gy + structTop(g.p.x, g.p.z) || g.t > 8;
      if (!boom && g.t > 0.15) {
        const near = army.nearby(g.p.x, g.p.z, 1.0, TEAM_CROWN);
        if (near.length && g.p.y < army.py[near[0]] + 2 && g.p.y > army.py[near[0]] - 0.5) boom = true;
      }
      if (boom) {
        this.grenades.splice(k, 1);
        this.detonate(g.p.x, g.p.z, WEAPONS[2].radius, WEAPONS[2].blast);
      }
    }
  }

  // ------------------------------------------------------------------ breaching charges
  placeCharge() {
    if (this.c4 <= 0) { this.onMessage?.('No breaching charges left. Resupply at the SUV.', true); this.audio.click(); return; }
    // Stick it to a wall in front of us if there is one within reach, otherwise drop it here
    const fx = Math.sin(this.model.rotation.y), fz = Math.cos(this.model.rotation.y);
    let x = this.pos.x + fx * 0.8, z = this.pos.z + fz * 0.8;
    for (let s = 0.5; s <= 3; s += 0.25) {
      if (structTop(this.pos.x + fx * s, this.pos.z + fz * s) > 0) { x = this.pos.x + fx * (s - 0.25); z = this.pos.z + fz * (s - 0.25); break; }
    }
    this.c4--;
    const mesh = buildCharge();
    mesh.position.set(x, groundY(x, z) + 0.8, z);
    mesh.rotation.y = this.model.rotation.y;
    this.scene.add(mesh);
    this.charges.push({ x, z, t: C4_FUSE, mesh, beep: 0 });
    this.onMessage?.(`Breaching charge set — ${C4_FUSE} seconds! Get clear!`);
    this.audio.beep();
  }

  updateCharges(dt) {
    for (let k = this.charges.length - 1; k >= 0; k--) {
      const c = this.charges[k];
      c.t -= dt;
      c.beep -= dt;
      const interval = Math.max(0.12, c.t / C4_FUSE * 0.8);
      if (c.beep <= 0) { c.beep = interval; this.audio.beep(); }
      c.mesh.userData.light.visible = c.beep > interval * 0.5;
      if (c.t <= 0) {
        this.scene.remove(c.mesh);
        this.charges.splice(k, 1);
        this.detonate(c.x, c.z, 6, 420, 4200, 9);
      }
    }
  }

  detonate(x, z, r, dmg, structDmg, visualR = r) {
    this.send({ t: 'explode', x, z, r, dmg, structDmg });
    this.fx.explosion(x, z, visualR, this.camera ? this.camera.position : null);
    const d = this.camera ? Math.hypot(this.camera.position.x - x, this.camera.position.z - z) : 0;
    this.audio.explosion(d);
    // Splash damage to ourselves if careless
    const pd = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (pd < r * 1.3 && !this.inVehicle) this.hurt(dmg * 0.3 * (1 - pd / (r * 1.3)), 0, 'blast');
  }

  // srcX/srcZ: where the attack came from (used for blocking)
  hurt(dmg, time, kind, srcX, srcZ) {
    if (!this.alive) return;
    if (this.inVehicle) {
      this.suv.hp -= dmg * (kind === 'arrow' ? 0.1 : 1);
      if (this.suv.hp <= 0 && this.suv.alive) {
        this.suv.alive = false;
        this.inVehicle = false;
        this.detonate(this.suv.pos.x, this.suv.pos.z, 6, 120);
        this.suv.model.traverse((m) => { if (m.material) m.material = new THREE.MeshLambertMaterial({ color: 0x181614 }); });
        this.onMessage?.('The SUV has been destroyed!', true);
      }
      return;
    }
    // Blocking with the sword stops blows and arrows from the front
    if (this.blocking && srcX !== undefined && (kind === 'melee' || kind === 'arrow')) {
      const ang = Math.atan2(srcX - this.pos.x, srcZ - this.pos.z);
      if (Math.abs(angleDiff(ang, this.model.rotation.y)) < 1.4) {
        this.audio.clang();
        const tip = this.model.userData.mid.getWorldPosition(this._o);
        for (let k = 0; k < 8; k++) this.fx.spawn(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 1, 0.85, 0.4, 0.08, 0.25, 9.8);
        if (kind === 'arrow') return;
        dmg *= 0.12;
      }
    }
    dmg *= this.damageTaken;
    this.hp -= dmg;
    this.lastHurt = time;
    this.audio.hurt();
    this.onRumble?.(0.5, 0.2, 180);
    if (this.hp <= 0) {
      this.alive = false;
      this.respawnT = 8;
      this.swing = null; this.charging = false; this.blocking = false;
      this.model.rotation.x = -Math.PI / 2;
      this.onMessage?.('You are down! Medevac in 8 seconds…', true);
    }
  }

  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.pos.copy(SPAWN);
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.model.rotation.x = 0;
    this.ammo.forEach((a, k) => { a.reserve = Math.max(a.reserve, WEAPONS[k].reserve / 2); });
    this.c4 = Math.max(this.c4, 1);
  }

  // Data the simulation needs about us each frame
  simState() {
    return { x: this.pos.x, z: this.pos.z, alive: this.alive, vehicle: this.inVehicle, team: TEAM_REBEL };
  }
}

// March along a ray until it goes under the terrain or into a wall. Returns the distance (or max).
export function marchTerrain(o, d, max) {
  let t = 0, step = 0.75;
  let prevT = 0;
  const solid = (x, y, z) => {
    const g = groundY(x, z);
    return y < g || y < g + structTop(x, z);
  };
  while (t < max) {
    if (solid(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) {
      // refine
      let lo = prevT, hi = t;
      for (let k = 0; k < 6; k++) {
        const m = (lo + hi) / 2;
        if (solid(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m)) hi = m; else lo = m;
      }
      return hi;
    }
    prevT = t;
    t += step;
    step = Math.min(2, step * 1.04);
  }
  return max;
}
