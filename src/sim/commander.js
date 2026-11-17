// The AI general. One per team. Drives every regiment that has `auto` set
// (all royal regiments, plus any rebel regiment the player hasn't taken direct control of).
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, STATS,
  TEAM_CROWN, TEAM_REBEL,
  ORDER_HOLD, ORDER_ATTACK, ORDER_ATTACK_MOVE, ORDER_RETREAT,
} from '../shared/constants.js';
import { GATE_FRONT, GATE_INSIDE } from '../shared/castle.js';

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
        // Mass at the gate and batter it down (the front rank stands in the gateway)
        this.order(reg, ORDER_ATTACK_MOVE, GATE_FRONT.x, GATE_FRONT.z + 6);
      } else {
        const inside = this.nearest(reg, reachable, (o) => o.inCastle).reg;
        if (inside) this.order(reg, ORDER_ATTACK, inside.cx, inside.cz, inside.id);
        else this.order(reg, ORDER_ATTACK_MOVE, GATE_INSIDE.x, GATE_INSIDE.z);
      }
      return;
    }

    switch (reg.type) {
      case ARCHER: {
        // Archers can shoot at anything, including the men on the walls
        const { reg: tgt, dist: td } = this.nearest(reg, enemies);
        if (!tgt) return;
        const range = STATS[ARCHER].bowRange;
        // Skirmish: fall back from melee troops that get too close
        const { reg: melee, dist: md } = this.nearest(reg, reachable, (o) => o.type !== ARCHER);
        if (melee && md < 30 && t - reg.lastOrderTime > 6) {
          const dx = reg.cx - melee.cx, dz = reg.cz - melee.cz, l = Math.hypot(dx, dz) || 1;
          this.order(reg, ORDER_RETREAT, reg.cx + dx / l * 45, reg.cz + dz / l * 45);
          return;
        }
        if (reg.order.type === ORDER_RETREAT && t - reg.lastOrderTime < 8) return;
        if (td < range * 0.85) {
          if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, reg.cx, reg.cz);
        } else {
          // Advance into range
          const dx = tgt.cx - reg.cx, dz = tgt.cz - reg.cz, l = Math.hypot(dx, dz);
          const go = l - range * 0.75;
          this.order(reg, ORDER_ATTACK_MOVE, reg.cx + dx / l * go, reg.cz + dz / l * go);
        }
        return;
      }
      case SWORD:
      case SPEAR: {
        if (!near) return;
        if (t < this.infantryAdvanceAt && dist > 40) return;
        this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
        return;
      }
      case CAVALRY: {
        if (!near) return;
        if (t < this.cavalryAt && dist > 50) return;
        // Knights hunt archers first, avoiding spear blocks
        const { reg: soft } = this.nearest(reg, reachable, (o) => o.type === ARCHER);
        const tgt = soft || this.nearest(reg, reachable, (o) => o.type !== SPEAR).reg || near;
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
}
