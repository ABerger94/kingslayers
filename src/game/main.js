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
import { CastleView } from './castleView.js';
import { PadSetup } from './padSetup.js';
import { BTN, applyFieldBindings, applyCommandBindings, releasePadButtons } from './gamepad.js';
import { SNAP_STRIDE, TEAM_REBEL, TEAM_CROWN, ST_DEAD, ST_ROUT, CAVALRY, HERO } from '../shared/constants.js';
import { MISSIONS } from '../shared/missions.js';
import { loadCampaign, saveCampaign, newCampaign, clearCampaign, missionConfig, applyResults, ITEMS, heroPerks } from './campaign.js';
import { Hub, showResults } from './hub.js';
import { buildSettlementScene } from './settlementView.js';
import { setStructure, cellOf } from './structures.js';

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
sun.intensity = 2.0;
sun.color.set(0xffe2b8); // late-afternoon light
const forts = createFortRenderer(scene);
const army = new ArmyRenderer(scene);
const fx = new Fx(scene);
const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();
const castle = new CastleView(scene, fx, audio);

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
player.onHit = (kind = 'hit') => {
  hud.hitmarker(kind);
  if (kind === 'head') audio.headshot(); else if (kind === 'armor') audio.armor(); else audio.hit();
};
player.onRumble = (strong, weak, ms) => input.pad.rumble(strong, weak, ms);
// Controller Setup (intro button, or F2 in game, which pauses the battle)
const padSetup = new PadSetup(input.pad);
document.getElementById('padSetupOpen').addEventListener('click', () => padSetup.show());
padSetup.onClose = () => {
  if (state.started && !state.outcome) {
    if (!rts.paused) send({ t: 'pause', v: false });
    if (!rts.active) input.lock();
  }
};
function openPadSetup() {
  if (padSetup.open) return;
  if (state.started) { send({ t: 'pause', v: true }); input.unlock(); }
  padSetup.show();
}
let warnedLayout = false;

input.pad.onConnect = (id, connected) => {
  document.getElementById('padPrompt').classList.toggle('hidden', !connected);
  if (state.started) hud.message(connected ? 'Controller connected.' : 'Controller disconnected.', !connected);
};
support.onMessage = (t) => hud.message(t);

for (const b of hud.el.orderButtons.children) {
  b.addEventListener('mousedown', (e) => { e.stopPropagation(); rts.command(b.dataset.cmd); });
}

// ------------------------------------------------------------------ simulation state mirror
const state = {
  started: false, time: 0, strength: [1, 1], supplies: 0, regiments: [], stats: null,
  lastSnap: null, outcome: null, simMs: 0, heroIdx: [], obj: null,
  streak: 0, streakT: 0,
};
const DAMAGE_TAKEN = { squire: 0.6, knight: 1, kingslayer: 1.4 };

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
  if (m.obj) state.obj = m.obj;
  if (m.regiments) { state.regiments = m.regiments; rts.setRegiments(m.regiments); }
  for (const ev of m.events) handleEvent(ev);
};

const regName = (id) => state.regiments.find((r) => r.id === id)?.name || 'A regiment';

