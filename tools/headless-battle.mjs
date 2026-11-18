// Runs a full battle without rendering: a smoke test for the AI and a performance benchmark.
//   node tools/headless-battle.mjs           full battle (up to 10 simulated minutes)
//   node tools/headless-battle.mjs --quick   60 simulated seconds, asserts sanity
//   node tools/headless-battle.mjs --siege   wipe out the royal field army and check the rebels storm the castle
import { Sim } from '../src/sim/sim.js';
import { buildMission } from '../src/sim/scenario.js';
import { SIM_DT, TEAM_REBEL, TEAM_CROWN } from '../src/shared/constants.js';

const quick = process.argv.includes('--quick');
const siege = process.argv.includes('--siege');
const missionArg = process.argv.find((a) => a.startsWith('--mission='));
const mission = missionArg ? missionArg.split('=')[1] : 'classic';
const instArg = process.argv.find((a) => a.startsWith('--instability='));
const maxSeconds = quick ? 60 : 600;
const sim = buildMission(new Sim(1403), { mission, difficulty: 'knight', instability: instArg ? +instArg.split('=')[1] : 0 });
if (siege) {
  // As if the player had already broken the field army
  for (const r of sim.regiments) {
    if (r.team !== TEAM_CROWN || r.garrison || r.inCastle) continue;
    for (const i of r.members) sim.kill(i, 'player');
  }
}
console.log(`Spawned ${sim.n} soldiers in ${sim.regiments.length} regiments`);

let worst = 0, total = 0, ticks = 0;
const counts = {};
sim.player.alive = true; sim.player.x = 6; sim.player.z = -78; // a stand-in operative for agents to hunt
const t0 = performance.now();
let lastReport = 0;
while (sim.time < maxSeconds && !sim.outcome) {
  const a = performance.now();
  sim.step(SIM_DT);
  const ms = performance.now() - a;
  total += ms; ticks++;
  if (ms > worst) worst = ms;
  for (const e of sim.drainEvents()) {
    if (e.t === 'cellGone') console.log(`  [${sim.time.toFixed(1)}s] castle cell destroyed (type ${e.type})`);
    if (e.t === 'wave' || e.t === 'officerDown' || e.t === 'agentShot' && e.hit || e.t === 'storm') counts[e.t] = (counts[e.t] || 0) + 1;
    if (e.t === 'msg' || e.t === 'heroDeath' || e.t === 'outcome') console.log(`  [${sim.time.toFixed(1)}s] ${e.t}: ${e.text || e.name || ''}`);
  }
  if (sim.time - lastReport >= 20) {
    lastReport = sim.time;
    const alive = [0, 0], rout = [0, 0];
    for (const r of sim.regiments) { alive[r.team] += r.alive; rout[r.team] += r.routing; }
    console.log(`t=${sim.time.toFixed(0)}s rebels ${alive[0]} (${rout[0]} routing)  crown ${alive[1]} (${rout[1]} routing)  arrows ${sim.arrowCount}  avg tick ${(total / ticks).toFixed(2)}ms`);
  }
}
const wall = (performance.now() - t0) / 1000;
console.log(`\nSimulated ${sim.time.toFixed(1)}s in ${wall.toFixed(1)}s wall (${(sim.time / wall).toFixed(1)}x realtime)`);
console.log(`Tick cost: avg ${(total / ticks).toFixed(2)}ms, worst ${worst.toFixed(2)}ms (budget ${(SIM_DT * 1000).toFixed(0)}ms)`);
console.log('Events:', JSON.stringify(counts));
console.log(`Outcome: ${sim.outcome || 'undecided'}  kills: rebels ${sim.stats.kills[TEAM_REBEL]}, crown ${sim.stats.kills[TEAM_CROWN]}  fled ${sim.stats.fled}  defectors ${sim.stats.defectors}`);

if (siege && sim.outcome !== 'victory') { console.error('Siege test failed: the rebels did not take the castle'); process.exit(1); }
if (quick) {
  const deaths = sim.stats.kills[0] + sim.stats.kills[1];
  const ok = deaths > 0 && total / ticks < SIM_DT * 1000;
  for (let i = 0; i < sim.n; i++) {
    if (!Number.isFinite(sim.x[i]) || !Number.isFinite(sim.z[i])) { console.error('NaN position for unit', i); process.exit(1); }
  }
  if (!ok) { console.error('Sanity check failed'); process.exit(1); }
  console.log('OK');
}
