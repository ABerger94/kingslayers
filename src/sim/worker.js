// Simulation thread. Owns the authoritative battle state and streams snapshots to the main thread,
// which only renders, runs the player's weapons, and forwards commands. Keeping the AI off the main
// thread means thousands of soldiers never cost the renderer a frame.
import { Sim } from './sim.js';
import { buildShrewsbury } from './scenario.js';
import { SIM_DT } from '../shared/constants.js';

let sim = null;
let timeScale = 1;
let paused = false;
let acc = 0;
let last = 0;
let tickCount = 0;
let simMs = 0;

function start(seed) {
  sim = buildShrewsbury(new Sim(seed));
  last = performance.now();
  postMessage({ t: 'ready', n: sim.n, regiments: sim.regimentSummary() });
  setInterval(loop, 1000 / 60);
}

function loop() {
  const now = performance.now();
  let real = (now - last) / 1000;
  last = now;
  if (real > 0.25) real = 0.25;
  if (paused) return;
  acc += real * timeScale;
  let stepped = false;
  while (acc >= SIM_DT) {
    const a = performance.now();
    sim.step(SIM_DT);
    simMs = simMs * 0.95 + (performance.now() - a) * 0.05;
    acc -= SIM_DT;
    stepped = true;
    tickCount++;
  }
  if (!stepped) return;
  const snap = sim.snapshot();
  const arrows = sim.arrowSnapshot();
  const msg = {
    t: 'snap',
    time: sim.time,
    snap, arrows,
    events: sim.drainEvents(),
    supplies: sim.supplies,
    strength: sim.teamStrength,
    stats: sim.stats,
    simMs,
  };
  if (tickCount % 5 === 0) msg.regiments = sim.regimentSummary();
  postMessage(msg, [snap.buffer, arrows.buffer]);
}

onmessage = (e) => {
  const m = e.data;
  switch (m.t) {
    case 'start': start(m.seed ?? 1403); break;
    case 'player': if (sim) Object.assign(sim.player, m.p); break;
    case 'damage':
      for (let k = 0; k < m.hits.length; k += 2) sim.damageUnit(m.hits[k], m.hits[k + 1], m.source || 'gun');
      break;
    case 'explode': sim.explode(m.x, m.z, m.r, m.dmg); break;
    case 'order':
      for (const id of m.regs) {
        sim.setAuto(id, false);
        sim.issueOrder(id, m.order);
      }
      break;
    case 'auto': for (const id of m.regs) sim.setAuto(id, true); break;
    case 'palisade': {
      const res = sim.buildPalisade(m.x0, m.z0, m.x1, m.z1);
      if (!res.ok) sim.events.push({ t: 'msg', text: `Cannot build: ${res.reason}` });
      break;
    }
    case 'timescale': timeScale = m.v; break;
    case 'pause': paused = m.v; last = performance.now(); break;
  }
};