function handleEvent(ev) {
  switch (ev.t) {
    case 'death': {
      const d = Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z);
      if (ev.i < army.n && army.teamOf[ev.i] === TEAM_CROWN && !army.agentOf[ev.i]) {
        const type = army.typeOf[ev.i];
        if (type === CAVALRY || type === HERO) dropPouch(ev.x, ev.z, 15 + Math.floor(Math.random() * 25));
        else if (Math.random() < 0.08) dropPouch(ev.x, ev.z, 4 + Math.floor(Math.random() * 8));
      }
      if (d < 150 && ev.cause !== 'player') fx.blood(ev.x, groundY(ev.x, ev.z) + 1.1, ev.z, 4);
      if (ev.cause === 'player' || ev.cause === 'explosion' || ev.cause === 'sword') {
        if (ev.cause !== 'explosion' && player.alive && !rts.active) { hud.hitmarker('kill'); audio.kill(); }
        // kills in quick succession build a streak
        state.streak = state.streakT > 0 ? state.streak + 1 : 1;
        state.streakT = 2.5;
        hud.streak(state.streak);
        streakReward(state.streak);
      }
      break;
    }
    case 'hitPlayer':
      player.hurt(ev.dmg, state.time, ev.kind, ev.x, ev.z);
      break;
    case 'heroDeath':
      hud.bigBanner(`${ev.name} has fallen!`);
      hud.message(`${ev.name} has been slain!`, ev.team === TEAM_REBEL);
      // Killing historical figures changes history
      if (ev.name === 'King Henry IV') addInstability(12, 'A king dies before his time');
      break;
    case 'officerDown':
      if (ev.team === TEAM_CROWN && Math.hypot(player.pos.x - ev.x, player.pos.z - ev.z) < 140) hud.message(`${ev.rank} ${ev.name} has fallen wounded. Capture him!`);
      if (ev.name === 'Prince Hal') { hud.bigBanner('Prince Hal is down! Capture him or finish him.', 4000); }
      break;
    case 'captured':
      battle.prisoners.push({ name: ev.name, rank: ev.rank, value: ev.value, hero: ev.hero });
      hud.message(`${ev.name} taken prisoner. He'll be held at your keep.`);
      if (ev.hero) addInstability(6, 'The future Henry V in chains');
      break;
    case 'agentShot': {
      const y = groundY(ev.x, ev.z) + 1.5;
      const ty = ev.hit ? player.pos.y + 1.3 : groundY(ev.tx, ev.tz) + 1;
      fx.tracer(new THREE.Vector3(ev.x, y, ev.z), new THREE.Vector3(ev.tx + (ev.hit ? 0 : (Math.random() - 0.5) * 4), ty, ev.tz + (ev.hit ? 0 : (Math.random() - 0.5) * 4)), [0.7, 0.6, 1]);
      if (Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z) < 160) audio.minigun();
      break;
    }
    case 'agentDown': hud.message('One of the Usurper\'s agents is down.'); break;
    case 'gunsmoke':
      if (Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z) < 220) fx.smoke(ev.x, groundY(ev.x, ev.z) + 1.6, ev.z, 3, 0.6, 0.8, 1.6);
      break;
    case 'storm': {
      // a time storm: purple lightning out of a clear sky
      const gy = groundY(ev.x, ev.z);
      for (let k = 0; k < 3; k++) fx.tracer(new THREE.Vector3(ev.x + (Math.random() - 0.5) * 6, gy + 160, ev.z + (Math.random() - 0.5) * 6), new THREE.Vector3(ev.x, gy, ev.z), [0.8, 0.5, 1]);
      fx.explosion(ev.x, ev.z, 5, camera.position);
      audio.explosion(Math.hypot(camera.position.x - ev.x, camera.position.z - ev.z));
      break;
    }
    case 'wave':
      hud.bigBanner(ev.of ? `Wave ${ev.n} of ${ev.of}` : `Wave ${ev.n}`, 3000);
      audio.fanfare();
      break;
    case 'waveCleared': battle.wavesCleared = ev.n; hud.message(`Wave ${ev.n} beaten back!`); break;
    case 'routing': {
      const r = state.regiments.find((q) => q.id === ev.reg);
      if (r) hud.message(`${r.name} ${r.team === TEAM_REBEL ? 'are breaking!' : 'are fleeing the field!'}`, r.team === TEAM_REBEL);
      break;
    }
    case 'forts': forts.add(ev.cells); if (ev.cells.length) hud.message(`Palisade raised (${ev.cells.length * 4} m).`); break;
    case 'cellGone':
      if (ev.type === 6) { battle.settlement?.destroyBeacon(fx, camera.position); setStructure(ev.cell, 0); audio.explosion(0); break; }
      if (!forts.remove(ev.cell)) castle.destroy(ev.cell, ev.type, camera.position);
      break;
    case 'phase':
      audio.fanfare();
      break;
    case 'msg': hud.message(ev.text); if (ev.big) hud.bigBanner(ev.text, 5000); audio.radio(); break;
    case 'newReg': break;
    case 'defect': break;
    case 'outcome': showOutcome(ev); break;
  }
}

