// Balance report: runs each mission AI-vs-AI (no operative) over several seeds and reports
// who dies faster. Used to tune army sizes and quality.
//   node tools/balance.mjs [mission ...]
import { Sim } from '../src/sim/sim.js';
import { buildMission } from '../src/sim/scenario.js';
import { SIM_DT, TEAM_REBEL, TEAM_CROWN } from '../src/shared/constants.js';

const missions = process.argv.slice(2).length ? process.argv.slice(2) : ['raid', 'convoy', 'defense', 'shrewsbury'];
const squads = [ // a typical early-campaign army
  { id: 1, name: 'Welsh Levies', type: 'spear', men: 40 },
  { id: 2, name: 'Gwent Bowmen', type: 'archer', men: 32 },
  { id: 3, name: 'Teulu Blades', type: 'sword', men: 32 },
];
for (const mission of missions) {
  let rDead = 0, cDead = 0, wins = 0, rStart = 0, cStart = 0, t = 0;
  const seeds = 5;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = buildMission(new Sim(seed * 131), { mission, difficulty: 'knight', squads: mission === 'shrewsbury' ? [] : squads });
    const limit = mission === 'shrewsbury' ? 240 : 300;
    let snapshot = null;
    while (sim.time < limit && !sim.outcome) {
      sim.step(SIM_DT);
      if (!snapshot && sim.time > 10) {
        snapshot = true;
        for (const r of sim.regiments) { if (r.team === TEAM_REBEL) rStart += r.initial; else if (!r.garrison && !r.inCastle) cStart += r.initial; }
      }
    }
    sim.drainEvents();
    rDead += sim.stats.kills[TEAM_CROWN]; cDead += sim.stats.kills[TEAM_REBEL];
    if (sim.outcome === 'victory') wins++;
    t += sim.time;
  }
  console.log(`${mission.padEnd(11)} armies ${Math.round(rStart / seeds)} vs ${Math.round(cStart / seeds)} | rebel dead ${Math.round(rDead / seeds)}  royal dead ${Math.round(cDead / seeds)} | royal dead per rebel dead ${(cDead / Math.max(1, rDead)).toFixed(2)} | AI-only wins ${wins}/${seeds} | avg ${Math.round(t / seeds)}s`);
}
