// Battle scenarios. buildMission(sim, config) sets up the armies, objectives and win/lose rules for
// one mission of the campaign (or the quick battle).
//
// config: {
//   mission: 'shrewsbury' | 'raid' | 'convoy' | 'defense' | 'endless' | 'classic',
//   difficulty: 'squire' | 'knight' | 'kingslayer',
//   scale: 'standard' | 'epic'         (Shrewsbury size: ~1,500 or ~3,300 soldiers)
//   instability: 0-100                 (Timeline Instability: handgonnes, rival agents, time storms)
//   fear: 0.35-1                       (how much gunfire still terrifies the enemy)
//   squads: [{ id, name, type, men, vet, lieutenant }]   (the player's own army)
//   moraleBonus, sabotage, convoyLevel, seed
// }
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, TEAM_REBEL, TEAM_CROWN, ORDER_ATTACK_MOVE, ORDER_ATTACK,
  ORDER_FOLLOW, ORDER_HOLD, STATS, CELL_BEACON, ST_ROUT,
} from '../shared/constants.js';
import { garrisonSpots } from '../shared/castle.js';
import { MISSIONS, SQUAD_TYPES } from '../shared/missions.js';

export const SOUTH = 0; // facing +z
export const NORTH = Math.PI; // facing -z
const R = TEAM_REBEL, C = TEAM_CROWN;

// Size of the royal army per difficulty
export const DIFFICULTY = {
  squire: { crown: 0.8, label: 'Squire' },
  knight: { crown: 1.0, label: 'Knight' },
  kingslayer: { crown: 1.2, label: 'Kingslayer' },
};

const FIRST = ['John', 'Thomas', 'Richard', 'William', 'Hugh', 'Robert', 'Walter', 'Ralph', 'Henry', 'Edmund', 'Roger', 'Nicholas', 'Geoffrey', 'Simon'];
const LAST = ['Burnell', 'Grey', 'Stanley', 'Blount', 'Talbot', 'Neville', 'Clifford', 'Despenser', 'Beaumont', 'Lovell', 'Harington', 'Waterton', 'Massey', 'Venables', 'Cokayne'];
const RANKS = { [ARCHER]: ['Vintenar', 40], [SPEAR]: ['Sergeant', 45], [SWORD]: ['Captain', 80], [CAVALRY]: ['Knight', 130], [HERO]: ['Captain', 80] };

function officerFor(sim, reg) {
  const name = `${sim.rng() < 0.5 && reg.type !== ARCHER && reg.type !== SPEAR ? 'Sir ' : ''}${FIRST[(sim.rng() * FIRST.length) | 0]} ${LAST[(sim.rng() * LAST.length) | 0]}`;
  const [rank, value] = RANKS[reg.type] || RANKS[SWORD];
  return sim.assignOfficer(reg, name, rank, Math.round(value * (0.8 + sim.rng() * 0.5)));
}

export function buildMission(sim, cfg = {}) {
  const mission = cfg.mission || 'classic';
  sim.instability = cfg.instability || 0;
  sim.fear = cfg.fear ?? 1;
  const builders = { shrewsbury, classic: shrewsbury, raid, convoy: raid, defense, endless: defense };
  sim.allocate(4800);
  (builders[mission] || shrewsbury)(sim, cfg, mission);
  applyInstability(sim, cfg);
  return sim;
}

// Back-compat for tools: the original battle
export function buildShrewsbury(sim, difficulty = 'knight', scale = 'epic') {
  return buildMission(sim, { mission: 'classic', difficulty, scale });
}

// ---------------------------------------------------------------- the player's own army
function spawnPlayerArmy(sim, cfg, x, z, facing, opts = {}) {
  const regs = [];
  const squads = cfg.squads && cfg.squads.length ? cfg.squads : (opts.defaultSquads || []);
  const spread = 38;
  squads.forEach((sq, k) => {
    const t = SQUAD_TYPES[sq.type] || SQUAD_TYPES.spear;
    const lat = (k - (squads.length - 1) / 2) * spread;
    const rx = Math.cos(facing), rz = -Math.sin(facing);
    const reg = sim.spawnRegiment(R, t.unit, sq.name, sq.men, x + rx * lat, z + rz * lat, facing, { vet: sq.vet || 0 });
    reg.squadId = sq.id ?? null;
    reg.vet = sq.vet || 0;
    reg.lieutenant = sq.lieutenant || null;
    for (const i of reg.members) sim.morale[i] += (cfg.moraleBonus || 0) + 0.08 * reg.vet;
    regs.push(reg);
  });
  if (opts.bodyguard !== false) {
    // The operative's bodyguard follows him and drags him out if he goes down
    const bg = sim.spawnRegiment(R, SWORD, 'Your Bodyguard', 10, opts.px ?? x, (opts.pz ?? z) - 6, facing);
    bg.auto = false;
    bg.formation = 'wedge';
    sim.issueOrder(bg.id, { type: ORDER_FOLLOW });
    regs.push(bg);
  }
  return regs;
}