// Kill streak rewards: a second wind, then terror, then a gift from the Handler
function streakReward(n) {
  if (!player.alive) return;
  if (n === 5) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
    const a = player.ammo[player.weapon];
    if (!player.melee) { const take = Math.min(player.w.magSize - a.mag, a.reserve); a.mag += take; a.reserve -= take; }
    hud.streakReward('Second wind: +30% health, magazine topped up');
  } else if (n === 8) {
    send({ t: 'terror', x: player.pos.x, z: player.pos.z, r: 32, amount: 0.45 });
    hud.streakReward('Terror! The royal soldiers around you lose their nerve');
    audio.radio();
  } else if (n === 12) {
    player.c4 = Math.min(player.c4Max + 1, player.c4 + 1);
    player.c4Max = Math.max(player.c4Max, player.c4);
    hud.streakReward('Handler: "Nice work. Sending you a breaching charge."');
    audio.radio();
  }
}

function showOutcome(ev) {
  if (state.outcome) return;
  state.outcome = ev.outcome;
  if (battle.campaign) {
    // Shrewsbury: keeping Hotspur alive rewrites a major event
    const hot = heroesInfo()?.find((h) => h.name === 'Harry Hotspur');
    if (battle.mission === 'shrewsbury' && ev.outcome === 'victory' && hot && hot.hp > 0) battle.instGain += 8;
    const squadsAlive = {};
    for (const r of state.regiments) if (r.squadId !== null && r.squadId !== undefined) squadsAlive[r.squadId] = r.alive;
    const kills = state.stats ? state.stats.playerKills : 0;
    const result = {
      mission: battle.mission, outcome: ev.outcome, text: ev.text,
      silver: battle.loot + kills, loot: battle.loot, kills,
      prisoners: battle.prisoners, squadsAlive,
      instabilityGain: battle.instGain, highTech: battle.highTech,
      stockUsed: { ...support.used, c4: Math.max(0, ((player.stockUsed && player.stockUsed.c4) || 0) - (battle.freeC4 || 0)) },
      wavesCleared: battle.wavesCleared,
    };
    hud.bigBanner(ev.outcome === 'victory' ? 'VICTORY' : 'DEFEAT', 4000);
    if (ev.outcome === 'victory') audio.fanfare();
    setTimeout(() => {
      input.unlock();
      const summary = applyResults(campaign, result);
      saveCampaign(campaign);
      showResults(result, summary, () => location.reload());
    }, 2500);
    return;
  }
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
  if (ev.outcome === 'victory') audio.fanfare();
}

// ------------------------------------------------------------------ title screen, campaign and battle start
let campaign = loadCampaign();
let hub = null;
// What happens in this battle that matters to the campaign
const battle = { campaign: false, mission: 'classic', loot: 0, prisoners: [], instBase: 0, instGain: 0, highTech: false, wavesCleared: 0, warned: 0, settlement: null };
const selectedDifficulty = () => document.querySelector('input[name="diff"]:checked')?.value || 'knight';
if (campaign) document.getElementById('continueBtn').classList.remove('hidden');

function openHub() {
  document.getElementById('intro').classList.add('hidden');
  hub = new Hub(campaign, {
    onDeploy: (id, opts) => deployMission(id, opts),
    onQuit: (reset) => { if (reset) clearCampaign(); location.reload(); },
  });
  hub.show();
}
document.getElementById('continueBtn').addEventListener('click', () => { audio.init(); openHub(); });
document.getElementById('newCampaignBtn').addEventListener('click', () => {
  if (campaign && !confirm('Start a new campaign? Your current campaign will be lost.')) return;
  audio.init();
  campaign = newCampaign(selectedDifficulty());
  saveCampaign(campaign);
  openHub();
});
// Quick battle: the full Shrewsbury battle with the full arsenal, outside the campaign
document.getElementById('startBtn').addEventListener('click', () => {
  const difficulty = selectedDifficulty();
  startBattle({ mission: 'classic', difficulty }, {
    loadout: ['rifle', 'shotgun', 'launcher'], stock: { airstrike: Infinity, gunship: Infinity, supply: Infinity }, c4: 3, suv: true, canRespawn: true,
  });
});

