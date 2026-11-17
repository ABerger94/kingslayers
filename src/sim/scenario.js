// Battle of Shrewsbury, 21 July 1403 - with one anachronistic addition.
// Historically Hotspur's rebels lost and Owain Glyndwr never arrived. Here, he might.
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, TEAM_REBEL, TEAM_CROWN, ORDER_ATTACK_MOVE,
} from '../shared/constants.js';
import { garrisonSpots } from '../shared/castle.js';

// Size of the royal army per difficulty
export const DIFFICULTY = {
  squire: { crown: 0.8, label: 'Squire' },
  knight: { crown: 1.0, label: 'Knight' },
  kingslayer: { crown: 1.2, label: 'Kingslayer' },
};

export const SOUTH = 0; // facing +z
export const NORTH = Math.PI; // facing -z

export function buildShrewsbury(sim, difficulty = 'knight') {
  sim.allocate(4600);
  const R = TEAM_REBEL, C = TEAM_CROWN;
  const k = (DIFFICULTY[difficulty] || DIFFICULTY.knight).crown;
  const n = (count) => Math.round(count * k);

  // ---- Rebel alliance (north, the player's side)
  ['I', 'II', 'III', 'IV', 'V'].forEach((n, k) => sim.spawnRegiment(R, ARCHER, `Cheshire Bowmen ${n}`, 110, -200 + k * 100, -70, SOUTH));
  sim.spawnRegiment(R, SWORD, 'Percy Men-at-Arms I', 130, -60, -100, SOUTH);
  sim.spawnRegiment(R, SWORD, 'Percy Men-at-Arms II', 130, 60, -100, SOUTH);
  sim.spawnRegiment(R, SWORD, "Douglas's Scots", 130, -170, -100, SOUTH);
  sim.spawnRegiment(R, SPEAR, 'Northumbrian Spears', 120, 170, -100, SOUTH);
  sim.spawnRegiment(R, SPEAR, 'Worcester Spears', 120, 0, -120, SOUTH);
  sim.spawnRegiment(R, CAVALRY, 'Percy Knights', 70, -220, -125, SOUTH);
  sim.spawnRegiment(R, HERO, "Hotspur's Household", 40, 0, -150, SOUTH, { hero: 'Harry Hotspur', guardType: SWORD });

  // ---- Royal army (south, on the rising ground)
  ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach((name, i) => sim.spawnRegiment(C, ARCHER, `Royal Archers ${name}`, n(105), -200 + i * 80, 95, NORTH));
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms I", n(170), -120, 120, NORTH);
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms II", n(170), 0, 120, NORTH);
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms III", n(170), 120, 120, NORTH);
  sim.spawnRegiment(C, SPEAR, 'Royal Billmen I', n(150), -240, 100, NORTH);
  sim.spawnRegiment(C, SPEAR, 'Royal Billmen II', n(150), 210, 100, NORTH);
  sim.spawnRegiment(C, HERO, "Prince Hal's Retinue", n(70), -180, 150, NORTH, { hero: 'Prince Hal', guardType: SWORD });
  sim.spawnRegiment(C, CAVALRY, "Stafford's Knights", n(90), -110, 170, NORTH);
  sim.spawnRegiment(C, CAVALRY, "Blount's Knights", n(90), 110, 170, NORTH);

  // ---- The royal castle: King Henry holds the courtyard with his guard, archers man the walls
  const king = sim.spawnRegiment(C, HERO, "King Henry's Guard", n(100), 0, 226, NORTH, { hero: 'King Henry IV', guardType: SWORD });
  const castleW = sim.spawnRegiment(C, SWORD, 'Castle Men-at-Arms (West)', n(50), -24, 220, NORTH);
  const castleE = sim.spawnRegiment(C, SPEAR, 'Castle Men-at-Arms (East)', n(50), 24, 220, NORTH);
  for (const r of [king, castleW, castleE]) r.inCastle = true;
  sim.spawnGarrison(C, 'Castle Garrison', garrisonSpots(), k >= 1.2 ? 3 : 2);

  // ---- What-if: Owain Glyndwr's Welsh arrive from the west mid-battle
  sim.scripted.push({
    at: 120,
    fn: (s) => {
      const x = -285, z = -40, f = Math.PI / 2; // facing east
      const regs = [
        s.spawnRegiment(R, HERO, "Glyndwr's Teulu", 30, x - 20, z, f, { hero: 'Owain Glyndwr', guardType: SWORD }),
        s.spawnRegiment(R, SPEAR, 'Welsh Spears I', 120, x, z - 30, f),
        s.spawnRegiment(R, SPEAR, 'Welsh Spears II', 120, x, z + 30, f),
        s.spawnRegiment(R, ARCHER, 'Gwent Longbows I', 100, x - 10, z - 70, f),
        s.spawnRegiment(R, ARCHER, 'Gwent Longbows II', 100, x - 10, z + 70, f),
      ];
      for (const r of regs) {
        s.issueOrder(r.id, { type: ORDER_ATTACK_MOVE, x: r.anchorX + 80, z: r.anchorZ });
        s.events.push({ t: 'newReg', id: r.id });
      }
      s.events.push({ t: 'msg', text: 'Owain Glyndwr has arrived from the west with the Welsh host!', big: true });
    },
  });
  return sim;
}
