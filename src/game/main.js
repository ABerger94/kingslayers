// Entry point: wires the renderer, the simulation worker, the shooter and the command mode together.
import * as THREE from 'three';
import { createWorld, createFortRenderer, groundY } from './world.js';
import { ArmyRenderer } from './army.js';
import { Fx } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Support } from './support.js';
import { Rts } from './rts.js';
import { Hud } from './hud.js';
import { SNAP_STRIDE, TEAM_REBEL, TEAM_CROWN, ST_DEAD, ST_ROUT } from '../shared/constants.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1400);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const { scene, sun } = createWorld(renderer);
const forts = createFortRenderer(scene);
const army = new ArmyRenderer(scene);
const fx = new Fx(scene);
const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();

const worker = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
const send = (m) => worker.postMessage(m);

const player = new Player(scene, fx, audio, send);
const support = new Support(scene, fx, audio, army, send, player);
const ui = {
  rtsPanel: hud.el.rtsPanel, selbox: hud.el.selbox, pauseTag: hud.el.pauseTag,
  isOverUi: (x, y) => hud.isOverUi(x, y),
  setSelInfo: (h) => hud.setSelInfo(h),
  highlightCommand: (m) => hud.highlightCommand(m),
};
const rts = new Rts(scene, camera, input, send, ui);
player.onMessage = (t, bad) => hud.message(t, bad);
player.onHit = () => { hud.hitmarker(); audio.hit(); };
support.onMessage = (t) => hud.message(t);

for (const b of hud.el.orderButtons.children) {
  b.addEventListener('mousedown', (e) => { e.stopPropagation(); rts.command(b.dataset.cmd); });
}

// ------------------------------------------------------------------ simulation state mirror
const state = {
  started: false, time: 0, strength: [1, 1], supplies: 0, regiments: [], stats: null,
  lastSnap: null, outcome: null, simMs: 0, heroIdx: [],
};

worker.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'ready') {
    state.regiments = m.regiments;
    rts.setRegiments(m.regiments);
    return;
  }
  if (m.t !== 'snap') return;
  army.push(m.snap, m.arrows, performance.now());
  state.lastSnap = m.snap;
  state.time = m.time;
  if (m.strength) state.strength = m.strength;
  state.supplies = m.supplies;
  state.stats = m.stats;
  state.simMs = m.simMs;
  if (m.regiments) { state.regiments = m.regiments; rts.setRegiments(m.regiments); }
  for (const ev of m.events) handleEvent(ev);
};

const regName = (id) => state.regiments.find((r) => r.id === id)?.name || 'A regiment';

function handleEvent(ev) {
  switch (ev.t) {
    case 'death': {
      const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z);
      if (d < 150 && ev.cause !== 'player') fx.blood(ev.x, groundY(ev.x, ev.z) + 1.1, ev.z, 4);
      break;
    }
    case 'hitPlayer':
      player.hurt(ev.dmg, state.time, ev.kind);
      break;
    case 'heroDeath':
      hud.bigBanner(`${ev.name} has fallen!`);
      hud.message(`${ev.name} has been slain!`, ev.team === TEAM_REBEL);
      break;
    case 'routing': {
      const r = state.regiments.find((q) => q.id === ev.reg);
      if (r) hud.message(`${r.name} ${r.team === TEAM_REBEL ? 'are breaking!' : 'are fleeing the field!'}`, r.team === TEAM_REBEL);
      break;
    }
    case 'forts': forts.add(ev.cells); if (ev.cells.length) hud.message(`Palisade raised (${ev.cells.length * 4} m).`); break;
    case 'fortGone': forts.remove(ev.cell); break;
    case 'msg': hud.message(ev.text); if (ev.big) hud.bigBanner(ev.text, 5000); audio.radio(); break;
    case 'newReg': break;
    case 'defect': break;
    case 'outcome': showOutcome(ev); break;
  }
}

function showOutcome(ev) {
  if (state.outcome) return;
  state.outcome = ev.outcome;
  setTimeout(() => {
    input.unlock();
    document.getElementById('outcome').classList.remove('hidden');
    document.getElementById('outcomeTitle').textContent = ev.outcome === 'victory' ? 'HISTORY REWRITTEN' : 'HISTORY HOLDS';
    document.getElementById('outcomeText').textContent = ev.text;
    const s = state.stats;
    document.getElementById('outcomeStats').innerHTML = s
      ? `Battle time ${hud.el.clock.textContent} · your kills <b>${s.playerKills}</b> · royal dead ${s.kills[TEAM_REBEL]} · rebel dead ${s.kills[TEAM_CROWN]} · turncoats ${s.defectors}`
      : '';
  }, 2500);
  hud.bigBanner(ev.outcome === 'victory' ? 'VICTORY' : 'DEFEAT', 6000);
}