function deployMission(id, opts) {
  const c = campaign;
  const sabotage = Math.min(opts.sabotage || 0, c.res.intel);
  c.res.intel -= sabotage;
  saveCampaign(c);
  battle.campaign = true;
  battle.instBase = c.instability;
  const loadout = c.loadout.filter((g) => c.owned[g]);
  if (!loadout.length) loadout.push('pistol');
  hub.hide();
  const perks = heroPerks(c);
  battle.freeC4 = perks.c4Bonus; // the Engineer's free charges don't come out of stock
  startBattle(missionConfig(c, id, { ...opts, sabotage }), {
    loadout, stock: { airstrike: c.stock.airstrike || 0, gunship: c.stock.gunship || 0, supply: c.stock.supply || 0 },
    c4: (c.stock.c4 || 0) + perks.c4Bonus, suv: !!c.owned.suv, canRespawn: c.difficulty === 'squire', buildings: c.buildings, perks,
  });
}

function startBattle(cfg, setup) {
  audio.init();
  battle.mission = cfg.mission;
  const meta = MISSIONS[cfg.mission];
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  // the operative's kit
  player.setLoadout(setup.loadout);
  hud.setLoadout(player.loadout);
  const perks = setup.perks || heroPerks(null);
  Object.assign(player.perk, perks.player);
  player.maxHp = player.hp = Math.round(250 * perks.maxHp);
  battle.timeScale = perks.timeScale;
  player.damageTaken = (DAMAGE_TAKEN[cfg.difficulty] ?? 1) * perks.damageTaken;
  player.canRespawn = setup.canRespawn;
  player.c4 = setup.c4;
  player.c4Max = Math.max(3, setup.c4);
  support.stock = { ...setup.stock };
  const tm = perks.techMul;
  const techCost = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.inst * tm]));
  player.techCost = battle.campaign ? techCost : {};
  support.techCost = battle.campaign ? { airstrike: ITEMS.airstrike.inst * tm, gunship: ITEMS.gunship.inst * tm, supply: ITEMS.supply.inst * tm } : {};
  player.spawn.set(meta.spawn.x, 0, meta.spawn.z);
  player.pos.copy(player.spawn);
  player.pos.y = groundY(player.pos.x, player.pos.z);
  player.camInit = false;
  if (setup.suv) {
    player.suv.pos.set(meta.suv.x, 0, meta.suv.z);
    player.suv.pos.y = groundY(meta.suv.x, meta.suv.z);
    player.suv.model.position.copy(player.suv.pos);
  } else {
    player.suv.alive = false;
    player.suv.model.visible = false;
  }
  hud.setSuvAvailable(setup.suv);
  hud.el.timeline.classList.toggle('hidden', !battle.campaign);
  // your settlement appears around the Beacon when you defend it
  if (meta.beacon) {
    battle.settlement = buildSettlementScene(scene, meta.beacon, setup.buildings || []);
    setStructure(cellOf(meta.beacon.x, meta.beacon.z), 11);
  }
  send({ t: 'start', seed: cfg.mission === 'convoy' ? Math.floor(Math.random() * 1e6) : 1403, config: cfg });
  setTimeout(() => {
    document.getElementById('loading').classList.add('hidden');
    hud.el.hud.classList.remove('hidden');
    state.started = true;
    input.lock();
    hud.bigBanner(meta.title, 4000);
    if (cfg.mission === 'classic' || cfg.mission === 'shrewsbury') hud.message('Royal archers are drawing their bows. Keep Hotspur alive!');
    else if (meta.beacon) hud.message('Raise palisades and hold the line: Tab for command view, then B to build.');
    else hud.message('Wound the royal officers (not with explosives) and press E to capture them.');
  }, 150);
}

