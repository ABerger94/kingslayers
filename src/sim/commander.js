// The AI general. One per team. Drives every regiment that has `auto` set
// (all royal regiments, plus any rebel regiment the player hasn't taken direct control of).
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, STATS,
  TEAM_CROWN, TEAM_REBEL,
  ORDER_HOLD, ORDER_ATTACK, ORDER_ATTACK_MOVE, ORDER_RETREAT, ORDER_CHARGE, ORDER_MOVE,
} from '../shared/constants.js';

// Rock-paper-scissors: how much a regiment of type a wants to fight one of type b (<1 = eager)
function matchup(a, b) {
  if (a === SPEAR && b === CAVALRY) return 0.55;
  if (a === SWORD && b === SPEAR) return 0.65;
  if (a === CAVALRY && b === ARCHER) return 0.5;
  if (a === SPEAR && b === SWORD) return 1.4; // spears lose to swords: look for something else
  if (a === CAVALRY && b === SPEAR) return 2.2;
  if (b === ARCHER) return 0.85; // archers are soft once you reach them
  return 1;
}

import { GATE_FRONT, GATE_INSIDE, CASTLE, CELL_WALL, cellX, cellZ } from '../shared/castle.js';
import { NAV_DIM } from '../shared/constants.js';

export class Commander {
  constructor(sim, team) {
    this.sim = sim;
    this.team = team;
    this.timer = 0;
    // Royal infantry waits for the archery duel; rebels are more eager
    this.infantryAdvanceAt = team === TEAM_CROWN ? 75 : 90;
    this.cavalryAt = team === TEAM_CROWN ? 95 : 100;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    const sim = this.sim;
    const enemies = sim.regiments.filter((r) => r.team !== this.team && r.alive - r.routing > 0);
    if (!enemies.length) return;
    // Melee troops can only fight enemies they can reach: not men on the walls, and not the
    // castle courtyard while the walls are intact.
    const reachable = enemies.filter((r) => !r.garrison && (!r.inCastle || sim.castleOpen));
    for (const reg of sim.regiments) {
      if (reg.team !== this.team || !reg.auto || reg.alive - reg.routing <= 0 || reg.garrison) continue;
      this.decide(reg, enemies, reachable);
    }
  }

  nearest(reg, list, filter) {
    let best = Infinity, bestR = null;
    for (const o of list) {
      if (filter && !filter(o)) continue;
      const d = Math.hypot(o.cx - reg.cx, o.cz - reg.cz);
      if (d < best) { best = d; bestR = o; }
    }
    return { reg: bestR, dist: best };
  }

  // Best melee target: near, a good matchup, and preferably already locked in a fight with a friend
  // (ganging up breaks regiments). Never crosses the map for a marginally better matchup.
  pickTarget(reg, list) {
    const { reg: near, dist } = this.nearest(reg, list);
    if (!near) return { reg: null, dist: Infinity };
    let best = Infinity, bestR = near, bestD = dist;
    for (const o of list) {
      const d = Math.hypot(o.cx - reg.cx, o.cz - reg.cz);
      if (d > Math.max(60, dist * 1.8)) continue;
      let score = d * matchup(reg.type, o.type);
      if (o.engaged > 0.25) score *= 0.75; // help friends already fighting it
      if (o.morale < 0.5) score *= 0.85; // finish off the wavering
      if (score < best) { best = score; bestR = o; bestD = d; }
    }
    return { reg: bestR, dist: bestD };
  }

  order(reg, type, x, z, target = -1) {
    const o = reg.order;
    // Avoid thrashing: only re-issue when something meaningfully changed
    if (o.type === type && o.target === target && Math.hypot(o.x - x, o.z - z) < 12) return;
    this.sim.issueOrder(reg.id, { type, x, z, target });
  }

  decide(reg, enemies, reachable) {
    const sim = this.sim;
    const t = sim.time;
    const { reg: near, dist } = this.nearest(reg, reachable);
    const strength = sim.teamStrength ? sim.teamStrength[this.team] : 1;

    // ---- Royal troops inside the castle hold the courtyard and fight whatever comes through
    if (reg.inCastle) {
      // Nobody is getting in until the walls are breached; then fight whoever comes through.
      // The King's own guard stays tight around him by the keep.
      const reach = reg.type === HERO ? 22 : 40;
      if (sim.castleOpen && near && dist < reach) this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
      else if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, reg.anchorX, reg.anchorZ);
      return;
    }