// ---------------------------------------------------------------- Timeline Instability
function applyInstability(sim, cfg) {
  const inst = cfg.instability || 0;
  const crownArchers = sim.regiments.filter((r) => r.team === C && r.type === ARCHER && !r.garrison);
  if (inst >= 30 && crownArchers.length) {
    // Crude gunpowder: some archer bands field handgonnes (reverse-engineered from captured guns)
    const n = Math.min(crownArchers.length, 1 + Math.floor((inst - 30) / 20));
    for (let k = 0; k < n; k++) {
      crownArchers[k].handgun = true;
      crownArchers[k].name = crownArchers[k].name.replace(/Archers|Bowmen|Longbows/, 'Handgonnes');
      if (!/Handgonne/.test(crownArchers[k].name)) crownArchers[k].name += ' (Handgonnes)';
    }
    sim.scripted.push({ at: 3, fn: (s) => s.events.push({ t: 'msg', text: 'Handler: "They have gunpowder. Crude, but it\'s not 1403 tech. The timeline is fracturing."', big: false }) });
  }
  if (inst >= 60) {
    // Rival time-travellers sent by the Usurper
    const count = 2 + Math.floor((inst - 60) / 15);
    const spawnZ = cfg.mission === 'defense' || cfg.mission === 'endless' ? 40 : 60;
    sim.scripted.push({
      at: 25,
      fn: (s) => {
        const reg = s.spawnRegiment(C, HERO, "The Usurper's Agents", count, 0, spawnZ, NORTH);
        reg.agent = true;
        reg.auto = false;
        for (const i of reg.members) { s.agent[i] = 1; s.hp[i] = s.maxHp[i] = 420; }
        s.events.push({ t: 'newReg', id: reg.id });
        s.events.push({ t: 'msg', text: 'Handler: "Contacts with modern rifles! The Usurper has sent agents after you."', big: true });
      },
    });
  }
}

