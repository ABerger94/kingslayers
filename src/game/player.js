// The time-travelling operative: third-person movement, camera, modern weapons and the armoured SUV.
import * as THREE from 'three';
import { groundY } from './world.js';
import { inRiver, inWoods } from '../shared/terrain.js';
import { HALF_WORLD, TEAM_REBEL } from '../shared/constants.js';

const UP = new THREE.Vector3(0, 1, 0);
const SPAWN = new THREE.Vector3(24, 0, -158);

export const WEAPONS = [
  { name: 'Assault Rifle', short: 'AR', magSize: 30, reserve: 300, rpm: 700, auto: true, reload: 1.8, dmg: 70, pellets: 1, spread: 0.008, aimSpread: 0.002, range: 400 },
  { name: 'Combat Shotgun', short: 'SG', magSize: 8, reserve: 64, rpm: 75, auto: false, reload: 2.6, dmg: 32, pellets: 10, spread: 0.06, aimSpread: 0.045, range: 60 },
  { name: 'Grenade Launcher', short: 'GL', magSize: 6, reserve: 30, rpm: 80, auto: false, reload: 3.0, projectile: true, radius: 7, blast: 280 },
];

function buildOperative() {
  const g = new THREE.Group();
  const camo = new THREE.MeshLambertMaterial({ color: 0x3b4233 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e1c });
  const tan = new THREE.MeshLambertMaterial({ color: 0x6e6449 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const legL = add(new THREE.BoxGeometry(0.2, 0.85, 0.22).translate(0, -0.42, 0), camo, -0.13, 0.88, 0);
  const legR = add(new THREE.BoxGeometry(0.2, 0.85, 0.22).translate(0, -0.42, 0), camo, 0.13, 0.88, 0);
  add(new THREE.BoxGeometry(0.55, 0.7, 0.34), tan, 0, 1.25, 0); // plate carrier
  add(new THREE.BoxGeometry(0.5, 0.35, 0.3), camo, 0, 0.95, 0);
  add(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc89878 }), 0, 1.72, 0);
  add(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), dark, 0, 1.76, 0); // helmet
  add(new THREE.BoxGeometry(0.22, 0.06, 0.08), dark, 0, 1.78, 0.14); // NVG mount
  add(new THREE.BoxGeometry(0.14, 0.55, 0.14), camo, -0.36, 1.22, 0.12).rotation.x = -0.9;
  add(new THREE.BoxGeometry(0.14, 0.55, 0.14), camo, 0.36, 1.22, 0.12).rotation.x = -1.2;
  const gun = add(new THREE.BoxGeometry(0.08, 0.14, 0.85), dark, 0.18, 1.35, 0.45);
  add(new THREE.BoxGeometry(0.2, 0.3, 0.25), tan, 0, 1.25, -0.28); // pack
  g.userData = { legL, legR, gun };
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
  // roof turret ring + light bar for flavour
  add(new THREE.BoxGeometry(1.4, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffcc }), 0, 2.16, 0.6);
  g.userData.wheels = wheels;
  return g;
}