    // ---- Rebels storming the castle
    if (this.team === TEAM_REBEL && sim.assault && reg.type !== ARCHER && (!near || dist > 60)) {
      if (!sim.castleOpen) {
        // Sappers undermine a stretch of curtain wall away from the crush at the gate
        if (reg.engineer) {
          for (const cx of [CASTLE.cx0 + 5, CASTLE.cx1 - 5, CASTLE.cx0 + 8, CASTLE.cx1 - 8]) {
            if (sim.nav.blocked[CASTLE.cz0 * NAV_DIM + cx] !== CELL_WALL) continue;
            this.order(reg, ORDER_ATTACK_MOVE, cellX(cx), cellZ(CASTLE.cz0) - 3);
            return;
          }
        }
        // Mass at the gate and batter it down (the front rank stands in the gateway)
        this.order(reg, ORDER_ATTACK_MOVE, GATE_FRONT.x, GATE_FRONT.z + 6);
      } else {
        const inside = this.nearest(reg, reachable, (o) => o.inCastle).reg;
        if (inside) this.order(reg, ORDER_ATTACK, inside.cx, inside.cz, inside.id);
        else this.order(reg, ORDER_ATTACK_MOVE, GATE_INSIDE.x, GATE_INSIDE.z);
      }
      return;
    }

    // ---- A battered, wavering regiment falls back on its commander to steady itself
    if (reg.type !== HERO && reg.initial > 0 && reg.alive / reg.initial < 0.4 && reg.morale < 0.45 && reg.engaged < 0.3) {
      const h = this.nearestHero(reg);
      if (h && h.dist > 25 && h.dist < 200) { this.order(reg, ORDER_MOVE, h.x, h.z); return; }
    }

    if (reg.personality && reg.type !== HERO && reg.type !== ARCHER) {
      if (this.personal(reg, reachable, enemies)) return;
    }

