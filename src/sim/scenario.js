// Battle of Shrewsbury, 21 July 1403 - with one anachronistic addition.
// Historically Hotspur's rebels lost and Owain Glyndwr never arrived. Here, he might.
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, TEAM_REBEL, TEAM_CROWN, ORDER_ATTACK_MOVE,
} from '../shared/constants.js';

export const SOUTH = 0; // facing +z
export const NORTH = Math.PI; // facing -z

export function buildShrewsbury(sim) {
  sim.allocate(4200);
  const R = TEAM_REBEL, C = TEAM_CROWN;

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
  ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach((n, k) => sim.spawnRegiment(C, ARCHER, `Royal Archers ${n}`, 105, -200 + k * 80, 95, NORTH));
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms I", 170, -120, 115, NORTH);
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms II", 170, 0, 115, NORTH);
  sim.spawnRegiment(C, SWORD, "King's Men-at-Arms III", 170, 120, 115, NORTH);
  sim.spawnRegiment(C, SPEAR, 'Royal Billmen I', 150, -240, 100, NORTH);
  sim.spawnRegiment(C, SPEAR, 'Royal Billmen II', 150, 210, 100, NORTH);
  sim.spawnRegiment(C, HERO, "Prince Hal's Retinue", 70, -180, 145, NORTH, { hero: 'Prince Hal', guardType: SWORD });
  sim.spawnRegiment(C, CAVALRY, "Stafford's Knights", 90, -110, 165, NORTH);
  sim.spawnRegiment(C, CAVALRY, "Blount's Knights", 90, 110, 165, NORTH);
  sim.spawnRegiment(C, HERO, "King Henry's Guard", 100, 0, 180, NORTH, { hero: 'King Henry IV', guardType: SWORD });

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
