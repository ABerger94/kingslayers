// Command mode: an overhead camera for directing regiments, building fortifications and calling support.
import * as THREE from 'three';
import { groundY } from './world.js';
import { marchTerrain } from './player.js';
import { TEAM_REBEL, TEAM_CROWN, TYPE_NAMES, ORDER_NAMES, ORDER_HOLD, ORDER_MOVE, ORDER_ATTACK_MOVE, ORDER_ATTACK, ORDER_RETREAT, HALF_WORLD, PALISADE_COST_PER_M } from '../shared/constants.js';
import { TEAM_COLORS } from './army.js';

function makeFlagTexture(color) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 40);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 30, 64, 10);
  return new THREE.CanvasTexture(c);
}

export class Rts {
  constructor(scene, camera, input, send, ui) {
    this.scene = scene; this.camera = camera; this.input = input; this.send = send; this.ui = ui;
    this.active = false;
    this.focus = new THREE.Vector3(0, 0, -40);
    this.height = 150;
    this.yaw = 0;
    this.selected = new Set();
    this.regiments = [];
    this.banners = new Map();
    this.dragStart = null;
    this.mode = null; // 'advance' | 'build'
    this.buildStart = null;
    this.paused = false;
    this.raycaster = new THREE.Raycaster();
    this.flagTex = [makeFlagTexture('#e0b341'), makeFlagTexture('#c8323c')];
    this.ringGeo = new THREE.RingGeometry(1, 1.25, 32).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.7, depthWrite: false });
    this.orderLineMat = new THREE.LineBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.6 });
    // build preview
    this.preview = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: 0.4 }));
    this.preview.visible = false;
    scene.add(this.preview);
    // order markers
    this.markers = [];
  }

  enter(fromPos) {
    this.active = true;
    this.focus.set(fromPos.x, 0, fromPos.z - 20);
    this.input.unlock();
    this.ui.rtsPanel.classList.remove('hidden');
  }

  exit() {
    this.active = false;
    this.mode = null;
    this.buildStart = null;
    this.preview.visible = false;
    this.ui.rtsPanel.classList.add('hidden');
    this.ui.selbox.style.display = 'none';
    this.setPaused(false);
  }

  setPaused(v) {
    this.paused = v;
    this.send({ t: 'pause', v });
    this.ui.pauseTag.classList.toggle('hidden', !v);
  }

  setRegiments(list) {
    this.regiments = list;
    for (const r of list) {
      if (!this.banners.has(r.id)) this.createBanner(r);
    }
  }

  createBanner(r) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 5).translate(0, 3.5, 0), new THREE.MeshLambertMaterial({ color: 0x5a3e22 }));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6).translate(1.3, 6.1, 0), new THREE.MeshLambertMaterial({ map: this.flagTex[r.team], side: THREE.DoubleSide }));
    g.add(pole, flag);
    // big floating marker readable from the command camera
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTexture(r), depthTest: false, transparent: true }));
    sprite.scale.set(16, 4, 1);
    sprite.position.y = 12;
    sprite.visible = false;
    g.add(sprite);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.visible = false;
    this.scene.add(ring);
    this.scene.add(g);
    this.banners.set(r.id, { g, flag, sprite, ring, labelKey: '' });
  }

  labelTexture(r) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = r.team === TEAM_REBEL ? 'rgba(60,45,10,0.85)' : 'rgba(70,10,15,0.85)';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = r.team === TEAM_REBEL ? '#e0b341' : '#c8323c';
    g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#f2ead8';
    g.font = 'bold 22px sans-serif';
    g.fillText(r.name.slice(0, 22), 10, 27);
    g.font = '18px sans-serif';
    const frac = r.initial ? r.alive / r.initial : 0;
    g.fillText(`${r.alive} men · ${r.routing ? 'ROUTING' : ORDER_NAMES[r.order]}`, 10, 52);
    g.fillStyle = r.team === TEAM_REBEL ? '#e0b341' : '#c8323c';
    g.fillRect(200, 40, 46 * frac, 12);
    return new THREE.CanvasTexture(c);
  }

  updateBanners(time) {
    for (const r of this.regiments) {
      const b = this.banners.get(r.id);
      if (!b) continue;
      const present = r.alive - r.routing > 0;
      b.g.visible = present;
      b.ring.visible = present && this.selected.has(r.id) && this.active;
      if (!present) continue;
      const x = r.cx, z = r.cz;
      b.g.position.set(x, groundY(x, z), z);
      b.flag.rotation.y = Math.sin(time * 2 + r.id) * 0.3 + r.facing;
      b.sprite.visible = this.active;
      if (this.active) {
        const s = Math.max(0.6, this.height / 150);
        b.sprite.scale.set(16 * s, 4 * s, 1);
        b.sprite.position.y = 10 + 6 * s;
        const key = `${r.alive}|${r.routing}|${r.order}`;
        if (key !== b.labelKey) {
          b.labelKey = key;
          b.sprite.material.map.dispose();
          b.sprite.material.map = this.labelTexture(r);
        }
      }
      if (b.ring.visible) {
        const rad = Math.max(8, Math.sqrt(r.alive) * 1.6);
        b.ring.scale.setScalar(rad);
        b.ring.position.set(x, groundY(x, z) + 0.3, z);
      }
    }
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, realDt, armyRenderer, support) {
    const input = this.input;
    // Camera pan / zoom / rotate
    const pan = (this.height * 0.9 + 30) * realDt;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    if (input.down('KeyW') || input.down('ArrowUp')) this.focus.addScaledVector(f, pan);
    if (input.down('KeyS') || input.down('ArrowDown')) this.focus.addScaledVector(f, -pan);
    if (input.down('KeyA') && !this.selected.size || input.down('ArrowLeft')) this.focus.addScaledVector(r, -pan);
    if (input.down('KeyD') || input.down('ArrowRight')) this.focus.addScaledVector(r, pan);
    if (input.down('KeyQ')) this.yaw += realDt * 1.2;
    if (input.down('KeyE')) this.yaw -= realDt * 1.2;
    // Edge scrolling
    const m = input.mouse, W = innerWidth, H = innerHeight;
    if (m.y < 6) this.focus.addScaledVector(f, pan);
    if (m.y > H - 6) this.focus.addScaledVector(f, -pan);
    if (m.x < 6) this.focus.addScaledVector(r, -pan);
    if (m.x > W - 6) this.focus.addScaledVector(r, pan);
    this.height = Math.max(35, Math.min(330, this.height * (1 + input.mouse.wheel * 0.12)));
    this.focus.x = Math.max(-HALF_WORLD, Math.min(HALF_WORLD, this.focus.x));
    this.focus.z = Math.max(-HALF_WORLD, Math.min(HALF_WORLD, this.focus.z));
    const cam = this.camera;
    const want = new THREE.Vector3(this.focus.x, groundY(this.focus.x, this.focus.z) + this.height, this.focus.z).addScaledVector(f, -this.height * 0.75);
    cam.position.lerp(want, Math.min(1, realDt * 6));
    cam.lookAt(this.focus.x, groundY(this.focus.x, this.focus.z), this.focus.z);
    if (Math.abs(cam.fov - 55) > 0.1) { cam.fov += (55 - cam.fov) * Math.min(1, realDt * 8); cam.updateProjectionMatrix(); }

    // Hotkeys
    if (input.hit('Space')) this.setPaused(!this.paused);
    if (input.hit('KeyH')) this.command('hold');
    if (input.hit('KeyA') && this.selected.size) this.command('advance');
    if (input.hit('KeyR')) this.command('retreat');
    if (input.hit('KeyG')) this.command('auto');
    if (input.hit('KeyB')) this.command('build');
    if (input.hit('Escape')) { this.mode = null; this.buildStart = null; this.preview.visible = false; }
    if (input.hit('KeyZ')) { const g = this.groundUnderMouse(); if (g) support.callAirstrike(g); }
    if (input.hit('KeyX')) { const g = this.groundUnderMouse(); if (g) support.callGunship(g); }
    if ((input.down('ControlLeft') || input.down('MetaLeft')) && input.hit('KeyA')) this.selectAll();

    const overUi = this.ui.isOverUi(m.x, m.y);
    // Building
    if (this.mode === 'build') {
      const gp = this.groundUnderMouse();
      if (gp && this.buildStart) {
        const mid = gp.clone().add(this.buildStart).multiplyScalar(0.5);
        const len = gp.distanceTo(this.buildStart);
        this.preview.visible = true;
        this.preview.position.set(mid.x, groundY(mid.x, mid.z) + 1.5, mid.z);
        this.preview.scale.set(1, 1, Math.max(1, len));
        this.preview.rotation.y = Math.atan2(gp.x - this.buildStart.x, gp.z - this.buildStart.z);
        this.ui.setSelInfo(`Palisade: ${len.toFixed(0)} m — cost ${Math.ceil(len * PALISADE_COST_PER_M)} supplies. Click to place, Esc to cancel.`);
      }
      if (m.leftClicked && gp && !overUi) {
        if (!this.buildStart) this.buildStart = gp;
        else {
          this.send({ t: 'palisade', x0: this.buildStart.x, z0: this.buildStart.z, x1: gp.x, z1: gp.z });
          this.buildStart = null; this.preview.visible = false;
          this.mode = null;
        }
      }
      if (m.rightClicked) { this.mode = null; this.buildStart = null; this.preview.visible = false; }
      this.ui.highlightCommand(this.mode);
      return;
    }

    // Selection: click / drag box
    if (m.leftClicked && !overUi) this.dragStart = { x: m.x, y: m.y };
    if (this.dragStart && m.left) {
      const x0 = Math.min(this.dragStart.x, m.x), y0 = Math.min(this.dragStart.y, m.y);
      const w = Math.abs(m.x - this.dragStart.x), h = Math.abs(m.y - this.dragStart.y);
      if (w + h > 6) Object.assign(this.ui.selbox.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
    }
    if (this.dragStart && m.leftReleased) {
      const additive = input.down('ShiftLeft');
      const w = Math.abs(m.x - this.dragStart.x), h = Math.abs(m.y - this.dragStart.y);
      if (!additive) this.selected.clear();
      if (w + h > 6) this.boxSelect(this.dragStart, m);
      else {
        const id = this.regimentUnderMouse(armyRenderer, TEAM_REBEL);
        if (id >= 0) this.selected.add(id);
      }
      this.dragStart = null;
      this.ui.selbox.style.display = 'none';
      if (this.mode === 'advance') this.mode = null;
    }
    // Orders
    if (m.rightClicked && this.selected.size && !overUi) {
      const enemy = this.regimentUnderMouse(armyRenderer, TEAM_CROWN);
      if (enemy >= 0) {
        this.send({ t: 'order', regs: [...this.selected], order: { type: ORDER_ATTACK, target: enemy } });
        const er = this.regiments.find((r) => r.id === enemy);
        if (er) this.addMarker(er.cx, er.cz, 0xff5050);
      } else {
        const gp = this.groundUnderMouse();
        if (gp) this.moveSelected(gp, this.mode === 'advance' || input.down('ControlLeft') ? ORDER_ATTACK_MOVE : ORDER_MOVE);
      }
      this.mode = null;
    }
    this.ui.highlightCommand(this.mode);
    this.updateMarkers(realDt);
  }

  // Spread selected regiments side by side around the clicked point, facing away from our lines
  moveSelected(gp, type) {
    const regs = this.regiments.filter((r) => this.selected.has(r.id) && r.alive > 0);
    if (!regs.length) return;
    let cx = 0, cz = 0;
    for (const r of regs) { cx += r.cx; cz += r.cz; }
    cx /= regs.length; cz /= regs.length;
    const facing = Math.atan2(gp.x - cx, gp.z - cz);
    const rx = Math.cos(facing), rz = -Math.sin(facing);
    // order regiments left-to-right relative to the facing so they don't cross over
    regs.sort((a, b) => (a.cx * rx + a.cz * rz) - (b.cx * rx + b.cz * rz));
    const widths = regs.map((r) => Math.max(12, Math.sqrt(r.alive * 2.5) * 1.8));
    const total = widths.reduce((a, b) => a + b, 0) + (regs.length - 1) * 6;
    let off = -total / 2;
    regs.forEach((r, k) => {
      const lat = off + widths[k] / 2;
      off += widths[k] + 6;
      const x = gp.x + rx * lat, z = gp.z + rz * lat;
      this.send({ t: 'order', regs: [r.id], order: { type, x, z, facing } });
      this.addMarker(x, z, type === ORDER_ATTACK_MOVE ? 0xffa040 : 0x80ff80);
    });
  }

  command(cmd) {
    const regs = [...this.selected];
    if (cmd === 'build') { this.mode = this.mode === 'build' ? null : 'build'; this.buildStart = null; return; }
    if (cmd === 'advance') { this.mode = 'advance'; this.ui.setSelInfo('Right-click where to advance (soldiers will engage anything on the way).'); return; }
    if (!regs.length) return;
    if (cmd === 'hold') this.send({ t: 'order', regs, order: { type: ORDER_HOLD } });
    if (cmd === 'auto') this.send({ t: 'auto', regs });
    if (cmd === 'retreat') {
      for (const id of regs) {
        const r = this.regiments.find((q) => q.id === id);
        if (r) this.send({ t: 'order', regs: [id], order: { type: ORDER_RETREAT, x: r.cx, z: Math.max(-190, r.cz - 60), facing: 0 } });
      }
    }
  }

  selectAll() {
    this.selected.clear();
    for (const r of this.regiments) if (r.team === TEAM_REBEL && r.alive > 0) this.selected.add(r.id);
  }

  toggleSelect(id, additive) {
    if (!additive) this.selected.clear();
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
  }

  mouseNdc() {
    return new THREE.Vector2((this.input.mouse.x / innerWidth) * 2 - 1, -(this.input.mouse.y / innerHeight) * 2 + 1);
  }

  groundUnderMouse() {
    this.raycaster.setFromCamera(this.mouseNdc(), this.camera);
    const { origin, direction } = this.raycaster.ray;
    const t = marchTerrain(origin, direction, 1200);
    if (t >= 1200) return null;
    return origin.clone().addScaledVector(direction, t);
  }

  regimentUnderMouse(army, team) {
    const gp = this.groundUnderMouse();
    if (!gp) return -1;
    // nearest soldier of that team to the ground point, then its regiment via banner proximity
    let best = Infinity, bestReg = -1;
    for (const r of this.regiments) {
      if (r.team !== team || r.alive - r.routing <= 0) continue;
      const rad = Math.max(10, Math.sqrt(r.alive) * 1.8);
      const d = Math.hypot(r.cx - gp.x, r.cz - gp.z);
      if (d < rad && d < best) { best = d; bestReg = r.id; }
    }
    return bestReg;
  }

  boxSelect(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const v = new THREE.Vector3();
    for (const r of this.regiments) {
      if (r.team !== TEAM_REBEL || r.alive <= 0) continue;
      v.set(r.cx, groundY(r.cx, r.cz), r.cz).project(this.camera);
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) this.selected.add(r.id);
    }
  }

  addMarker(x, z, color) {
    const mk = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mk.position.set(x, groundY(x, z) + 0.4, z);
    mk.scale.setScalar(6);
    this.scene.add(mk);
    this.markers.push({ mk, t: 0 });
  }

  updateMarkers(dt) {
    for (let k = this.markers.length - 1; k >= 0; k--) {
      const m = this.markers[k];
      m.t += dt;
      m.mk.scale.setScalar(6 - m.t * 4);
      m.mk.material.opacity = 0.9 - m.t;
      if (m.t > 0.9) { this.scene.remove(m.mk); m.mk.material.dispose(); this.markers.splice(k, 1); }
    }
  }

  selectedSummary() {
    const regs = this.regiments.filter((r) => this.selected.has(r.id));
    if (!regs.length) return 'No regiments selected. Click a banner or drag a box around your troops.';
    if (regs.length === 1) {
      const r = regs[0];
      return `<b>${r.name}</b> — ${TYPE_NAMES[r.type]}<br>${r.alive}/${r.initial} men · morale ${(r.morale * 100).toFixed(0)}% · ${ORDER_NAMES[r.order]}${r.auto ? ' (AI)' : ''}`;
    }
    const men = regs.reduce((a, r) => a + r.alive, 0);
    return `<b>${regs.length} regiments</b> — ${men} men`;
  }
}

export { TEAM_COLORS };