// ------------------------------------------------------------------ Timeline Instability (doc 4.7)
function addInstability(amount, reason) {
  if (!battle.campaign || !amount) return;
  battle.instGain += amount;
  if (amount >= 0.5) battle.highTech = true;
  const v = battle.instBase + battle.instGain;
  const thresholds = [[25, 'Handler: "Careful. The timeline is starting to notice you."'], [50, 'Handler: "Instability at fifty percent. Expect… anomalies."'], [75, 'Handler: "Seventy-five percent! The Usurper can track you now."'], [90, 'Handler: "Ninety! Ease off the modern toys or there won\'t be a future to go home to!"']];
  for (const [t, msg] of thresholds) if (v >= t && battle.warned < t) { battle.warned = t; hud.message(msg, true); audio.radio(); }
  if (reason) hud.message(`${reason} (+${amount.toFixed(0)}% instability)`, true);
  if (v >= 100 && !state.outcome) {
    send({ t: 'pause', v: true });
    showOutcome({ outcome: 'defeat', text: 'The timeline has collapsed. Too much of the future bled into 1403.' });
  }
}
player.onTech = (a) => addInstability(a);
support.onTech = (a) => addInstability(a);
player.onCapture = (i) => send({ t: 'capture', i });
player.onBledOut = () => {
  if (state.outcome) return;
  send({ t: 'pause', v: true });
  showOutcome({ outcome: 'defeat', text: 'You bled out before your bodyguard could reach you. The mission has failed.' });
};

// ------------------------------------------------------------------ loot: silver pouches dropped by fallen knights
const pouchGeo = new THREE.DodecahedronGeometry(0.22, 0);
const pouchMat = new THREE.MeshPhongMaterial({ color: 0xe8c050, emissive: 0x6a4a10, shininess: 90 });
const pouches = [];
function dropPouch(x, z, value) {
  if (pouches.length > 160) return;
  const m = new THREE.Mesh(pouchGeo, pouchMat);
  m.position.set(x + (Math.random() - 0.5), groundY(x, z) + 0.35, z + (Math.random() - 0.5));
  scene.add(m);
  pouches.push({ m, value, t: 0 });
}
function updatePouches(dt) {
  for (let k = pouches.length - 1; k >= 0; k--) {
    const p = pouches[k];
    p.t += dt;
    p.m.rotation.y += dt * 2;
    p.m.position.y = groundY(p.m.position.x, p.m.position.z) + 0.35 + Math.sin(p.t * 3) * 0.08;
    if (!player.alive) continue;
    const dx = player.pos.x - p.m.position.x, dz = player.pos.z - p.m.position.z, d = Math.hypot(dx, dz);
    const reach = player.inVehicle ? 4 : 6;
    if (d < reach) { p.m.position.x += dx / d * dt * 12; p.m.position.z += dz / d * dt * 12; }
    if (d < 1.4) {
      battle.loot += p.value;
      audio.tone(1500 + Math.random() * 400, 0.08, 0.05, 'triangle', 1.3);
      scene.remove(p.m);
      pouches.splice(k, 1);
    }
  }
}
canvas.addEventListener('click', () => { if (state.started && !rts.active && !state.outcome) input.lock(); });

