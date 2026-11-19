// Campaign state and rules: settlement, economy, the Depot (the Handler's shop), army roster,
// prisoners, Timeline Instability and endings. Saved in the browser (localStorage).
import { MISSIONS, SQUAD_TYPES, TRAITS, traitFor, traitDesc } from '../shared/missions.js';

const SAVE_KEY = 'timefall.campaign.v1';

// ---------------------------------------------------------------- the Depot (shop) catalogue
// Tiers are unlocked by upgrading the Temporal Beacon. Instability: how much using it fractures time.
export const ITEMS = {
  pistol: { kind: 'gun', tier: 1, price: 0, name: 'Service Pistol', desc: 'Reliable sidearm. Drops peasants; plate shrugs it off.', inst: 0.01 },
  shotgun: { kind: 'gun', tier: 1, price: 150, name: 'Combat Shotgun', desc: 'Devastating up close.', inst: 0.03 },
  crossbow: { kind: 'gun', tier: 1, price: 120, name: 'Steel Crossbow', desc: 'Silent and period-correct: punches mail, never frightens the enemy, never cracks the timeline.', inst: 0 },
  rifle: { kind: 'gun', tier: 2, price: 300, name: 'Assault Rifle', desc: 'High caliber, full auto. Punches through plate.', inst: 0.02 },
  sniper: { kind: 'gun', tier: 2, price: 350, name: 'Sniper Rifle', desc: 'Picks off officers from 300 m. Scoped.', inst: 0.12 },
  smg: { kind: 'gun', tier: 2, price: 260, name: 'Submachine Gun', desc: 'A hose of light rounds. Shreds levies and archers; bounces off plate.', inst: 0.01 },
  c4: { kind: 'stock', tier: 2, price: 45, name: 'Breaching Charge', desc: 'C4 for gates and walls. Bought singly.', max: 6, inst: 1.5 },
  supply: { kind: 'stock', tier: 2, price: 50, name: 'Supply Drop', desc: 'Call in an ammo crate where you aim.', max: 5, inst: 1 },
  launcher: { kind: 'gun', tier: 3, price: 450, name: 'Grenade Launcher', desc: 'Area denial. Medieval armies break and run.', inst: 1 },
  suv: { kind: 'vehicle', tier: 3, price: 500, name: 'Armoured SUV', desc: 'Ram formations, resupply from the roof rack.', inst: 2 },
  gunship: { kind: 'stock', tier: 4, price: 260, name: 'Gunship Support', desc: '30 seconds of attack helicopter overhead.', max: 3, inst: 5 },
  airstrike: { kind: 'stock', tier: 4, price: 320, name: 'Airstrike', desc: 'A line of bombs on your mark.', max: 3, inst: 6 },
  rpg: { kind: 'gun', tier: 4, price: 600, name: 'Rocket Launcher', desc: 'One rocket, one breach: blows castle walls and gates open. Seven rockets a battle.', inst: 2 },
};
export const GUN_IDS = ['pistol', 'crossbow', 'shotgun', 'smg', 'rifle', 'sniper', 'launcher', 'rpg'];

// ---------------------------------------------------------------- settlement buildings
export const BUILDINGS = {
  beacon: { name: 'Temporal Beacon', desc: 'Your link to the future. Upgrade it to unlock better Depot tiers.', unique: true, r: 30 },
  house: { name: 'House', desc: '+40 population (army size cap).', cost: { wood: 40 }, r: 22 },
  farm: { name: 'Farm', desc: '+45 food after every mission.', cost: { wood: 50 }, r: 30 },
  mill: { name: 'Lumber Mill', desc: '+45 wood after every mission.', cost: { wood: 40, food: 20 }, r: 26 },
  barracks: { name: 'Barracks', desc: 'Recruit squads. A second barracks trains cavalry.', cost: { wood: 80, food: 40 }, r: 30 },
};
export const BEACON_UPGRADES = [null, null, { silver: 250, wood: 60 }, { silver: 500, wood: 120 }, { silver: 900, wood: 200 }];

