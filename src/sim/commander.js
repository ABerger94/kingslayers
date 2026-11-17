// The AI general. One per team. Drives every regiment that has `auto` set
// (all royal regiments, plus any rebel regiment the player hasn't taken direct control of).
import {
  ARCHER, SWORD, SPEAR, CAVALRY, HERO, STATS,
  TEAM_CROWN,
  ORDER_HOLD, ORDER_ATTACK, ORDER_ATTACK_MOVE, ORDER_RETREAT,
} from '../shared/constants.js';

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
    for (const reg of sim.regiments) {
      if (reg.team !== this.team || !reg.auto || reg.alive - reg.routing <= 0) continue;
      this.decide(reg, enemies);
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

  decide(reg, enemies) {
    const sim = this.sim;
    const t = sim.time;
    const { reg: near, dist } = this.nearest(reg, enemies);
    if (!near) return;
    const strength = sim.teamStrength ? sim.teamStrength[this.team] : 1;

    switch (reg.type) {
      case ARCHER: {
        const range = STATS[ARCHER].bowRange;
        // Skirmish: fall back from melee troops that get too close
        const { reg: melee, dist: md } = this.nearest(reg, enemies, (o) => o.type !== ARCHER);
        if (melee && md < 30 && t - reg.lastOrderTime > 6) {
          const dx = reg.cx - melee.cx, dz = reg.cz - melee.cz, l = Math.hypot(dx, dz) || 1;
          this.order(reg, ORDER_RETREAT, reg.cx + dx / l * 45, reg.cz + dz / l * 45);
          return;
        }
        if (reg.order.type === ORDER_RETREAT && t - reg.lastOrderTime < 8) return;
        if (dist < range * 0.85) {
          if (reg.order.type !== ORDER_HOLD) this.order(reg, ORDER_HOLD, reg.cx, reg.cz);
        } else {
          // Advance into range
          const dx = near.cx - reg.cx, dz = near.cz - reg.cz, l = Math.hypot(dx, dz);
          const go = l - range * 0.75;
          this.order(reg, ORDER_ATTACK_MOVE, reg.cx + dx / l * go, reg.cz + dz / l * go);
        }
        return;
      }
      case SWORD:
      case SPEAR: {
        if (t < this.infantryAdvanceAt && dist > 40) return;
        this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
        return;
      }
      case CAVALRY: {
        if (t < this.cavalryAt && dist > 50) return;
        // Knights hunt archers first, avoiding spear blocks
        const { reg: soft } = this.nearest(reg, enemies, (o) => o.type === ARCHER);
        const tgt = soft || this.nearest(reg, enemies, (o) => o.type !== SPEAR).reg || near;
        this.order(reg, ORDER_ATTACK, tgt.cx, tgt.cz, tgt.id);
        return;
      }
      case HERO: {
        // Commanders stay back until the battle turns, then lead from the front
        const committed = this.team === TEAM_CROWN ? strength < 0.65 || t > 200 : false;
        if (committed || dist < 25) this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
        return;
      }
      default: {
        if (t < this.infantryAdvanceAt && dist > 40) return;
        this.order(reg, ORDER_ATTACK, near.cx, near.cz, near.id);
      }
    }
  }
}
