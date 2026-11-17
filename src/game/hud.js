// DOM heads-up display: battle status, player status, support cooldowns, message feed, minimap,
// and the command-mode regiment roster.
import { WEAPONS } from './player.js';
import { SUPPORT } from './support.js';
import { HALF_WORLD, WORLD_SIZE, SNAP_STRIDE, TEAM_REBEL, ST_DEAD, ST_ROUT, TYPE_NAMES, ORDER_NAMES } from '../shared/constants.js';
import { WOODS } from '../shared/terrain.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), rebelBar: $('rebelBar'), crownBar: $('crownBar'), rebelCount: $('rebelCount'), crownCount: $('crownCount'),
      clock: $('clock'), heroes: $('heroes'), feed: $('feed'), banner: $('banner'), hpBar: $('hpBar'),
      weaponName: $('weaponName'), ammo: $('ammo'), weaponSlots: $('weaponSlots'), abilities: $('abilities'),
      minimap: $('minimap'), modeTag: $('modeTag'), rtsPanel: $('rtsPanel'), regList: $('regList'), selInfo: $('selInfo'),
      orderButtons: $('orderButtons'), supplies: $('supplies'), selbox: $('selbox'), pauseTag: $('pauseTag'),
      vignette: $('vignette'), hitmarker: $('hitmarker'), crosshair: $('crosshair'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.el.weaponSlots.innerHTML = WEAPONS.map((w, k) => `<span data-w="${k}">${k + 1} ${w.short}</span>`).join('');
    this.el.abilities.innerHTML = Object.entries(SUPPORT).map(([k, s]) =>
      `<div class="ability" data-a="${k}"><b>${s.name}</b><kbd>${s.key}</kbd> <span class="t"></span><div class="cd"></div></div>`).join('') +
      `<div class="ability" data-a="suv"><b>Armoured SUV</b><kbd>F</kbd> <span class="t"></span></div>`;
    this.regRows = new Map();
    this.mmTimer = 0;
    this.bannerTimer = null;
  }

  // UI regions that should swallow clicks in command mode
  isOverUi(x, y) {
    for (const id of ['rtsPanel', 'minimap', 'playerPanel', 'abilities', 'topbar']) {
      const r = $(id).getBoundingClientRect();
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  message(text, bad = false) {
    const d = document.createElement('div');
    d.textContent = text;
    if (bad) d.className = 'bad';
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }

  bigBanner(text, ms = 3500) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('on'), ms);
  }

  hitmarker() {
    const h = this.el.hitmarker;
    h.classList.add('on');
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => h.classList.remove('on'), 60);
  }

  setSelInfo(html) { this.el.selInfo.innerHTML = html; }
  highlightCommand(mode) {
    for (const b of this.el.orderButtons.children) b.classList.toggle('on', b.dataset.cmd === mode);
  }

  setMode(rts) {
    this.el.modeTag.innerHTML = rts ? 'COMMAND — <kbd>Tab</kbd> back to the field' : 'FIELD — <kbd>Tab</kbd> command view';
    this.el.crosshair.style.display = rts ? 'none' : '';
  }

  update({ time, strength, regiments, heroes, player, support, supplies, rtsActive, rts, counts }) {
    const e = this.el;
    const mm = Math.floor(time / 60), ss = Math.floor(time % 60);
    e.clock.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    if (strength) {
      e.rebelBar.style.width = `${Math.max(0, strength[0]) * 100}%`;
      e.crownBar.style.width = `${Math.max(0, strength[1]) * 100}%`;
    }
    if (counts) { e.rebelCount.textContent = counts[0]; e.crownCount.textContent = counts[1]; }
    // Heroes
    if (heroes) {
      const html = heroes.map((h) => `<div class="hero ${h.team === TEAM_REBEL ? 'r' : 'c'} ${h.hp <= 0 ? 'dead' : ''}"><b>${h.name}</b><div class="bar"><i style="width:${Math.max(0, h.hp) * 100}%"></i></div></div>`).join('');
      if (html !== this.lastHeroes) { e.heroes.innerHTML = html; this.lastHeroes = html; }
    }
    // Player
    e.hpBar.style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
    e.vignette.style.opacity = player.alive ? Math.max(0, 0.8 - player.hp / player.maxHp) : 0.9;
    if (player.inVehicle) {
      e.weaponName.textContent = 'Armoured SUV';
      e.ammo.textContent = `${Math.max(0, Math.round(player.suv.hp / 15))}%`;
    } else {
      const a = player.ammo[player.weapon];
      e.weaponName.textContent = player.w.name + (player.reloading > 0 ? ' — reloading' : '');
      e.ammo.textContent = `${a.mag} / ${a.reserve}`;
    }
    for (const s of e.weaponSlots.children) s.classList.toggle('on', +s.dataset.w === player.weapon);
    for (const a of e.abilities.children) {
      const k = a.dataset.a;
      if (k === 'suv') {
        a.querySelector('.t').textContent = !player.suv.alive ? 'wrecked' : player.inVehicle ? 'driving' : player.pos.distanceTo(player.suv.pos) < 5 ? 'enter' : '';
        a.classList.toggle('ready', player.suv.alive);
        continue;
      }
      const cd = support.cd[k], max = SUPPORT[k].cooldown;
      a.querySelector('.cd').style.width = `${(1 - cd / max) * 100}%`;
      a.querySelector('.t').textContent = cd > 0 ? `${Math.ceil(cd)}s` : 'ready';
      a.classList.toggle('ready', cd <= 0);
    }
    e.supplies.innerHTML = `Supplies: <b>${Math.floor(supplies)}</b> (palisade costs 1.5 / m)`;
    if (rtsActive && regiments) this.updateRoster(regiments, rts);
  }

  updateRoster(regiments, rts) {
    const list = this.el.regList;
    for (const r of regiments) {
      if (r.team !== TEAM_REBEL) continue;
      let row = this.regRows.get(r.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'reg';
        row.innerHTML = `<span class="name"></span><span class="meta"></span><div class="bar"><i></i></div>`;
        row.addEventListener('mousedown', (ev) => { ev.stopPropagation(); rts.toggleSelect(r.id, ev.shiftKey); });
        list.appendChild(row);
        this.regRows.set(r.id, row);
      }
      row.querySelector('.name').textContent = r.name;
      row.querySelector('.meta').textContent = `${r.alive} · ${r.routing ? 'routing' : ORDER_NAMES[r.order]}${r.auto ? ' · AI' : ''}`;
      row.querySelector('.bar i').style.width = `${r.initial ? r.alive / r.initial * 100 : 0}%`;
      row.classList.toggle('sel', rts.selected.has(r.id));
      row.classList.toggle('routing', r.routing > r.alive / 2);
      row.classList.toggle('gone', r.alive === 0);
      row.title = TYPE_NAMES[r.type];
    }
    this.setSelInfo(rts.mode ? this.el.selInfo.innerHTML : rts.selectedSummary());
  }

  drawMinimap(snap, player, cam, regiments, dt) {
    this.mmTimer -= dt;
    if (this.mmTimer > 0 || !snap) return;
    this.mmTimer = 0.1;
    const g = this.mm, S = 200, k = S / WORLD_SIZE;
    const tx = (x) => (x + HALF_WORLD) * k, tz = (z) => (z + HALF_WORLD) * k;
    g.fillStyle = '#34452a';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#5c6f3a';
    g.fillRect(tx(-120), tz(-30), 240 * k, 90 * k);
    g.fillStyle = '#1f3320';
    for (const w of WOODS) { g.beginPath(); g.arc(tx(w.x), tz(w.z), w.r * k, 0, 7); g.fill(); }
    g.strokeStyle = '#3d6a7d'; g.lineWidth = 32 * k; g.beginPath();
    for (let x = -HALF_WORLD; x <= HALF_WORLD; x += 10) {
      const z = -250 + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.031 + 1.3) * 5;
      if (x === -HALF_WORLD) g.moveTo(tx(x), tz(z)); else g.lineTo(tx(x), tz(z));
    }
    g.stroke();
    const n = snap.length / SNAP_STRIDE;
    const cols = ['#f0c040', '#e0404a'];
    for (let i = 0; i < n; i++) {
      const o = i * SNAP_STRIDE;
      const p = snap[o + 3];
      const st = (p >> 4) & 7;
      if (st === ST_DEAD) continue;
      g.fillStyle = st === ST_ROUT ? '#b08060' : cols[(p >> 3) & 1];
      g.fillRect(tx(snap[o]) - 0.6, tz(snap[o + 1]) - 0.6, 1.3, 1.3);
    }
    // player
    g.fillStyle = '#7fe7ff';
    g.beginPath(); g.arc(tx(player.pos.x), tz(player.pos.z), 3.2, 0, 7); g.fill();
    // camera direction
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx(cam.x), tz(cam.z)); g.lineTo(tx(cam.x + cam.dx * 40), tz(cam.z + cam.dz * 40)); g.stroke();
    void regiments;
  }
}