// ---------------------------------------------------------------- the operative: XP and skills (doc 4.8)
// Each level grants a skill point; each class has three ranks, bought in order.
export const SKILLS = {
  marksman: { name: 'Marksman', icon: '⌖', ranks: ['+15% gun damage', 'Reload 25% faster (stowed guns too)', 'Headshots deal 3.5× damage (from 2.5×)'] },
  commander: { name: 'Commander', icon: '⚑', ranks: ['Your squads start every battle with higher morale', 'A bodyguard of 16 men (from 10)', 'Command view slows time to 10% (from 20%)'] },
  engineer: { name: 'Engineer', icon: '⚙', ranks: ['+2 free breaching charges every mission', 'Modern gear causes 25% less Timeline Instability', '+150 palisade supplies in every battle'] },
  juggernaut: { name: 'Juggernaut', icon: '⛨', ranks: ['+30% health', 'Sledgehammer swings 40% faster and staggers up to 5 men', 'Take 15% less damage; bleed out in 30 s (from 18 s)'] },
};
export const xpToReach = (level) => 150 * (level - 1) * level; // L2 300, L3 900, L4 1800, L5 3000…

export function ensureHero(c) {
  if (!c.hero) c.hero = { xp: 0, level: 1, points: 0, skills: {} };
  return c.hero;
}

// Gain XP; returns the number of levels gained
export function gainXp(c, xp) {
  const h = ensureHero(c);
  h.xp += Math.round(xp);
  let ups = 0;
  while (h.xp >= xpToReach(h.level + 1)) { h.level++; h.points++; ups++; }
  return ups;
}

export function buySkill(c, id) {
  const h = ensureHero(c);
  const r = h.skills[id] || 0;
  if (h.points <= 0 || r >= SKILLS[id].ranks.length) return false;
  h.skills[id] = r + 1;
  h.points--;
  log(c, `The operative trained: ${SKILLS[id].name} rank ${r + 1} (${SKILLS[id].ranks[r]}).`);
  return true;
}

// Everything the skills change in battle
export function heroPerks(c) {
  const sk = (c && c.hero && c.hero.skills) || {};
  const m = sk.marksman || 0, cm = sk.commander || 0, e = sk.engineer || 0, j = sk.juggernaut || 0;
  return {
    player: {
      gunDmg: m >= 1 ? 1.15 : 1, reload: m >= 2 ? 0.75 : 1, head: m >= 3 ? 3.5 : 2.5,
      hammerCd: j >= 2 ? 0.66 : 1.1, hammerMax: j >= 2 ? 5 : 3, bleed: j >= 3 ? 30 : 18, block: 0.12,
    },
    maxHp: j >= 1 ? 1.3 : 1, damageTaken: j >= 3 ? 0.85 : 1,
    moraleBonus: cm >= 1 ? 0.1 : 0, bodyguard: cm >= 2 ? 16 : 10, timeScale: cm >= 3 ? 0.1 : 0.2,
    c4Bonus: e >= 1 ? 2 : 0, techMul: e >= 2 ? 0.75 : 1, supplyBonus: e >= 3 ? 150 : 0,
  };
}

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
      { id: 2, name: 'Gwent Bowmen', type: 'archer', men: 32, vet: 0, battles: 0 },
      { id: 3, name: 'Teulu Blades', type: 'sword', men: 32, vet: 0, battles: 0 },
    ],
    nextSquad: 4,
    prisoners: [],
    lieutenants: [],
    reputation: 0, loyalty: 70, executions: 0, executionBuff: 0,
    instability: 5, fear: 1,
    ending: null, awaitingEnding: false,
    endlessBest: 0,
    hero: { xp: 0, level: 1, points: 0, skills: {} },
    log: ['You arrive in the Welsh March, 1403. The Handler\'s voice crackles in your ear: "The Usurper has broken history. Let\'s see what we can save."'],
  };
}