// ---------------------------------------------------------------- Shrewsbury (field battle + castle)
function shrewsbury(sim, cfg, mission) {
  const k = (DIFFICULTY[cfg.difficulty] || DIFFICULTY.knight).crown * (1 - (cfg.sabotage || 0));
  // Standard size (the design target of ~1,500 soldiers) or the original epic ~3,300
  const size = cfg.scale === 'epic' || (mission === 'classic' && cfg.scale !== 'standard') ? 1 : 0.45;
  const n = (count) => Math.max(8, Math.round(count * k * size));
  const r = (count) => Math.max(8, Math.round(count * size));

  // ---- Rebel alliance (north, the player's side)
  ['I', 'II', 'III', 'IV', 'V'].forEach((name, i) => sim.spawnRegiment(R, ARCHER, `Cheshire Bowmen ${name}`, r(110), -200 + i * 100, -70, SOUTH));
  sim.spawnRegiment(R, SWORD, 'Percy Men-at-Arms I', r(130), -60, -100, SOUTH);
  sim.spawnRegiment(R, SWORD, 'Percy Men-at-Arms II', r(130), 60, -100, SOUTH);
  sim.spawnRegiment(R, SWORD, "Douglas's Scots", r(130), -170, -100, SOUTH);
  sim.spawnRegiment(R, SPEAR, 'Northumbrian Spears', r(120), 170, -100, SOUTH);
  sim.spawnRegiment(R, SPEAR, 'Worcester Spears', r(120), 0, -120, SOUTH);
  sim.spawnRegiment(R, CAVALRY, 'Percy Knights', r(70), -220, -125, SOUTH);
  sim.spawnRegiment(R, HERO, "Hotspur's Household", r(40), 0, -150, SOUTH, { hero: 'Harry Hotspur', guardType: SWORD });
  if (mission !== 'classic' || (cfg.squads && cfg.squads.length)) spawnPlayerArmy(sim, cfg, 70, -140, SOUTH, { px: 24, pz: -158 });

  // ---- Royal army (south, on the rising ground)
  const officers = [];
  ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach((name, i) => officers.push(sim.spawnRegiment(C, ARCHER, `Royal Archers ${name}`, n(105), -200 + i * 80, 95, NORTH)));
  officers.push(sim.spawnRegiment(C, SWORD, "King's Men-at-Arms I", n(170), -120, 120, NORTH));
  officers.push(sim.spawnRegiment(C, SWORD, "King's Men-at-Arms II", n(170), 0, 120, NORTH));
  officers.push(sim.spawnRegiment(C, SWORD, "King's Men-at-Arms III", n(170), 120, 120, NORTH));
  officers.push(sim.spawnRegiment(C, SPEAR, 'Royal Billmen I', n(150), -240, 100, NORTH));
  officers.push(sim.spawnRegiment(C, SPEAR, 'Royal Billmen II', n(150), 210, 100, NORTH));
  sim.spawnRegiment(C, HERO, "Prince Hal's Retinue", n(70), -180, 150, NORTH, { hero: 'Prince Hal', guardType: SWORD });
  officers.push(sim.spawnRegiment(C, CAVALRY, "Stafford's Knights", n(90), -110, 170, NORTH));
  officers.push(sim.spawnRegiment(C, CAVALRY, "Blount's Knights", n(90), 110, 170, NORTH));
  for (const reg of officers) officerFor(sim, reg);
  // Prince Hal (the future Henry V) can be captured instead of killed
  const hal = sim.heroes['Prince Hal'];
  sim.officers[hal] = { name: 'Prince Hal', rank: 'Prince of Wales', value: 800, reg: sim.reg[hal] };

  // ---- The royal castle: King Henry holds the courtyard with his guard, archers man the walls
  const king = sim.spawnRegiment(C, HERO, "King Henry's Guard", n(100), 0, 226, NORTH, { hero: 'King Henry IV', guardType: SWORD });
  const castleW = sim.spawnRegiment(C, SWORD, 'Castle Men-at-Arms (West)', n(50), -24, 220, NORTH);
  const castleE = sim.spawnRegiment(C, SPEAR, 'Castle Men-at-Arms (East)', n(50), 24, 220, NORTH);
  for (const reg of [king, castleW, castleE]) reg.inCastle = true;
  officerFor(sim, castleW); officerFor(sim, castleE);
  sim.spawnGarrison(C, 'Castle Garrison', garrisonSpots(), size < 1 ? 1 : k >= 1.2 ? 3 : 2);

  // ---- What-if: Owain Glyndwr's Welsh arrive from the west mid-battle
  sim.scripted.push({
    at: 120,
    fn: (s) => {
      const x = -285, z = -40, f = Math.PI / 2; // facing east
      const regs = [
        s.spawnRegiment(R, HERO, "Glyndwr's Teulu", r(30), x - 20, z, f, { hero: 'Owain Glyndwr', guardType: SWORD }),
        s.spawnRegiment(R, SPEAR, 'Welsh Spears I', r(120), x, z - 30, f),
        s.spawnRegiment(R, SPEAR, 'Welsh Spears II', r(120), x, z + 30, f),
        s.spawnRegiment(R, ARCHER, 'Gwent Longbows I', r(100), x - 10, z - 70, f),
        s.spawnRegiment(R, ARCHER, 'Gwent Longbows II', r(100), x - 10, z + 70, f),
      ];
      for (const reg of regs) {
        s.issueOrder(reg.id, { type: ORDER_ATTACK_MOVE, x: reg.anchorX + 80, z: reg.anchorZ });
        s.events.push({ t: 'newReg', id: reg.id });
      }
      s.events.push({ t: 'msg', text: 'Owain Glyndwr has arrived from the west with the Welsh host!', big: true });
    },
  });
}