function toggleMode() {
  releasePadButtons(input);
  if (rts.active) {
    rts.exit();
    send({ t: 'timescale', v: 1 });
    input.lock();
  } else {
    rts.enter(player.pos);
    // Start the (controller) cursor in the middle of the screen rather than at a screen edge
    input.mouse.x = innerWidth / 2; input.mouse.y = innerHeight / 2;
    send({ t: 'timescale', v: battle.timeScale || 0.2 }); // the world slows to 20% (10% for a Commander) while you think
  }
  hud.setMode(rts.active, input.pad.active(performance.now()));
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
    if (r.hero < 0 || r.hero === undefined || r.agent) continue;
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
  const pad = input.pad;
  pad.poll(now);
  if (input.hit('F2')) openPadSetup();
  if (padSetup.open) { input.endFrame(); if (state.started) renderer.render(scene, camera); return; }
  // Tell the player once if their controller isn't in the browser's standard layout
  if (state.started && pad.connected && pad.layout === 'guessed' && !warnedLayout) {
    warnedLayout = true;
    hud.message('Controller detected with a non-standard layout. If it misbehaves, press F2 (or Controller setup on the main menu) to map it.', true);
  }
  const padActive = pad.active(now);
  if (padActive !== !!hud.padMode) hud.setMode(rts.active, padActive);
  if (pad.connected) document.getElementById('padPrompt').classList.remove('hidden');
  const onTitle = !state.started && !document.getElementById('intro').classList.contains('hidden');
  if (onTitle && (pad.hit(BTN.A) || pad.hit(BTN.MENU))) document.getElementById(campaign ? 'continueBtn' : 'newCampaignBtn').click();
  if (state.outcome && (!document.getElementById('outcome').classList.contains('hidden') || !document.getElementById('results').classList.contains('hidden')) && (pad.hit(BTN.A) || pad.hit(BTN.MENU))) location.reload();
  if (!state.started) {
    // Slow flyover behind the menu
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 220, 70, Math.cos(t * 0.05) * 220);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return;
  }
  if (rts.active) applyCommandBindings(pad, input, rts, realDt);
  else applyFieldBindings(pad, input, { canCapture: player.capturable >= 0, inVehicle: player.inVehicle, openSettings: openPadSetup });
  if (input.hit('Tab') && !state.outcome) toggleMode();
  const scale = rts.active ? (rts.paused ? 0 : battle.timeScale || 0.2) : 1;
  const dt = realDt * scale;

  const shakeBefore = fx.shake;
  const fieldActive = !rts.active && !state.outcome;
  player.update(rts.active ? dt : realDt, input, army, camera, state.time, fieldActive, !rts.active);
  if (rts.active) rts.update(dt, realDt, army, support);
  else if (fieldActive) {
    if (input.hit('KeyZ')) support.callAirstrike(player.aimPoint.clone());
    if (input.hit('KeyX')) support.callGunship(player.pos.clone());
    if (input.hit('KeyT')) support.callSupply(player.aimPoint.clone());
  }
  updatePouches(dt);
  battle.settlement?.update(now / 1000);
  support.update(dt, camera.position);
  fx.update(dt);
  // Rumble on nearby explosions (shake jumps when one goes off)
  if (fx.shake > shakeBefore + 0.05) pad.rumble(Math.min(1, fx.shake), Math.min(1, fx.shake * 0.7), 350);
  hud.updatePadCursor(rts.active && padActive, input.mouse.x, input.mouse.y);

  // Tell the simulation where we are and who we shot
  send({ t: 'player', p: player.simState() });
  if (player.hammerHits.length) {
    send({ t: 'damage', hits: player.hammerHits, source: 'hammer' });
    player.hammerHits = [];
  }
  if (player.swordHits.length) {
    send({ t: 'damage', hits: player.swordHits, source: 'sword' });
    player.swordHits = [];
  }
  if (player.hits.length) {
    send({ t: 'damage', hits: player.hits, source: 'gun' });
    player.hits = [];
  }
  if (player.boltHits.length) {
    send({ t: 'damage', hits: player.boltHits, source: 'bolt' });
    player.boltHits = [];
  }

  army.update(now, camera.position);
  rts.updateBanners(now / 1000);
  castle.update(now / 1000);
  state.streakT -= realDt;

  // Camera shake from explosions and recoil
  const shake = fx.shake + player.camShake * 0.3;
  player.camShake *= Math.exp(-realDt * 12);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  // Keep the shadow camera around the player
  const focus = rts.active ? rts.focus : player.pos;
  sun.position.set(focus.x - 110, groundY(focus.x, focus.z) + 90, focus.z - 140);
  sun.target.position.set(focus.x, groundY(focus.x, focus.z), focus.z);

  hudTimer -= realDt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    const heroes = heroesInfo();
    hud.update({
      time: state.time, strength: state.strength, regiments: state.regiments, heroes,
      player, support, supplies: state.supplies, rtsActive: rts.active, rts, counts: counts(),
    });
    hud.updateObjectives(state.obj, heroes);
    hud.updatePlayerState(player, battle.loot, padActive);
    if (battle.campaign) hud.updateTimeline(battle.instBase + battle.instGain);
    audio.setIntensity(Math.min(1, (state.stats ? (state.stats.kills[0] + state.stats.kills[1]) : 0) / 300));
  }
  camera.getWorldDirection(camDir);
  hud.drawMinimap(state.lastSnap, player, { x: camera.position.x, z: camera.position.z, dx: camDir.x, dz: camDir.z }, state.regiments, realDt);

  renderer.render(scene, camera);
  input.endFrame();
}
requestAnimationFrame(frame);

// Expose for debugging in the console
window.__game = { state, player, army, rts, support, send, castle, input, battle };