// ------------------------------------------------------------------ start
document.getElementById('startBtn').addEventListener('click', () => {
  audio.init();
  document.getElementById('loading').classList.remove('hidden');
  send({ t: 'start', seed: 1403 });
  setTimeout(() => {
    document.getElementById('intro').classList.add('hidden');
    hud.el.hud.classList.remove('hidden');
    state.started = true;
    input.lock();
    hud.bigBanner('Shrewsbury · 21 July 1403', 4000);
    hud.message('Royal archers are drawing their bows. Keep Hotspur alive!');
  }, 150);
});
canvas.addEventListener('click', () => { if (state.started && !rts.active && !state.outcome) input.lock(); });

function toggleMode() {
  if (rts.active) {
    rts.exit();
    send({ t: 'timescale', v: 1 });
    input.lock();
  } else {
    rts.enter(player.pos);
    send({ t: 'timescale', v: 0.3 }); // the world slows while you think
  }
  hud.setMode(rts.active);
}

// ------------------------------------------------------------------ frame loop
let last = performance.now();
let hudTimer = 0;
const camDir = new THREE.Vector3();

function heroesInfo() {
  const snap = state.lastSnap;
  if (!snap) return null;
  const out = [];
  for (const r of state.regiments) {
    if (r.hero < 0 || r.hero === undefined) continue;
    const k = r.hero * SNAP_STRIDE;
    if (k >= snap.length) continue;
    const st = (snap[k + 3] >> 4) & 7;
    const names = { "Hotspur's Household": 'Harry Hotspur', "King Henry's Guard": 'King Henry IV', "Prince Hal's Retinue": 'Prince Hal', "Glyndwr's Teulu": 'Owain Glyndŵr' };
    out.push({ name: names[r.name] || r.name, team: r.team, hp: st === ST_DEAD ? 0 : snap[k + 4] });
  }
  return out;
}

function counts() {
  const snap = state.lastSnap;
  if (!snap) return null;
  const c = [0, 0];
  for (let k = 0; k < snap.length; k += SNAP_STRIDE) {
    const p = snap[k + 3], st = (p >> 4) & 7;
    if (st !== ST_DEAD && st !== ST_ROUT) c[(p >> 3) & 1]++;
  }
  return c;
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.started) {
    // Slow flyover behind the menu
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 220, 70, Math.cos(t * 0.05) * 220);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return;
  }
  if (input.hit('Tab') && !state.outcome) toggleMode();
  const scale = rts.active ? (rts.paused ? 0 : 0.3) : 1;
  const dt = realDt * scale;

  const fieldActive = !rts.active && !state.outcome;
  player.update(rts.active ? dt : realDt, input, army, camera, state.time, fieldActive);
  if (rts.active) rts.update(dt, realDt, army, support);
  else if (fieldActive) {
    if (input.hit('KeyZ')) support.callAirstrike(player.aimPoint.clone());
    if (input.hit('KeyX')) support.callGunship(player.pos.clone());
  }
  support.update(dt, camera.position);
  fx.update(dt);

  // Tell the simulation where we are and who we shot
  send({ t: 'player', p: player.simState() });
  if (player.hits.length) {
    send({ t: 'damage', hits: player.hits, source: 'gun' });
    player.hits = [];
  }

  army.update(now, camera.position);
  rts.updateBanners(now / 1000);

  // Camera shake from explosions and recoil
  const shake = fx.shake + player.camShake * 0.3;
  player.camShake *= Math.exp(-realDt * 12);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  // Keep the shadow camera around the player
  const focus = rts.active ? rts.focus : player.pos;
  sun.position.set(focus.x - 80, groundY(focus.x, focus.z) + 160, focus.z - 60);
  sun.target.position.set(focus.x, groundY(focus.x, focus.z), focus.z);

  hudTimer -= realDt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    hud.update({
      time: state.time, strength: state.strength, regiments: state.regiments, heroes: heroesInfo(),
      player, support, supplies: state.supplies, rtsActive: rts.active, rts, counts: counts(),
    });
    audio.setIntensity(Math.min(1, (state.stats ? (state.stats.kills[0] + state.stats.kills[1]) : 0) / 300));
  }
  camera.getWorldDirection(camDir);
  hud.drawMinimap(state.lastSnap, player, { x: camera.position.x, z: camera.position.z, dx: camDir.x, dz: camDir.z }, state.regiments, realDt);

  renderer.render(scene, camera);
  input.endFrame();
}
requestAnimationFrame(frame);

// Expose for debugging in the console
window.__game = { state, player, army, rts, support, send };