// ---------------------------------------------------------------- Raid (Act 1) and repeatable convoys
function raid(sim, cfg, mission) {
  const k = (DIFFICULTY[cfg.difficulty] || DIFFICULTY.knight).crown * (1 - (cfg.sabotage || 0));
  const lvl = mission === 'convoy' ? 0.85 + 0.15 * (cfg.convoyLevel || 0) : 0.72;
  const n = (count) => Math.max(6, Math.round(count * k * lvl));
  const m = MISSIONS[mission];
  spawnPlayerArmy(sim, cfg, 0, -60, SOUTH, {
    px: m.spawn.x, pz: m.spawn.z,
    defaultSquads: [
      { name: 'Welsh Levies', type: 'spear', men: 45 },
      { name: 'Gwent Bowmen', type: 'archer', men: 35 },
      { name: 'Teulu Swords', type: 'sword', men: 30 },
    ],
  });
  const cz = mission === 'convoy' ? 50 : 45;
  const regs = [
    sim.spawnRegiment(C, ARCHER, 'Camp Archers', n(40), -30, cz + 20, NORTH),
    sim.spawnRegiment(C, ARCHER, 'Camp Archers II', n(35), 40, cz + 22, NORTH),
    sim.spawnRegiment(C, SWORD, 'Camp Guard', n(40), -20, cz, NORTH),
    sim.spawnRegiment(C, SWORD, 'Pay-chest Guard', n(35), 25, cz - 2, NORTH),
    sim.spawnRegiment(C, SPEAR, 'Billmen', n(40), 75, cz + 5, NORTH),
    sim.spawnRegiment(C, CAVALRY, 'Mounted Escort', n(18), -80, cz + 35, NORTH),
  ];
  if (mission === 'convoy' && (cfg.convoyLevel || 0) >= 2) regs.push(sim.spawnRegiment(C, SWORD, 'Escort Reinforcements', n(50), 0, cz + 45, NORTH));
  for (const reg of regs) officerFor(sim, reg);
  let initial = 0;
  for (const reg of regs) initial += reg.initial;
  const rebelRegs = sim.regiments.filter((r) => r.team === R);
  sim.mission = {
    name: mission,
    check(s) {
      if (s.time < 5) return null;
      let crown = 0, rebels = 0, rebelInit = 0;
      for (const r of s.regiments) {
        if (r.team === C && !r.agent) crown += r.alive - r.routing;
        if (r.team === R) { rebels += r.alive - r.routing; rebelInit += r.initial; }
      }
      s.objectives = { field: crown / Math.max(1, initial), assault: false, open: false, gate: 1, mission };
      if (crown / initial < 0.15) return { outcome: 'victory', text: mission === 'convoy' ? 'The convoy is yours. Its silver is already on its way to the future.' : 'The royal camp is taken. The Handler is collecting the silver.' };
      if (rebels / Math.max(1, rebelInit) < 0.1) return { outcome: 'defeat', text: 'Your warband has been cut to pieces.' };
      return null;
    },
  };
  void rebelRegs;
}

