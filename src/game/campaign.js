// Campaign state and rules: settlement, economy, the Depot (the Handler's shop), army roster,
// prisoners, Timeline Instability and endings. Saved in the browser (localStorage).
import { MISSIONS, SQUAD_TYPES } from '../shared/missions.js';

const SAVE_KEY = 'timefall.campaign.v1';

// ---------------------------------------------------------------- the Depot (shop) catalogue
// Tiers are unlocked by upgrading the Temporal Beacon. Instability: how much using it fractures time.
export const ITEMS = {
  pistol: { kind: 'gun', tier: 1, price: 0, name: 'Service Pistol', desc: 'Reliable sidearm. Drops peasants; plate shrugs it off.', inst: 0.01 },
  shotgun: { kind: 'gun', tier: 1, price: 150, name: 'Combat Shotgun', desc: 'Devastating up close.', inst: 0.03 },
  rifle: { kind: 'gun', tier: 2, price: 300, name: 'Assault Rifle', desc: 'High caliber, full auto. Punches through plate.', inst: 0.02 },
  sniper: { kind: 'gun', tier: 2, price: 350, name: 'Sniper Rifle', desc: 'Picks off officers from 300 m. Scoped.', inst: 0.12 },
  c4: { kind: 'stock', tier: 2, price: 45, name: 'Breaching Charge', desc: 'C4 for gates and walls. Bought singly.', max: 6, inst: 1.5 },
  supply: { kind: 'stock', tier: 2, price: 50, name: 'Supply Drop', desc: 'Call in an ammo crate where you aim.', max: 5, inst: 1 },
  launcher: { kind: 'gun', tier: 3, price: 450, name: 'Grenade Launcher', desc: 'Area denial. Medieval armies break and run.', inst: 0.5 },
  suv: { kind: 'vehicle', tier: 3, price: 500, name: 'Armoured SUV', desc: 'Ram formations, resupply from the roof rack.', inst: 2 },
  gunship: { kind: 'stock', tier: 4, price: 260, name: 'Gunship Support', desc: '30 seconds of attack helicopter overhead.', max: 3, inst: 5 },
  airstrike: { kind: 'stock', tier: 4, price: 320, name: 'Airstrike', desc: 'A line of bombs on your mark.', max: 3, inst: 6 },
};
export const GUN_IDS = ['pistol', 'shotgun', 'rifle', 'sniper', 'launcher'];

// ---------------------------------------------------------------- settlement buildings
export const BUILDINGS = {
  beacon: { name: 'Temporal Beacon', desc: 'Your link to the future. Upgrade it to unlock better Depot tiers.', unique: true, r: 30 },
  house: { name: 'House', desc: '+40 population (army size cap).', cost: { wood: 40 }, r: 22 },
  farm: { name: 'Farm', desc: '+45 food after every mission.', cost: { wood: 50 }, r: 30 },
  mill: { name: 'Lumber Mill', desc: '+45 wood after every mission.', cost: { wood: 40, food: 20 }, r: 26 },
  barracks: { name: 'Barracks', desc: 'Recruit squads. A second barracks trains cavalry.', cost: { wood: 80, food: 40 }, r: 30 },
};
export const BEACON_UPGRADES = [null, null, { silver: 250, wood: 60 }, { silver: 500, wood: 120 }, { silver: 900, wood: 200 }];

export function newCampaign(difficulty = 'knight') {
  return {
    v: 1, difficulty, act: 1,
    completed: {}, missionCount: 0, convoyLevel: 0, pendingAttack: false,
    res: { silver: 200, food: 150, wood: 160, intel: 0 },
    beacon: 1,
    buildings: [
      { type: 'beacon', x: 0.5, y: 0.52 },
      { type: 'house', x: 0.36, y: 0.4 },
      { type: 'farm', x: 0.66, y: 0.7 },
    ],
    owned: { pistol: true, shotgun: true },
    stock: { c4: 2, supply: 1, gunship: 0, airstrike: 0 },
    loadout: ['pistol', 'shotgun'],
    squads: [
      { id: 1, name: 'Welsh Levies', type: 'spear', men: 40, vet: 0, battles: 0 },
      { id: 2, name: 'Gwent Bowmen', type: 'archer', men: 30, vet: 0, battles: 0 },
    ],
    nextSquad: 3,
    prisoners: [],
    lieutenants: [],
    reputation: 0, loyalty: 70, executions: 0, executionBuff: 0,
    instability: 5, fear: 1,
    ending: null, awaitingEnding: false,
    endlessBest: 0,
    log: ['You arrive in the Welsh March, 1403. The Handler\'s voice crackles in your ear: "The Usurper has broken history. Let\'s see what we can save."'],
  };
}