export class Player {
  constructor(scene, fx, audio, send) {
    this.scene = scene; this.fx = fx; this.audio = audio; this.send = send;
    this.model = buildOperative();
    scene.add(this.model);
    this.pos = SPAWN.clone();
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.yaw = 0; // facing +z (toward the royal army)
    this.pitch = -0.05;
    this.hp = 250; this.maxHp = 250;
    this.alive = true; this.respawnT = 0;
    this.lastHurt = -99;
    this.weapon = 0;
    this.ammo = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.reserve }));
    this.fireCd = 0; this.reloading = 0;
    this.aiming = false;
    this.grenades = [];
    this.walkPhase = 0;
    this.hits = []; // pending damage to send to the sim
    this.kills = 0;
    this.camera = null;
    this.aimPoint = new THREE.Vector3();
    this.camShake = 0;
    // SUV
    this.suv = { model: buildSUV(), pos: new THREE.Vector3(32, 0, -168), heading: 0, speed: 0, hp: 1500, alive: true };
    this.suv.pos.y = groundY(this.suv.pos.x, this.suv.pos.z);
    scene.add(this.suv.model);
    this.inVehicle = false;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._o = new THREE.Vector3();
  }

  get w() { return WEAPONS[this.weapon]; }

  // ------------------------------------------------------------------ per-frame
  update(dt, input, army, camera, time, active) {
    this.camera = camera;
    this.fireCd -= dt;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      this.updateCamera(camera, dt);
      return;
    }
    if (time - this.lastHurt > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 18 * dt);

    if (active) {
      const sens = this.aiming ? 0.0012 : 0.0024;
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens;
      this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch));
      if (input.hit('KeyF')) this.toggleVehicle();
    }

    if (this.inVehicle) this.driveSUV(dt, input, army, active);
    else this.walk(dt, input, active);
    this.updateCamera(camera, dt);
    this.computeAim(army);
    if (active && !this.inVehicle) this.handleWeapons(dt, input, army, time);
    else this.aiming = false;
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

  walk(dt, input, active) {
    const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = this._d.set(-f.z, 0, f.x);
    let mx = 0, mz = 0;
    if (active) {
      if (input.down('KeyW')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyA')) { mx += r.x * -1; mz += r.z * -1; }
      if (input.down('KeyD')) { mx += r.x; mz += r.z; }
    }
    const l = Math.hypot(mx, mz);
    const sprint = active && input.down('ShiftLeft') && !this.aiming;
    const speed = this.aiming ? 3.2 : sprint ? 9 : 5.5;
    if (l > 0) {
      const nx = this.pos.x + mx / l * speed * dt, nz = this.pos.z + mz / l * speed * dt;
      const lim = HALF_WORLD - 6;
      if (!inRiver(nx, nz) && Math.abs(nx) < lim && Math.abs(nz) < lim) { this.pos.x = nx; this.pos.z = nz; }
      this.walkPhase += dt * speed * 1.6;
    } else this.walkPhase *= 0.9;
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.model.position.copy(this.pos);
    // Body faces the camera direction when aiming/firing, otherwise the move direction
    const face = l > 0 && !this.aiming && !input.mouse.left ? Math.atan2(mx, mz) : this.yaw;
    let d = face - this.model.rotation.y;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.model.rotation.y += d * Math.min(1, dt * 12);
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
    }
    const maxF = 26, maxR = -8;
    if (throttle > 0) suv.speed += (suv.speed < 0 ? 30 : 11) * dt;
    else if (throttle < 0) suv.speed -= (suv.speed > 0 ? 30 : 8) * dt;
    else suv.speed *= Math.exp(-dt * 0.8);
    suv.speed = Math.max(maxR, Math.min(maxF, suv.speed));
    suv.heading += steer * dt * Math.min(1, Math.abs(suv.speed) / 6) * 1.4 * Math.sign(suv.speed || 1);
    const nx = suv.pos.x + Math.sin(suv.heading) * suv.speed * dt;
    const nz = suv.pos.z + Math.cos(suv.heading) * suv.speed * dt;
    const lim = HALF_WORLD - 6;
    if (inRiver(nx, nz) || inWoods(nx, nz) || Math.abs(nx) > lim || Math.abs(nz) > lim) suv.speed *= -0.3;
    else { suv.pos.x = nx; suv.pos.z = nz; }
    suv.pos.y = groundY(suv.pos.x, suv.pos.z);
    // Pitch/roll to terrain
    const fx = Math.sin(suv.heading), fz = Math.cos(suv.heading);
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
      for (const i of army.nearby(cx, cz, 2.6, 1)) {
        this.hits.push(i, 60 * Math.abs(suv.speed));
        this.fx.blood(army.px[i], army.py[i] + 1, army.pz[i], 12);
        suv.speed *= army.typeOf[i] === 3 ? 0.75 : 0.95;
      }
      if (Math.random() < dt * 10) this.fx.dirt(suv.pos.x - fx * 2.4, suv.pos.y + 0.3, suv.pos.z - fz * 2.4, 2);
    }
    if (active && input.down('Space')) suv.speed *= Math.exp(-dt * 4); // handbrake
  }

  updateCamera(camera, dt) {
    const target = this._o.copy(this.inVehicle ? this.suv.pos : this.pos);
    let dist, side, height;
    if (this.inVehicle) { dist = 10; side = 0; height = 3.5; }
    else if (this.aiming) { dist = 1.9; side = 0.75; height = 1.6; }
    else { dist = 4.2; side = 0.9; height = 1.65; }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = this._v.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    const right = this._d.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const want = new THREE.Vector3(target.x, target.y + height, target.z)
      .addScaledVector(fwd, -dist)
      .addScaledVector(right, side);
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
    const t = hit ? hit.t : tTerrain;
    this.aimPoint.copy(o).addScaledVector(dir, t);
    this.aimDir = dir;
  }

  muzzlePos() {
    const m = this.model;
    const p = new THREE.Vector3(0.18, 1.38, 0.9).applyAxisAngle(UP, m.rotation.y).add(this.pos);
    return p;
  }

  handleWeapons(dt, input, army, time) {
    this.aiming = input.mouse.right;
    if (input.hit('Digit1')) this.switchWeapon(0);
    if (input.hit('Digit2')) this.switchWeapon(1);
    if (input.hit('Digit3')) this.switchWeapon(2);
    if (input.mouse.wheel) this.switchWeapon((this.weapon + (input.mouse.wheel > 0 ? 1 : 2)) % 3);
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
    this.weapon = i;
    this.reloading = 0;
    this.fireCd = 0.35;
    this.audio.reload();
  }

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
      return;
    }
    w.pellets > 1 ? this.audio.shotgun() : this.audio.rifle();
    this.fx.muzzle(muzzle, base, w.pellets > 1);
    this.camShake = w.pellets > 1 ? 0.6 : 0.15;
    // Recoil
    this.pitch += w.pellets > 1 ? 0.05 : 0.006;
    this.yaw += (Math.random() - 0.5) * 0.004;
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
      let boom = g.p.y <= groundY(g.p.x, g.p.z) + 0.1 || g.t > 8;
      if (!boom && g.t > 0.15) {
        const near = army.nearby(g.p.x, g.p.z, 1.0, 1);
        if (near.length && g.p.y < army.py[near[0]] + 2) boom = true;
      }
      if (boom) {
        this.grenades.splice(k, 1);
        this.detonate(g.p.x, g.p.z, WEAPONS[2].radius, WEAPONS[2].blast);
      }
    }
  }

  detonate(x, z, r, dmg) {
    this.send({ t: 'explode', x, z, r, dmg });
    this.fx.explosion(x, z, r, this.camera ? this.camera.position : null);
    const d = this.camera ? Math.hypot(this.camera.position.x - x, this.camera.position.z - z) : 0;
    this.audio.explosion(d);
    // Splash damage to ourselves if careless
    const pd = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (pd < r && !this.inVehicle) this.hurt(dmg * 0.25 * (1 - pd / r), 0);
  }

  hurt(dmg, time, kind) {
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
    this.hp -= dmg;
    this.lastHurt = time;
    this.audio.hurt();
    if (this.hp <= 0) {
      this.alive = false;
      this.respawnT = 8;
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
  }

  // Data the simulation needs about us each frame
  simState() {
    return { x: this.pos.x, z: this.pos.z, alive: this.alive, vehicle: this.inVehicle, team: TEAM_REBEL };
  }
}

// March along a ray until it goes under the terrain. Returns the distance (or max).
export function marchTerrain(o, d, max) {
  let t = 0, step = 1.0;
  let prevT = 0;
  while (t < max) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < groundY(x, z)) {
      // refine
      let lo = prevT, hi = t;
      for (let k = 0; k < 6; k++) {
        const m = (lo + hi) / 2;
        if (o.y + d.y * m < groundY(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
      }
      return hi;
    }
    prevT = t;
    t += step;
    step = Math.min(4, step * 1.05);
  }
  return max;
}