// ---------------------------------------------------------------- Settlement defense and Endless Siege
function defense(sim, cfg, mission) {
  const k = (DIFFICULTY[cfg.difficulty] || DIFFICULTY.knight).crown * (1 - (cfg.sabotage || 0));
  const m = MISSIONS[mission];
  const b = m.beacon;
  sim.beacon = sim.nav.setCell(b.x, b.z, CELL_BEACON, 3200);
  sim.beaconMax = 3200;
  spawnPlayerArmy(sim, cfg, 10, -150, SOUTH, {
    px: m.spawn.x, pz: m.spawn.z,
    defaultSquads: [{ name: 'Welsh Levies', type: 'spear', men: 40 }, { name: 'Gwent Bowmen', type: 'archer', men: 30 }],
  });
  // The settlement's own militia always turns out
  sim.spawnRegiment(R, SPEAR, 'Sycharth Militia', 35, -30, -165, SOUTH);
  sim.supplies = 420; // palisade timber laid in for the siege
  const endless = mission === 'endless';
  const waves = endless ? null : [
    { at: 8, units: [[SWORD, 35, -40], [SWORD, 35, 40], [ARCHER, 30, 0]] },
    { at: 80, units: [[SPEAR, 40, -60], [SWORD, 40, 0], [ARCHER, 30, 60], [CAVALRY, 15, -110]] },
    { at: 150, units: [[SWORD, 50, -40], [SPEAR, 40, 40], [CAVALRY, 25, 110], [ARCHER, 40, 0], [HERO, 30, 0]] },
  ];
  const state = { wave: 0, spawned: 0, regs: [], nextAt: 8, cleared: 0 };
  const spawnWave = (s, units, label) => {
    const z = 10 + s.rng() * 20;
    for (const [type, count, x] of units) {
      const isHero = type === HERO;
      const name = isHero ? "Prince Hal's Captain" : `${label} ${['Archers', 'Men-at-Arms', 'Billmen', 'Riders'][[ARCHER, SWORD, SPEAR, CAVALRY].indexOf(type)]}`;
      const reg = s.spawnRegiment(C, isHero ? HERO : type, name, Math.max(6, Math.round(count * k)), x, z + (type === ARCHER ? 25 : type === CAVALRY ? 30 : 0), NORTH, isHero ? { guardType: SWORD } : {});
      reg.auto = false;
      reg.wave = true;
      officerFor(s, reg);
      state.regs.push(reg);
      s.events.push({ t: 'newReg', id: reg.id });
    }
  };
  const nearestRebel = (s, reg, within) => {
    let best = within, bestR = null;
    for (const o of s.regiments) {
      if (o.team !== R || o.alive - o.routing <= 0) continue;
      const d = Math.hypot(o.cx - reg.cx, o.cz - reg.cz);
      if (d < best) { best = d; bestR = o; }
    }
    return bestR;
  };
  let orderT = 0;
  sim.mission = {
    name: mission,
    state,
    update(s, dt) {
      // spawn waves
      if (endless) {
        if (s.time >= state.nextAt) {
          state.wave++;
          const g = 1 + (state.wave - 1) * 0.22;
          const units = [[SWORD, 30 * g, -40], [SPEAR, 30 * g, 40], [ARCHER, 25 * g, 0]];
          if (state.wave >= 3) units.push([CAVALRY, 10 * g, state.wave % 2 ? -110 : 110]);
          if (state.wave % 4 === 0) units.push([HERO, 20 * g, 0]);
          spawnWave(s, units, `Wave ${state.wave}`);
          s.events.push({ t: 'wave', n: state.wave });
          state.nextAt = s.time + Math.max(45, 75 - state.wave * 2);
        }
      } else if (state.wave < waves.length && s.time >= waves[state.wave].at) {
        spawnWave(s, waves[state.wave].units, ['First', 'Second', 'Final'][state.wave] + ' wave');
        state.wave++;
        s.events.push({ t: 'wave', n: state.wave, of: waves.length });
      }
      // wave AI: go for the Beacon, fighting anyone in the way
      orderT -= dt;
      if (orderT > 0) return;
      orderT = 2;
      for (const reg of state.regs) {
        if (reg.alive - reg.routing <= 0) continue;
        if (reg.type === ARCHER) {
          const t = nearestRebel(s, reg, STATS[ARCHER].bowRange * 0.8);
          if (t) { if (reg.order.type !== ORDER_HOLD) s.issueOrder(reg.id, { type: ORDER_HOLD }); continue; }
          s.issueOrder(reg.id, { type: ORDER_ATTACK_MOVE, x: b.x, z: b.z + 90 });
          continue;
        }
        const foe = nearestRebel(s, reg, 35);
        if (foe) { if (reg.order.target !== foe.id) s.issueOrder(reg.id, { type: ORDER_ATTACK, target: foe.id }); }
        else if (reg.order.type !== ORDER_ATTACK_MOVE || Math.hypot(reg.order.x - b.x, reg.order.z - b.z) > 2) {
          s.issueOrder(reg.id, { type: ORDER_ATTACK_MOVE, x: b.x, z: b.z });
        }
      }
    },
    check(s) {
      let attackers = 0;
      for (const reg of state.regs) attackers += reg.alive - reg.routing;
      let rebels = 0, rebelInit = 0;
      for (const r of s.regiments) if (r.team === R) { rebels += r.alive - r.routing; rebelInit += r.initial; }
      const beaconHp = Math.max(0, s.nav.fortHp[s.beacon]);
      const beaconUp = s.nav.blocked[s.beacon] === CELL_BEACON;
      s.objectives = { field: 1, assault: false, open: false, gate: 1, mission, wave: state.wave, waves: waves ? waves.length : null, beacon: beaconUp ? beaconHp / s.beaconMax : 0, attackers };
      if (endless && attackers === 0 && state.wave > state.cleared) { state.cleared = state.wave; s.events.push({ t: 'waveCleared', n: state.wave }); }
      if (!beaconUp) return { outcome: 'defeat', text: endless ? `The Beacon has fallen after ${state.wave - 1} waves.` : 'The Temporal Beacon has been destroyed. Sycharth burns.' };
      if (s.time > 20 && rebels / Math.max(1, rebelInit) < 0.08) return { outcome: 'defeat', text: 'The defenders of Sycharth have been overwhelmed.' };
      if (!endless && state.wave >= waves.length && attackers === 0) return { outcome: 'victory', text: 'Sycharth holds. Prince Hal\'s riders are scattered.' };
      return null;
    },
  };
  void ST_ROUT;
}