export function loadCampaign() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveCampaign(c) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}
export function clearCampaign() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- economy helpers
export const count = (c, type) => c.buildings.filter((b) => b.type === type).length;
export const popCap = (c) => 60 + count(c, 'house') * 40;
export const armySize = (c) => c.squads.reduce((a, s) => a + s.men, 0);
export const canAfford = (c, cost) => Object.entries(cost).every(([k, v]) => (c.res[k] || 0) >= v);
export function pay(c, cost) { for (const [k, v] of Object.entries(cost)) c.res[k] -= v; }
export const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');
export function production(c) {
  return { food: 20 + count(c, 'farm') * 45, wood: 20 + count(c, 'mill') * 45 };
}

export function log(c, text) {
  c.log.unshift(text);
  if (c.log.length > 30) c.log.length = 30;
}

// ---------------------------------------------------------------- missions
export function missionStatus(c, id) {
  if (c.ending && id !== 'endless') return 'done';
  const done = !!c.completed[id];
  switch (id) {
    case 'raid': return done ? 'done' : 'available';
    case 'defense':
      if (!c.completed.raid) return 'locked';
      return c.pendingAttack || !done ? 'required' : 'done';
    case 'convoy':
      if (!c.completed.raid) return 'locked';
      return c.pendingAttack ? 'blocked' : 'available';
    case 'shrewsbury':
      if (!c.completed.defense) return 'locked';
      return c.pendingAttack ? 'blocked' : done ? 'done' : 'available';
    case 'endless': return c.ending ? 'available' : 'locked';
  }
  return 'locked';
}

export function missionConfig(c, id, opts = {}) {
  return {
    mission: id,
    difficulty: c.difficulty,
    instability: c.instability,
    fear: c.fear,
    squads: c.squads.map((s) => ({ ...s })),
    moraleBonus: c.executionBuff ? 0.15 : 0,
    sabotage: (opts.sabotage || 0) * 0.1,
    convoyLevel: c.convoyLevel,
    scale: opts.scale || 'standard',
  };
}

// Apply a finished battle's results to the campaign
export function applyResults(c, r) {
  const m = MISSIONS[r.mission];
  const won = r.outcome === 'victory';
  const lines = [];
  c.missionCount++;
  // loot sent to the present
  let silver = r.silver;
  if (won && m.reward) silver += m.reward;
  if (r.mission === 'endless') silver += r.wavesCleared * 60;
  c.res.silver += silver;
  lines.push(`+${silver} silver`);
  // prisoners taken off the field reach your keep
  for (const p of r.prisoners) c.prisoners.push(p);
  if (r.prisoners.length) lines.push(`${r.prisoners.length} prisoner${r.prisoners.length > 1 ? 's' : ''} taken to the keep`);
  // the army: casualties and veterancy
  for (const s of c.squads) {
    if (r.squadsAlive[s.id] === undefined) continue;
    const before = s.men;
    s.men = r.squadsAlive[s.id];
    s.battles = (s.battles || 0) + 1;
    if (won && s.men > 0 && s.vet < 3 && s.battles % 2 === 0) { s.vet++; lines.push(`${s.name} are now veterans (level ${s.vet})`); }
    if (before - s.men > 0) lines.push(`${s.name}: ${before - s.men} lost`);
  }
  const lost = c.squads.filter((s) => s.men <= 0);
  for (const s of lost) lines.push(`${s.name} were wiped out`);
  c.squads = c.squads.filter((s) => s.men > 0);
  // low loyalty: desertions
  if (c.loyalty < 40) {
    for (const s of c.squads) s.men = Math.max(1, Math.round(s.men * 0.9));
    lines.push('Low loyalty: men are deserting');
  }
  // the settlement produces between missions
  const prod = production(c);
  c.res.food += prod.food; c.res.wood += prod.wood;
  lines.push(`Settlement: +${prod.food} food, +${prod.wood} wood`);
  // consumables used
  for (const [k, v] of Object.entries(r.stockUsed || {})) c.stock[k] = Math.max(0, (c.stock[k] || 0) - v);
  // Timeline Instability
  let dInst = r.instabilityGain;
  if (!r.highTech) dInst -= 4; // a light touch lets history heal a little
  c.instability = Math.max(0, Math.min(100, c.instability + dInst));
  lines.push(`Timeline Instability ${dInst >= 0 ? '+' : ''}${dInst.toFixed(1)}% → ${c.instability.toFixed(0)}%`);
  // they get used to the thunder-sticks
  c.fear = Math.max(0.35, c.fear * 0.85);
  c.executionBuff = 0;
  // progression
  if (won) {
    c.completed[r.mission] = true;
    if (r.mission === 'defense') { c.pendingAttack = false; if (c.act < 2) { c.act = 2; lines.push('Act 2 — The Rebellion begins.'); } }
    if (r.mission === 'convoy') { c.convoyLevel++; if (Math.random() < 0.35) { c.pendingAttack = true; lines.push('Scouts report: Sycharth will be attacked! Defend it before anything else.'); } }
    if (r.mission === 'raid') lines.push('Prince Hal will want revenge. Sycharth must be defended next.');
    if (r.mission === 'shrewsbury') { c.awaitingEnding = true; c.act = 4; }
  } else if (r.mission === 'defense') {
    // losing the settlement: the Beacon is repaired at a cost
    c.res.wood = Math.max(0, c.res.wood - 80);
    c.res.food = Math.max(0, c.res.food - 60);
    lines.push('Sycharth was sacked: food and timber lost. It must be retaken.');
  }
  if (r.mission === 'endless') c.endlessBest = Math.max(c.endlessBest, r.wavesCleared);
  if (c.instability >= 100) { c.ending = 'collapse'; c.awaitingEnding = false; }
  log(c, `${m.title}: ${won ? 'victory' : 'defeat'}. ${lines.slice(0, 2).join('; ')}.`);
  return { silver, lines };
}