    switch (reg.type) {
      case ARCHER: {
        // Archers can shoot at anything, including the men on the walls
        const { reg: tgt, dist: td } = this.nearest(reg, enemies);
        if (!tgt) return;
        const range = STATS[ARCHER].bowRange;
        const p = reg.personality;
        if (p === 'defensive') {
          // Stay on the ground we were given; shoot whatever comes into range
          if (Math.hypot(reg.cx - reg.homeX, reg.cz - reg.homeZ) > 12) this.order(reg, ORDER_MOVE, reg.homeX, reg.homeZ);
          else if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, reg.homeX, reg.homeZ);
          return;
        }
        // Skirmish: fall back from melee troops that get too close (aggressive bowmen stand)
        const { reg: melee, dist: md } = this.nearest(reg, reachable, (o) => o.type !== ARCHER);
        if (p !== 'aggressive' && melee && md < 30 && t - reg.lastOrderTime > 6) {
          const dx = reg.cx - melee.cx, dz = reg.cz - melee.cz, l = Math.hypot(dx, dz) || 1;
          this.order(reg, ORDER_RETREAT, reg.cx + dx / l * 45, reg.cz + dz / l * 45);
          return;
        }
        if (reg.order.type === ORDER_RETREAT && t - reg.lastOrderTime < 8) return;
        const want = p === 'aggressive' ? 0.55 : 0.75;
        if (td < range * (want + 0.1)) {
          if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, reg.cx, reg.cz);
        } else {
          // Advance into range
          const dx = tgt.cx - reg.cx, dz = tgt.cz - reg.cz, l = Math.hypot(dx, dz);
          const go = l - range * want;
          this.order(reg, ORDER_ATTACK_MOVE, reg.cx + dx / l * go, reg.cz + dz / l * go);
        }
        return;
      }
      case SWORD:
      case SPEAR: {
        if (!near) return;
        if (t < this.infantryAdvanceAt && dist > 40) return;
        const tgt = this.pickTarget(reg, reachable).reg || near;
        this.order(reg, ORDER_ATTACK, tgt.cx, tgt.cz, tgt.id);
        return;
      }
      case CAVALRY: {
        if (!near) return;
        if (t < this.cavalryAt && dist > 50) return;
        // Knights hunt archers first, avoiding spear blocks
        const { reg: soft, dist: sd } = this.nearest(reg, reachable, (o) => o.type === ARCHER);
        const tgt = (soft && sd < 220 ? soft : null) || this.pickTarget(reg, reachable).reg || near;
        this.order(reg, ORDER_ATTACK, tgt.cx, tgt.cz, tgt.id);
        return;
      }
      case HERO: {
        if (!near) return;
        // Field commanders stay back until the battle turns, then lead from the front
        const committed = this.team === TEAM_CROWN ? strength < 0.65 || t > 200 : false;
        if (committed || dist < 25) this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
        return;
      }
      default: {
        if (!near) return;
        if (t < this.infantryAdvanceAt && dist > 40) return;
        this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
      }
    }
  }

  nearestHero(reg) {
    const sim = this.sim;
    let best = null;
    for (const k in sim.heroes) {
      const h = sim.heroes[k];
      if (!sim.alive[h] || sim.team[h] !== this.team || sim.agent[h]) continue;
      const d = Math.hypot(sim.x[h] - reg.cx, sim.z[h] - reg.cz);
      if (!best || d < best.dist) best = { x: sim.x[h], z: sim.z[h], dist: d };
    }
    return best;
  }

  // Lieutenant / captain personalities (doc 4.2). Returns true if it gave the order.
  personal(reg, reachable, enemies) {
    const sim = this.sim;
    switch (reg.personality) {
      case 'aggressive': {
        // No waiting for the archery duel: straight in, wedge first, charge home
        if (reg.formation === 'line') sim.setFormation(reg.id, 'wedge');
        const { reg: tgt, dist } = this.pickTarget(reg, reachable);
        if (!tgt) return false;
        this.order(reg, dist < 40 ? ORDER_CHARGE : ORDER_ATTACK, tgt.cx, tgt.cz, tgt.id);
        return true;
      }
      case 'defensive': {
        // Hold the ground we were given; shields up against arrows; fight only what comes close
        const hx = reg.homeX, hz = reg.homeZ;
        const threat = this.nearest({ cx: hx, cz: hz }, reachable).reg;
        const td = threat ? Math.hypot(threat.cx - hx, threat.cz - hz) : Infinity;
        if (threat && td < 55) {
          if (reg.formation === 'shieldwall' && threat.type !== ARCHER) sim.setFormation(reg.id, 'line');
          this.order(reg, ORDER_ATTACK, threat.cx, threat.cz, threat.id);
          return true;
        }
        // Late in the battle, with the enemy beaten, join the pursuit
        const strength = sim.teamStrength ? sim.teamStrength[1 - this.team] : 1;
        if (strength < 0.3) return false;
        if (reg.formation !== 'shieldwall') sim.setFormation(reg.id, 'shieldwall');
        if (Math.hypot(reg.cx - hx, reg.cz - hz) > 10) this.order(reg, ORDER_MOVE, hx, hz);
        else if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, hx, hz);
        return true;
      }
      case 'flanker': {
        // Prefer an enemy that is already locked in melee (or archers), and come at it from the side
        let tgt = null, best = Infinity;
        for (const o of reachable) {
          const d = Math.hypot(o.cx - reg.cx, o.cz - reg.cz);
          if (d > 260) continue;
          const score = d * (o.engaged > 0.25 ? 0.5 : o.type === ARCHER ? 0.7 : 1.3) * matchup(reg.type, o.type);
          if (score < best) { best = score; tgt = o; }
        }
        if (!tgt) return false;
        const d = Math.hypot(tgt.cx - reg.cx, tgt.cz - reg.cz);
        if (d < 30 || (tgt.engaged < 0.25 && sim.time < this.infantryAdvanceAt && d > 60 && reg.type !== CAVALRY)) {
          if (d < 30) this.order(reg, ORDER_CHARGE, tgt.cx, tgt.cz, tgt.id);
          return true;
        }
        // Waypoint off the target's flank, on the side nearer to us
        const fx = Math.sin(tgt.facing), fz = Math.cos(tgt.facing);
        const rx = fz, rz = -fx;
        const side = (reg.cx - tgt.cx) * rx + (reg.cz - tgt.cz) * rz >= 0 ? 1 : -1;
        const wx = tgt.cx + rx * side * 32 - fx * 10, wz = tgt.cz + rz * side * 32 - fz * 10;
        const wd = Math.hypot(wx - reg.cx, wz - reg.cz);
        if (wd < 14) this.order(reg, ORDER_CHARGE, tgt.cx, tgt.cz, tgt.id);
        else this.order(reg, ORDER_MOVE, wx, wz);
        return true;
      }
    }
    return false;
  }
}
