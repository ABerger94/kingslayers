// DOM heads-up display: battle status, player status, support cooldowns, message feed, minimap,
// and the command-mode regiment roster.

import { castleCells, cellX, cellZ, CELL_GATE, CELL_KEEP } from '../shared/castle.js';
import { structTop } from './structures.js';
import { SUPPORT } from './support.js';
import { controls } from './controls.js';
import { HALF_WORLD, WORLD_SIZE, SNAP_STRIDE, TEAM_REBEL, ST_DEAD, ST_ROUT, TYPE_NAMES, ORDER_NAMES } from '../shared/constants.js';
import { WOODS } from '../shared/terrain.js';
import { TRAITS, traitDesc } from '../shared/missions.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), rebelBar: $('rebelBar'), crownBar: $('crownBar'), rebelCount: $('rebelCount'), crownCount: $('crownCount'),
      clock: $('clock'), heroes: $('heroes'), feed: $('feed'), banner: $('banner'), hpBar: $('hpBar'),
      weaponName: $('weaponName'), ammo: $('ammo'), weaponSlots: $('weaponSlots'), abilities: $('abilities'),
      minimap: $('minimap'), modeTag: $('modeTag'), rtsPanel: $('rtsPanel'), regList: $('regList'), selInfo: $('selInfo'),
      orderButtons: $('orderButtons'), supplies: $('supplies'), selbox: $('selbox'), pauseTag: $('pauseTag'),
      vignette: $('vignette'), hitmarker: $('hitmarker'), crosshair: $('crosshair'), padCursor: $('padCursor'),
      objectives: $('objectives'), gearRow: $('gearRow'), streak: $('streak'), streakReward: $('streakReward'), hitTag: $('hitTag'),
      timeline: $('timeline'), timelineBar: $('timelineBar'), timelineVal: $('timelineVal'),
      interact: $('interact'), downed: $('downed'), downedText: $('downedText'), downedBar: $('downedBar'), lootTag: $('lootTag'),
    };
    this.mm = this.el.minimap.getContext('2d');

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

  // kind: 'hit' | 'head' | 'armor' (glanced off plate) | 'kill'
  hitmarker(kind = 'hit') {
    const h = this.el.hitmarker;
    if (this.hmKind === 'kill' && kind !== 'kill' && performance.now() < this.hmUntil) return; // let the kill marker show
    h.className = `on ${kind}`;
    this.hmKind = kind;
    const ms = kind === 'kill' ? 220 : kind === 'head' ? 140 : 60;
    this.hmUntil = performance.now() + ms;
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => { h.className = ''; this.hmKind = null; }, ms);
    if (kind === 'head' || kind === 'armor') {
      const t = this.el.hitTag;
      t.textContent = kind === 'head' ? 'HEADSHOT' : 'ARMOUR — need a bigger gun';
      t.className = `on ${kind}`;
      clearTimeout(this.htT);
      this.htT = setTimeout(() => { t.className = kind; }, kind === 'head' ? 500 : 700);
    }
  }

  streakReward(text) {
    const el = this.el.streakReward;
    el.textContent = text;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  setSelInfo(html) { this.el.selInfo.innerHTML = html; }
  highlightCommand(mode) {
    for (const b of this.el.orderButtons.children) b.classList.toggle('on', b.dataset.cmd === mode);
  }

  setMode(rts, pad = this.padMode) {
    this.rtsMode = rts;
    this.padMode = pad;
    const key = pad ? `<kbd>${controls.label(rts ? 'command' : 'field', rts ? 'field' : 'command')}</kbd>` : '<kbd>Tab</kbd>';
    this.el.modeTag.innerHTML = rts ? `COMMAND — ${key} back to the field` : `FIELD — ${key} command view`;
    this.el.crosshair.style.display = rts ? 'none' : '';
    document.body.classList.toggle('pad', !!pad);
  }

  // Show the controller cursor in command mode
  updatePadCursor(visible, x, y) {
    const c = this.el.padCursor;
    c.style.display = visible ? 'block' : 'none';
    if (visible) c.style.transform = `translate(${x}px, ${y}px)`;
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
      if (player.melee) {
        const move = player.blocking ? 'BLOCK' : player.charging && player.charge > 0.35 ? 'HEAVY READY' : player.swing ? player.swing.kind.toUpperCase() : `combo ${player.combo + 1}/3`;
        e.ammo.textContent = move;
      } else e.ammo.textContent = `${a.mag} / ${a.reserve}`;
    }
    for (const s of e.weaponSlots.children) s.classList.toggle('on', +s.dataset.w === player.weapon);
    const L = (id) => controls.label('field', id);
    const padKeys = { airstrike: L('airstrike'), gunship: L('gunship'), supply: L('supply'), suv: L('interact') };
    const c4Key = this.padMode ? L('c4') : 'G';
    const gear = `<span>C4 <kbd>${c4Key}</kbd> ${'■'.repeat(player.c4)}${'□'.repeat(Math.max(0, player.c4Max - player.c4))}</span>` +
      (player.resupplying ? '<span class="resupply">Resupplying from SUV</span>' : '');
    if (gear !== this.lastGear) { e.gearRow.innerHTML = gear; this.lastGear = gear; }
    for (const a of e.abilities.children) {
      const k = a.dataset.a;
      const kb = a.querySelector('kbd');
      const label = this.padMode ? padKeys[k] : (SUPPORT[k] ? SUPPORT[k].key : 'F');
      if (kb.textContent !== label) kb.textContent = label;
      if (k === 'suv') {
        a.querySelector('.t').textContent = !player.suv.alive ? 'wrecked' : player.inVehicle ? 'driving' : player.pos.distanceTo(player.suv.pos) < 5 ? 'enter' : '';
        a.classList.toggle('ready', player.suv.alive);
        continue;
      }
      const cd = support.cd[k], max = SUPPORT[k].cooldown, left = support.stock[k];
      a.querySelector('.cd').style.width = `${(1 - cd / max) * 100}%`;
      a.querySelector('.t').textContent = left <= 0 ? 'none' : cd > 0 ? `${Math.ceil(cd)}s` : left === Infinity ? 'ready' : `×${left}`;
      a.classList.toggle('ready', cd <= 0 && left > 0);
      a.classList.toggle('empty', left <= 0);
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
      row.querySelector('.meta').textContent = `${r.alive} · ${r.routing ? 'routing' : ORDER_NAMES[r.order]}${r.auto ? ` · AI${r.personality ? ` (${TRAITS[r.personality].name})` : ''}` : ''}`;
      row.querySelector('.bar i').style.width = `${r.initial ? r.alive / r.initial * 100 : 0}%`;
      row.classList.toggle('sel', rts.selected.has(r.id));
      row.classList.toggle('routing', r.routing > r.alive / 2);
      row.classList.toggle('gone', r.alive === 0);
      row.title = `${r.engineer ? 'Sappers' : r.handgun ? 'Handgonners' : TYPE_NAMES[r.type]}${r.lieutenant ? ` — led by ${r.lieutenant}` : ''}${r.personality ? `: ${traitDesc(r.personality, r.type)}` : ''}`;
    }
    this.setSelInfo(rts.mode ? this.el.selInfo.innerHTML : rts.selectedSummary());
  }

  setLoadout(loadout) {
    this.el.weaponSlots.innerHTML = loadout.map((w, k) => `<span data-w="${k}">${k + 1} ${w.short}</span>`).join('');
  }

  setSuvAvailable(on) {
    const el = this.el.abilities.querySelector('[data-a="suv"]');
    if (el) el.style.display = on ? '' : 'none';
  }

  // Timeline Instability meter (doc 4.7)
  updateTimeline(v) {
    const e = this.el;
    e.timelineBar.style.width = `${Math.min(100, v)}%`;
    e.timelineVal.textContent = `${v.toFixed(v < 10 ? 1 : 0)}%`;
    e.timeline.classList.toggle('high', v >= 50);
    e.timeline.classList.toggle('crit', v >= 80);
  }

  // Context prompts: capture a wounded officer; the downed / rescue overlay; loot collected
  updatePlayerState(player, loot, padMode) {
    const e = this.el;
    const cap = player.capturable >= 0;
    e.interact.classList.toggle('hidden', !cap);
    if (cap) e.interact.innerHTML = `<kbd>${padMode ? controls.label('field', 'interact') : 'E'}</kbd> Capture the wounded officer`;
    e.downed.classList.toggle('hidden', !player.downed);
    if (player.downed) {
      e.downedText.textContent = player.rescue > 0 ? 'Your bodyguard is dragging you out…' : `Bleeding out in ${Math.ceil(player.bleed)}s. Your bodyguard is coming.`;
      e.downedBar.style.width = `${Math.min(1, player.rescue / 2.5) * 100}%`;
    }
    e.lootTag.textContent = loot ? `⛁ ${loot} silver looted` : '';
  }

  // Objective tracker. obj = { field, gate, open, assault } from the simulation
  updateObjectives(obj, heroes) {
    if (!obj) return;
    if (obj.mission) { this.updateMissionObjectives(obj); return; }
    const hot = heroes && heroes.find((h) => h.name === 'Harry Hotspur');
    const king = heroes && heroes.find((h) => h.name === 'King Henry IV');
    const row = (done, failed, text, extra = '') => `<div class="obj ${done ? 'done' : ''} ${failed ? 'failed' : ''}"><i>${done ? '✔' : failed ? '✖' : '◆'}</i>${text}${extra}</div>`;
    const bar = (f) => `<div class="bar"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;
    const html = row(false, hot && hot.hp <= 0, 'Keep Harry Hotspur alive') +
      row(obj.assault, false, 'Break the royal field army', obj.assault ? '' : bar(1 - (obj.field - 0.3) / 0.7)) +
      row(obj.open, false, 'Breach the castle', obj.open ? '' : bar(1 - obj.gate) + '<small>C4, airstrikes, or batter the gate</small>') +
      row(king && king.hp <= 0, false, 'Kill King Henry IV');
    if (html !== this.lastObj) { this.el.objectives.innerHTML = '<b>OBJECTIVES</b>' + html; this.lastObj = html; }
  }

  updateMissionObjectives(obj) {
    const bar = (f) => `<div class="bar"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;
    const row = (done, text, extra = '') => `<div class="obj ${done ? 'done' : ''}"><i>${done ? '✔' : '◆'}</i>${text}${extra}</div>`;
    let html;
    if (obj.mission === 'raid' || obj.mission === 'convoy') {
      html = row(obj.field < 0.15, obj.mission === 'convoy' ? 'Break the convoy escort' : 'Break the royal camp guard', bar(1 - (obj.field - 0.15) / 0.85)) +
        row(false, 'Capture wounded officers (optional)') + row(false, 'Collect silver from fallen knights (optional)');
    } else {
      html = row(false, 'Protect the Temporal Beacon', bar(obj.beacon)) +
        row(false, obj.waves ? `Survive the waves (${obj.wave}/${obj.waves})` : `Endless Siege — wave ${obj.wave}`, obj.attackers ? `<small>${obj.attackers} attackers on the field</small>` : '') +
        row(false, 'Raise palisades in command view (<kbd>Tab</kbd> then <kbd>B</kbd>)');
    }
    if (html !== this.lastObj) { this.el.objectives.innerHTML = '<b>OBJECTIVES</b>' + html; this.lastObj = html; }
  }

  // Multi-kill callouts
  streak(n) {
    const names = { 3: 'TRIPLE KILL', 5: 'RAMPAGE', 8: 'MASSACRE', 12: 'ANACHRONISM', 20: 'WRATH OF GOD' };
    let label = null;
    for (const k of Object.keys(names).map(Number)) if (n >= k) label = names[k];
    if (!label) return;
    const el = this.el.streak;
    el.textContent = `${label} ×${n}`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
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
    // the castle
    for (const cell of castleCells()) {
      const intact = cell.type === CELL_KEEP || structTop(cellX(cell.cx), cellZ(cell.cz)) > 0;
      if (!intact) continue;
      g.fillStyle = cell.type === CELL_GATE ? '#8a6a3a' : cell.type === CELL_KEEP ? '#6a6a70' : '#b4b0a6';
      g.fillRect(tx(cellX(cell.cx) - 2), tz(cellZ(cell.cz) - 2), 4 * k + 0.5, 4 * k + 0.5);
    }
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