// ---------------------------------------------------------------- prisoners (doc 4.6)
export function prisonerAction(c, idx, action) {
  const p = c.prisoners[idx];
  if (!p) return '';
  let msg = '';
  switch (action) {
    case 'ransom':
      c.res.silver += p.value;
      c.reputation += 2;
      msg = `${p.name} was ransomed for ${p.value} silver.`;
      break;
    case 'interrogate': {
      const intel = p.hero ? 3 : 1;
      c.res.intel += intel;
      c.loyalty = Math.max(0, c.loyalty - 2);
      msg = `${p.name} talked. +${intel} intel.`;
      break;
    }
    case 'recruit': {
      if (Math.random() < (p.hero ? 0.25 : 0.65)) {
        c.lieutenants.push(p.name);
        const sq = c.squads.find((s) => !s.lieutenant);
        if (sq) sq.lieutenant = p.name;
        msg = `${p.name} swears to your cause${sq ? ` and takes command of ${sq.name}` : ''}.`;
      } else msg = `${p.name} refused, and slipped away in the night.`;
      break;
    }
    case 'execute':
      c.executions++;
      c.reputation -= 15;
      c.loyalty = Math.max(0, c.loyalty - 4);
      c.executionBuff = 1;
      msg = `${p.name} was executed. The men are fired up for the next battle; your reputation suffers.`;
      if (p.hero) c.instability = Math.min(100, c.instability + 8);
      break;
  }
  c.prisoners.splice(idx, 1);
  log(c, msg);
  return msg;
}

// ---------------------------------------------------------------- endings (doc section 5)
export function endingOptions(c) {
  const i = c.instability;
  return [
    { id: 'restore', title: 'Restore history', text: 'Let the Lancastrian line continue under a treaty that keeps Wales free in all but name. The future barely notices.', ok: i < 35, need: 'Requires Timeline Instability below 35%' },
    { id: 'crown', title: 'Crown a new king', text: 'Place Harry Hotspur on the throne and Owain Glyndŵr as Prince of an independent Wales. A different, steadier history.', ok: i < 80, need: 'Requires Timeline Instability below 80%' },
    { id: 'usurp', title: 'Take the crown yourself', text: 'Why fix history when you can own it? A king with a rifle. The dark ending.', ok: i >= 50 || c.reputation <= -20, need: 'Requires Instability of 50%+ or a ruthless reputation' },
  ];
}

export const ENDINGS = {
  restore: { title: 'HISTORY RESTORED', text: 'The treaty of Shrewsbury holds. Six centuries later the collapse cascade never begins; nobody remembers the soldier who made sure of it. The Handler goes quiet. Mission complete.' },
  crown: { title: 'A NEW KING', text: 'King Henry Percy rules with a Welsh prince at his side. The future reshapes itself around a stronger, stranger Britain — and holds. The Usurper\'s fracture is sealed.' },
  usurp: { title: 'THE KING WITH A RIFLE', text: 'You are crowned in Westminster with a carbine across your knees. History bends around you until it breaks; the Handler\'s last transmission is static.' },
  collapse: { title: 'TIMELINE COLLAPSE', text: 'Too much of the future bled into the past. The fracture tears open and 1403 unravels. Instability reached 100%.' },
};

export function chooseEnding(c, id) {
  c.ending = id;
  c.awaitingEnding = false;
  log(c, `Ending: ${ENDINGS[id].title}. Endless Siege unlocked.`);
}

export { SQUAD_TYPES, MISSIONS };