export function loadCampaign() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    const c = JSON.parse(s);
    ensureHero(c); // saves from before hero XP
    return c;
  } catch { return null; }
}
export function saveCampaign(c) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}
export function clearCampaign() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- economy helpers
export const count = (c, type) => c.buildings.filter((b) => b.type === type).length;
export const popCap = (c) => 100 + count(c, 'house') * 40;
export const armySize = (c) => c.squads.reduce((a, s) => a + s.men, 0);
export const canAfford = (c, cost) => Object.entries(cost).every(([k, v]) => (c.res[k] || 0) >= v);
export function pay(c, cost) { for (const [k, v] of Object.entries(cost)) c.res[k] -= v; }
export const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');
export function production(c) {
  return { food: 20 + count(c, 'farm') * 45, wood: 20 + count(c, 'mill') * 45 };
}

// Refill a squad back to full strength (keeps its name, veterancy and lieutenant)
export function reinforceCost(s) {
  const t = SQUAD_TYPES[s.type];
  const missing = Math.max(0, t.men - s.men);
  return { missing, cost: { food: Math.ceil(missing * t.food / t.men * 0.8), wood: Math.ceil(missing * t.wood / t.men * 0.5) } };
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
    moraleBonus: (c.executionBuff ? 0.15 : 0) + heroPerks(c).moraleBonus,
    bodyguard: heroPerks(c).bodyguard,
    supplyBonus: heroPerks(c).supplyBonus,
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
  let returned = 0;
  for (const s of c.squads) {
    if (r.squadsAlive[s.id] === undefined) continue;
    const before = s.men;
    const alive = r.squadsAlive[s.id];
    // Many of the fallen were only wounded: they recover and rejoin (more if you held the field)
    const back = Math.round((before - alive) * (won ? 0.45 : 0.2));
    s.men = Math.min(before, alive + back);
    returned += back;
    s.battles = (s.battles || 0) + 1;
    if (won && s.men > 0 && s.vet < 3 && s.battles % 2 === 0) { s.vet++; lines.push(`${s.name} are now veterans (level ${s.vet})`); }
    if (before - s.men > 0) lines.push(`${s.name}: ${before - s.men} lost`);
  }
  if (returned) lines.push(`${returned} wounded soldiers recovered and rejoined their squads`);
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
  // Timeline Instability (Sappers and Handgonners carry future gear into every battle)
  let dInst = r.instabilityGain;
  const hybrid = c.squads.reduce((a, s) => a + (r.squadsAlive[s.id] !== undefined ? SQUAD_TYPES[s.type].inst || 0 : 0), 0);
  if (hybrid) { dInst += hybrid; lines.push(`Future-equipped squads: +${hybrid.toFixed(1)}% instability`); }
  if (!r.highTech && !hybrid) dInst -= 4; // a light touch lets history heal a little
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
  // The operative's experience
  const xp = r.kills * 4 + r.prisoners.length * 50 + (won ? 150 : 50) + (r.mission === 'endless' ? r.wavesCleared * 40 : 0) + (won && r.mission === 'shrewsbury' ? 250 : 0);
  const ups = gainXp(c, xp);
  lines.push(`+${xp} XP${ups ? ` · LEVEL UP! The operative is now level ${c.hero.level}. Spend skill points in the Operative tab.` : ''}`);
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
        const style = { aggressive: 'He fights aggressively.', defensive: 'A cautious, defensive commander.', flanker: 'He likes to strike from the flank.' }[traitFor(p.name)];
        msg = `${p.name} swears to your cause${sq ? ` and takes command of ${sq.name}` : ''}. ${style}`;
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

// Move a lieutenant to another squad (or relieve him: squadId null)
export function assignLieutenant(c, name, squadId) {
  for (const s of c.squads) if (s.lieutenant === name) s.lieutenant = null;
  const sq = c.squads.find((s) => s.id === squadId);
  if (sq) { sq.lieutenant = name; log(c, `${name} now commands ${sq.name}.`); }
}

export { SQUAD_TYPES, MISSIONS, TRAITS, traitFor, traitDesc };
