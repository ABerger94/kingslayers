// The battle simulation. Pure data + logic, no DOM or rendering, so it runs inside a Web Worker
// in the game and directly under Node for headless tests/benchmarks.
//
// Data layout is struct-of-arrays (typed arrays indexed by soldier id) so the hot loops stay
// cache friendly and the per-soldier "think" phase can be partitioned across threads.
import {
  STATS, ARCHER, SWORD, SPEAR, CAVALRY, HERO,
  TEAM_REBEL, TEAM_CROWN,
  ST_IDLE, ST_MOVE, ST_FIGHT, ST_SHOOT, ST_ROUT, ST_DEAD,
  SNAP_STRIDE, ARROW_STRIDE, MAX_ARROWS,
  ORDER_HOLD, ORDER_MOVE, ORDER_ATTACK_MOVE, ORDER_ATTACK, ORDER_RETREAT,
  HALF_WORLD, PALISADE_COST_PER_M, NAV_CELL,
} from '../shared/constants.js';
import { heightAt, inPeaField } from '../shared/terrain.js';
import { SpatialGrid } from './grid.js';
import { NavGrid } from './flowfield.js';
import { makeRng } from './rng.js';
import { Commander } from './commander.js';

const GRAVITY = 9.81;
const ARROW_SPEED_H = 46; // horizontal arrow speed
const PLAYER = -2; // sentinel target id for the player
const ROUT_AT = 0.2;
const RALLY_AT = 0.55;
const HOME_Z = [-205, 300]; // where each team flees to
const FORT_HP = 400;

export class Regiment {
  constructor(id, team, type, name) {
    this.id = id;
    this.team = team;
    this.type = type; // dominant type (formation shape + speed)
    this.name = name;
    this.members = [];
    this.initial = 0;
    this.anchorX = 0;
    this.anchorZ = 0;
    this.facing = 0; // radians; forward = (sin, cos)
    this.order = { type: ORDER_HOLD, x: 0, z: 0, facing: null, target: -1 };
    this.auto = true; // controlled by the AI commander
    this.cx = 0; this.cz = 0; // centroid of non-routing members
    this.alive = 0;
    this.routing = 0;
    this.morale = 1;
    this.archerTarget = -1; // enemy regiment id the archers are shooting at
    this.heroIdx = -1;
    this.lastOrderTime = -999;
    this.moving = false;
  }
}

export class Sim {
  constructor(seed = 1403) {
    this.rng = makeRng(seed);
    this.capacity = 0;
    this.n = 0;
    this.time = 0;
    this.regiments = [];
    this.nav = new NavGrid();
    this.events = [];
    this.player = { x: 0, z: 0, alive: false, vehicle: false };
    this.supplies = 250;
    this.outcome = null; // 'victory' | 'defeat'
    this.scripted = []; // timed scenario events
    this.heroes = {}; // name -> unit index
    this.fortCells = [];
    this.stats = { kills: [0, 0], playerKills: 0, defectors: 0, fled: [0, 0] };
    this.commander = [new Commander(this, TEAM_REBEL), new Commander(this, TEAM_CROWN)];
    this.turncoats = null;
    this._dir = { x: 0, z: 0 };
  }

  allocate(capacity) {
    this.capacity = capacity;
    const F = () => new Float32Array(capacity);
    const I = () => new Int32Array(capacity);
    const U = () => new Uint8Array(capacity);
    this.x = F(); this.z = F(); this.vx = F(); this.vz = F();
    this.heading = F(); this.hp = F(); this.maxHp = F();
    this.morale = F(); this.loyalty = F(); this.cooldown = F(); this.bowCd = F();
    this.slotX = F(); this.slotZ = F(); this.anim = F(); this.thinkT = F();
    this.type = U(); this.team = U(); this.state = U(); this.alive = U(); this.fled = U();
    this.reg = I(); this.target = I();
    this.grid = new SpatialGrid(capacity, 4);
    this.arrows = new Float32Array(MAX_ARROWS * ARROW_STRIDE);
    this.arrowTeam = new Uint8Array(MAX_ARROWS);
    this.arrowLife = new Float32Array(MAX_ARROWS); // >0 while stuck in the ground
    this.arrowCount = 0;
  }

  addRegiment(team, type, name) {
    const r = new Regiment(this.regiments.length, team, type, name);
    this.regiments.push(r);
    return r;
  }

  spawn(reg, type, x, z) {
    const i = this.n++;
    if (i >= this.capacity) throw new Error('capacity exceeded');
    const st = STATS[type];
    this.x[i] = x; this.z[i] = z; this.vx[i] = 0; this.vz[i] = 0;
    this.heading[i] = reg.facing;
    this.hp[i] = this.maxHp[i] = st.hp * this.rng.range(0.9, 1.1);
    this.morale[i] = st.morale * this.rng.range(0.85, 1.05);
    this.loyalty[i] = reg.team === TEAM_CROWN ? this.rng.range(0.35, 1.0) : this.rng.range(0.7, 1.0);
    this.cooldown[i] = this.rng() * st.cd;
    this.bowCd[i] = this.rng() * 3;
    this.type[i] = type; this.team[i] = reg.team; this.state[i] = ST_IDLE;
    this.alive[i] = 1; this.fled[i] = 0;
    this.reg[i] = reg.id; this.target[i] = -1;
    this.thinkT[i] = this.rng() * 0.5;
    this.anim[i] = this.rng() * 10;
    reg.members.push(i);
    reg.initial++;
    if (type === HERO) reg.heroIdx = i;
    return i;
  }

  // Spawns a regiment of `count` soldiers in formation around (x, z).
  spawnRegiment(team, type, name, count, x, z, facing, opts = {}) {
    const reg = this.addRegiment(team, type, name);
    reg.anchorX = x; reg.anchorZ = z; reg.facing = facing;
    reg.order = { type: ORDER_HOLD, x, z, facing, target: -1 };
    if (opts.hero) {
      const h = this.spawn(reg, HERO, x, z);
      this.heroes[opts.hero] = h;
    }
    const memberType = opts.guardType ?? type;
    for (let k = 0; k < count; k++) this.spawn(reg, memberType, x + this.rng.range(-1, 1), z + this.rng.range(-1, 1));
    this.computeSlots(reg);
    for (const i of reg.members) { this.x[i] = this.slotX[i]; this.z[i] = this.slotZ[i]; }
    if (opts.auto === false) reg.auto = false;
    return reg;
  }

  // ---------------------------------------------------------------- formations
  formationCols(reg, count) {
    const ratio = reg.type === ARCHER ? 5 : reg.type === CAVALRY ? 3 : 2.5;
    return Math.max(3, Math.round(Math.sqrt(count * ratio)));
  }

  spacing(reg) {
    return reg.type === CAVALRY ? 3.0 : reg.type === ARCHER ? 2.0 : 1.5;
  }

  computeSlots(reg) {
    const fx = Math.sin(reg.facing), fz = Math.cos(reg.facing);
    const rx = fz, rz = -fx; // right vector
    const sp = this.spacing(reg);
    let count = 0;
    for (const i of reg.members) if (this.type[i] !== HERO) count++;
    const cols = this.formationCols(reg, count);
    let k = 0;
    for (const i of reg.members) {
      if (this.type[i] === HERO) {
        // Commanders stand just behind the centre of the front ranks
        this.slotX[i] = reg.anchorX - fx * sp * 1.5;
        this.slotZ[i] = reg.anchorZ - fz * sp * 1.5;
        continue;
      }
      const row = (k / cols) | 0, col = k % cols;
      const inRow = Math.min(cols, count - row * cols);
      const lat = (col - (inRow - 1) / 2) * sp;
      const back = row * sp;
      this.slotX[i] = reg.anchorX + rx * lat - fx * back;
      this.slotZ[i] = reg.anchorZ + rz * lat - fz * back;
      k++;
    }
  }

  // ---------------------------------------------------------------- commands from the player / AI
  issueOrder(regId, order) {
    const reg = this.regiments[regId];
    if (!reg) return;
    reg.order = { type: order.type, x: order.x ?? reg.anchorX, z: order.z ?? reg.anchorZ, facing: order.facing ?? null, target: order.target ?? -1 };
    reg.lastOrderTime = this.time;
    if (order.type === ORDER_HOLD) { reg.order.x = reg.cx || reg.anchorX; reg.order.z = reg.cz || reg.anchorZ; }
  }

  setAuto(regId, auto) {
    const reg = this.regiments[regId];
    if (reg) reg.auto = auto;
  }

  buildPalisade(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 2) return { ok: false, reason: 'too short' };
    const cost = Math.ceil(len * PALISADE_COST_PER_M);
    if (cost > this.supplies) return { ok: false, reason: 'not enough supplies' };
    const steps = Math.ceil(len / (NAV_CELL * 0.5));
    const placed = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const c = this.nav.cellIndex(x, z);
      if (this.nav.blocked[c]) continue;
      // Don't wall in our own soldiers: skip cells containing a unit
      let occupied = false;
      this.grid.query(x, z, NAV_CELL, (j) => {
        if (this.nav.cellIndex(this.x[j], this.z[j]) === c) { occupied = true; return true; }
        return false;
      });
      if (occupied) continue;
      if (this.nav.setFort(x, z, FORT_HP)) { placed.push(c); this.fortCells.push(c); }
    }
    this.supplies -= cost;
    this.events.push({ t: 'forts', cells: placed });
    return { ok: true, cells: placed.length };
  }

  // Damage applied by the player's modern weapons.
  damageUnit(i, dmg, source = 'gun') {
    if (!this.alive[i]) return;
    this.hp[i] -= dmg;
    if (this.hp[i] <= 0) this.kill(i, source === 'player' || source === 'gun' || source === 'explosion' ? 'player' : 'melee');
    else if (source === 'gun') this.shockArea(this.x[i], this.z[i], 6, 0.03, this.team[i]);
  }

  explode(x, z, r, dmg) {
    const R = r * 2.8;
    this.grid.query(x, z, R, (j) => {
      if (!this.alive[j]) return false;
      const d = Math.hypot(this.x[j] - x, this.z[j] - z);
      if (d > R) return false;
      // Terror: medieval soldiers have never seen anything like it
      const t = 1 - d / R;
      this.morale[j] -= 0.55 * t;
      if (this.team[j] === TEAM_CROWN) this.loyalty[j] -= 0.18 * t;
      if (d < r) {
        const k = 1 - (d / r) * 0.6;
        this.hp[j] -= dmg * k * (1 - STATS[this.type[j]].armor * 0.3);
        // Blast pushes survivors away
        const nx = (this.x[j] - x) / (d + 0.01), nz = (this.z[j] - z) / (d + 0.01);
        this.vx[j] += nx * 12 * k; this.vz[j] += nz * 12 * k;
        if (this.hp[j] <= 0) this.kill(j, 'player');
      }
      return false;
    });
    // Fortifications are destroyed by explosions too
    const c0 = this.nav.cellIndex(x, z);
    if (this.nav.blocked[c0] === 2) { this.nav.clearFort(c0); this.events.push({ t: 'fortGone', cell: c0 }); }
  }

  shockArea(x, z, r, amount, team) {
    this.grid.query(x, z, r, (j) => {
      if (this.alive[j] && this.team[j] === team) this.morale[j] -= amount;
      return false;
    });
  }

  kill(i, cause) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.state[i] = ST_DEAD;
    this.hp[i] = 0;
    const team = this.team[i];
    this.stats.kills[1 - team]++;
    if (cause === 'player') this.stats.playerKills++;
    this.shockArea(this.x[i], this.z[i], 7, cause === 'player' ? 0.06 : 0.025, team);
    this.events.push({ t: 'death', i, x: this.x[i], z: this.z[i], cause });
    if (this.type[i] === HERO) this.onHeroDeath(i);
  }

  onHeroDeath(i) {
    const team = this.team[i];
    let name = 'A commander';
    for (const k in this.heroes) if (this.heroes[k] === i) name = k;
    this.events.push({ t: 'heroDeath', name, team });
    for (let j = 0; j < this.n; j++) {
      if (!this.alive[j]) continue;
      if (this.team[j] === team) this.morale[j] -= 0.35;
      else this.morale[j] += 0.2;
    }
  }

  // ---------------------------------------------------------------- main step
  step(dt) {
    this.time += dt;
    this.grid.rebuild(this.n, this.x, this.z, this.alive);
    for (const s of this.scripted) {
      if (!s.done && this.time >= s.at) { s.done = true; s.fn(this); }
    }
    this.commander[TEAM_REBEL].update(dt);
    this.commander[TEAM_CROWN].update(dt);
    for (const reg of this.regiments) this.updateRegiment(reg, dt);
    for (let i = 0; i < this.n; i++) if (this.alive[i]) this.think(i, dt);
    for (let i = 0; i < this.n; i++) if (this.alive[i]) this.integrate(i, dt);
    this.updateArrows(dt);
    this.supplies = Math.min(600, this.supplies + dt * 2.5);
    this.checkOutcome();
  }

  updateRegiment(reg, dt) {
    // Compact the member list: drop the dead, the fled and defectors
    let alive = 0, routing = 0, sx = 0, sz = 0, nm = 0, mor = 0;
    const keep = [];
    for (const i of reg.members) {
      if (!this.alive[i] || this.reg[i] !== reg.id) continue;
      alive++;
      mor += this.morale[i];
      if (this.state[i] === ST_ROUT) { routing++; continue; }
      keep.push(i);
      sx += this.x[i]; sz += this.z[i]; nm++;
    }
    // Routers stay listed so they can rally
    for (const i of reg.members) if (this.alive[i] && this.reg[i] === reg.id && this.state[i] === ST_ROUT) keep.push(i);
    reg.members = keep;
    reg.alive = alive;
    reg.routing = routing;
    reg.morale = alive ? mor / alive : 0;
    if (nm > 0) { reg.cx = sx / nm; reg.cz = sz / nm; }
    if (nm === 0) { reg.moving = false; return; }

    // Archers pick a regiment to loose at
    reg.archerTarget = -1;
    if (reg.type === ARCHER || reg.type === HERO || reg.hasArchers) {
      let best = STATS[ARCHER].bowRange, bestId = -1;
      for (const o of this.regiments) {
        if (o.team === reg.team || o.alive - o.routing <= 0) continue;
        const d = Math.hypot(o.cx - reg.cx, o.cz - reg.cz);
        if (d < best) { best = d; bestId = o.id; }
      }
      if (reg.order.type === ORDER_ATTACK && reg.order.target >= 0) {
        const o = this.regiments[reg.order.target];
        if (o && o.alive - o.routing > 0 && Math.hypot(o.cx - reg.cx, o.cz - reg.cz) < STATS[ARCHER].bowRange) bestId = o.id;
      }
      reg.archerTarget = bestId;
    }

    // Move the anchor
    const o = reg.order;
    let tx = o.x, tz = o.z;
    if (o.type === ORDER_ATTACK) {
      const tr = this.regiments[o.target];
      if (!tr || tr.alive - tr.routing <= 0) {
        o.type = ORDER_HOLD; o.x = reg.cx; o.z = reg.cz;
        tx = o.x; tz = o.z;
      } else {
        tx = tr.cx; tz = tr.cz;
        // Archers ordered to attack stop at bow range
        if (reg.type === ARCHER) {
          const d = Math.hypot(tx - reg.anchorX, tz - reg.anchorZ);
          const want = STATS[ARCHER].bowRange * 0.8;
          if (d < want) { tx = reg.anchorX; tz = reg.anchorZ; }
          else { const k = (d - want) / d; tx = reg.anchorX + (tx - reg.anchorX) * k; tz = reg.anchorZ + (tz - reg.anchorZ) * k; }
        }
      }
    }
    const dx = tx - reg.anchorX, dz = tz - reg.anchorZ;
    const dist = Math.hypot(dx, dz);
    // Cohesion: wait for stragglers so the block moves as one
    let near = 0;
    for (const i of keep) {
      if (this.state[i] === ST_ROUT) continue;
      const ex = this.x[i] - this.slotX[i], ez = this.z[i] - this.slotZ[i];
      if (ex * ex + ez * ez < 36) near++;
    }
    const cohesion = near / nm;
    const baseSpeed = STATS[reg.type].speed * (o.type === ORDER_RETREAT ? 1.15 : 0.92);
    reg.moving = false;
    if (dist > 1.5 && o.type !== ORDER_HOLD) {
      let speed = baseSpeed * Math.min(1, Math.max(0.1, (cohesion - 0.35) * 2));
      if (inPeaField(reg.anchorX, reg.anchorZ)) speed *= 0.75;
      let mx = dx / dist, mz = dz / dist;
      if (!this.nav.clearLine(reg.anchorX, reg.anchorZ, tx, tz)) {
        const f = this.nav.field(tx, tz);
        if (this.nav.direction(f, reg.anchorX, reg.anchorZ, this._dir)) { mx = this._dir.x; mz = this._dir.z; }
      }
      const step = Math.min(dist, speed * dt);
      reg.anchorX += mx * step; reg.anchorZ += mz * step;
      reg.moving = true;
      // Turn the block to face the direction of travel (or the enemy for attacks)
      const want = Math.atan2(mx, mz);
      reg.facing = turnToward(reg.facing, want, dt * 0.8);
    } else if (o.facing !== null && o.facing !== undefined) {
      reg.facing = turnToward(reg.facing, o.facing, dt * 0.8);
    } else if (reg.archerTarget >= 0 || o.type === ORDER_ATTACK) {
      const tr = this.regiments[o.type === ORDER_ATTACK ? o.target : reg.archerTarget];
      if (tr) reg.facing = turnToward(reg.facing, Math.atan2(tr.cx - reg.anchorX, tr.cz - reg.anchorZ), dt * 0.6);
    }
    // Pull anchor back if the block has been dragged far away from it by fighting
    const ax = reg.cx - reg.anchorX, az = reg.cz - reg.anchorZ;
    if (ax * ax + az * az > 40 * 40 && o.type === ORDER_HOLD) { reg.anchorX += ax * 0.02; reg.anchorZ += az * 0.02; }
    this.computeSlots(reg);
  }

  engageRadius(reg, type) {
    switch (reg.order.type) {
      case ORDER_MOVE: case ORDER_RETREAT: return 3;
      case ORDER_HOLD: return type === CAVALRY ? 14 : 10;
      case ORDER_ATTACK: return type === CAVALRY ? 45 : 32;
      case ORDER_ATTACK_MOVE: return type === CAVALRY ? 40 : 26;
    }
    return 10;
  }

  findEnemy(i, radius) {
    const xi = this.x[i], zi = this.z[i], team = this.team[i];
    let best = radius * radius, bestJ = -1, bestRout = -1, bestRoutD = radius * radius;
    this.grid.query(xi, zi, radius, (j) => {
      if (this.team[j] === team || !this.alive[j]) return false;
      const dx = this.x[j] - xi, dz = this.z[j] - zi;
      const d = dx * dx + dz * dz;
      if (this.state[j] === ST_ROUT) {
        if (d < bestRoutD) { bestRoutD = d; bestRout = j; }
      } else if (d < best) { best = d; bestJ = j; }
      return false;
    });
    // Crown soldiers will go for the time traveller too
    if (team === TEAM_CROWN && this.player.alive) {
      const dx = this.player.x - xi, dz = this.player.z - zi;
      const d = dx * dx + dz * dz;
      if (d < best && d < radius * radius) return PLAYER;
    }
    if (bestJ < 0 && (this.type[i] === CAVALRY || bestRoutD < 25)) return bestRout; // ride down fleeing men
    return bestJ;
  }

  think(i, dt) {
    const type = this.type[i];
    const st = STATS[type];
    const reg = this.regiments[this.reg[i]];
    this.cooldown[i] -= dt;
    this.anim[i] += dt;
    let dvx = 0, dvz = 0, speed = st.speed;

    // ---- morale (evaluated a couple of times a second)
    this.thinkT[i] -= dt;
    const doThink = this.thinkT[i] <= 0;
    if (doThink) {
      this.thinkT[i] = 0.4 + this.rng() * 0.2;
      this.updateMorale(i, reg, 0.5);
    }

    if (this.state[i] === ST_ROUT) {
      this.routBehaviour(i, dt, doThink);
      return;
    }
    if (this.morale[i] < ROUT_AT && type !== HERO) {
      this.state[i] = ST_ROUT;
      this.target[i] = -1;
      if (reg.alive > 0 && reg.routing === Math.floor(reg.alive * 0.5)) this.events.push({ t: 'routing', reg: reg.id });
      return;
    }

    // ---- target acquisition
    let tgt = this.target[i];
    if (tgt >= 0 && !this.alive[tgt]) tgt = -1;
    if (tgt === PLAYER && !this.player.alive) tgt = -1;
    if (doThink) {
      let keep = false;
      if (tgt >= 0) {
        const d = Math.hypot(this.x[tgt] - this.x[i], this.z[tgt] - this.z[i]);
        keep = d < st.reach * 2.5 + 1;
      }
      if (!keep) {
        const R = this.engageRadius(reg, type);
        tgt = this.findEnemy(i, Math.min(R, 9));
        if (tgt === -1 && R > 9) tgt = this.findEnemy(i, R);
        // Archers prefer shooting unless someone is right on top of them
        if (type === ARCHER && tgt >= 0 && reg.archerTarget >= 0) {
          const d = Math.hypot(this.x[tgt] - this.x[i], this.z[tgt] - this.z[i]);
          if (d > 7) tgt = -1;
        }
      }
      this.target[i] = tgt;
    }

    // ---- act
    let fighting = false;
    if (tgt !== -1) {
      const tx = tgt === PLAYER ? this.player.x : this.x[tgt];
      const tz = tgt === PLAYER ? this.player.z : this.z[tgt];
      const dx = tx - this.x[i], dz = tz - this.z[i];
      const d = Math.hypot(dx, dz) + 1e-6;
      const tr = tgt === PLAYER ? 0.4 : STATS[this.type[tgt]].radius;
      const reach = st.reach + st.radius + tr;
      this.heading[i] = Math.atan2(dx, dz);
      if (d > reach) {
        // Close the distance at a run
        speed = st.run;
        dvx = dx / d * speed; dvz = dz / d * speed;
        this.state[i] = ST_MOVE;
      } else {
        fighting = true;
        this.state[i] = ST_FIGHT;
        if (this.cooldown[i] <= 0) {
          this.cooldown[i] = st.cd * this.rng.range(0.8, 1.25);
          this.strike(i, tgt);
        }
      }
    } else if (type === ARCHER && reg.archerTarget >= 0 && reg.order.type !== ORDER_MOVE && reg.order.type !== ORDER_RETREAT && !reg.moving) {
      // ---- volley fire
      this.state[i] = ST_SHOOT;
      this.bowCd[i] -= dt;
      const tr = this.regiments[reg.archerTarget];
      this.heading[i] = Math.atan2(tr.cx - this.x[i], tr.cz - this.z[i]);
      if (this.bowCd[i] <= 0) {
        this.bowCd[i] = st.bowCd * this.rng.range(0.8, 1.35);
        this.loose(i, tr);
      }
      // hold position in the slot
      const ex = this.slotX[i] - this.x[i], ez = this.slotZ[i] - this.z[i];
      dvx = ex * 1.5; dvz = ez * 1.5;
    } else {
      // ---- keep formation
      const ex = this.slotX[i] - this.x[i], ez = this.slotZ[i] - this.z[i];
      const d = Math.hypot(ex, ez);
      if (d > 0.3) {
        speed = d > 6 ? st.run : st.speed * 1.1;
        let mx = ex / d, mz = ez / d;
        if (d > 12 && !this.nav.clearLine(this.x[i], this.z[i], this.slotX[i], this.slotZ[i])) {
          const f = this.nav.field(reg.anchorX, reg.anchorZ);
          if (this.nav.direction(f, this.x[i], this.z[i], this._dir)) { mx = this._dir.x; mz = this._dir.z; }
        }
        const s = Math.min(speed, d * 2);
        dvx = mx * s; dvz = mz * s;
        this.heading[i] = turnToward(this.heading[i], Math.atan2(mx, mz), dt * 6);
        this.state[i] = d > 1 ? ST_MOVE : ST_IDLE;
      } else {
        this.heading[i] = turnToward(this.heading[i], reg.facing, dt * 3);
        this.state[i] = ST_IDLE;
      }
    }

    if (inPeaField(this.x[i], this.z[i])) { dvx *= 0.75; dvz *= 0.75; }
    // Smoothly steer toward the desired velocity (cavalry has more momentum)
    const acc = type === CAVALRY ? 2.5 : 7;
    const k = Math.min(1, acc * dt);
    this.vx[i] += (dvx - this.vx[i]) * k;
    this.vz[i] += (dvz - this.vz[i]) * k;
    if (fighting) { this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
  }

  updateMorale(i, reg, dt) {
    const team = this.team[i];
    let allies = 0, enemies = 0;
    this.grid.query(this.x[i], this.z[i], 10, (j) => {
      if (!this.alive[j] || this.state[j] === ST_ROUT) return false;
      if (this.team[j] === team) allies++; else enemies++;
      return false;
    });
    let dm = 0.035;
    if (enemies > allies) dm -= 0.012 * Math.min(10, (enemies - allies) / 2);
    if (enemies === 0) dm += 0.03;
    // Commander's presence steadies the men
    for (const k in this.heroes) {
      const h = this.heroes[k];
      if (!this.alive[h] || this.team[h] !== team) continue;
      const dx = this.x[h] - this.x[i], dz = this.z[h] - this.z[i];
      if (dx * dx + dz * dz < 40 * 40) { dm += 0.07; break; }
    }
    // Heavy regimental losses sap the will to fight
    if (reg && reg.initial > 0) dm -= 0.05 * Math.max(0, 1 - reg.alive / reg.initial - 0.3);
    // Get within a few metres of the time traveller and his thunder-sticks...
    if (team === TEAM_CROWN && this.player.alive) {
      const dx = this.player.x - this.x[i], dz = this.player.z - this.z[i];
      if (dx * dx + dz * dz < 15 * 15) dm -= 0.03;
    }
    const cap = STATS[this.type[i]].morale * 1.1;
    this.morale[i] = Math.max(-0.2, Math.min(cap, this.morale[i] + dm * dt));
    this.loyalty[i] = Math.min(1, this.loyalty[i] + 0.002 * dt);
  }

  routBehaviour(i, dt, doThink) {
    const team = this.team[i];
    const hz = HOME_Z[team];
    const st = STATS[this.type[i]];
    if (doThink) {
      // Rally if the danger has passed
      if (this.morale[i] > RALLY_AT) {
        let enemiesNear = false;
        this.grid.query(this.x[i], this.z[i], 18, (j) => {
          if (this.alive[j] && this.team[j] !== team && this.state[j] !== ST_ROUT) { enemiesNear = true; return true; }
          return false;
        });
        if (!enemiesNear) { this.state[i] = ST_IDLE; return; }
      } else {
        this.morale[i] += 0.04 * 0.5;
      }
      // Loyalty test: disillusioned royal soldiers may throw in with the rebels
      if (team === TEAM_CROWN && this.loyalty[i] < 0.35 && this.rng() < 0.03 * 0.5 * 2) {
        this.defect(i);
        return;
      }
    }
    // Flee home
    const f = this.nav.field(Math.max(-250, Math.min(250, this.x[i])), hz);
    let mx = 0, mz = team === TEAM_REBEL ? -1 : 1;
    if (this.nav.direction(f, this.x[i], this.z[i], this._dir)) { mx = this._dir.x; mz = this._dir.z; }
    this.vx[i] += (mx * st.run - this.vx[i]) * Math.min(1, dt * 5);
    this.vz[i] += (mz * st.run - this.vz[i]) * Math.min(1, dt * 5);
    this.heading[i] = Math.atan2(this.vx[i], this.vz[i]);
    const escaped = team === TEAM_REBEL ? this.z[i] < hz + 6 : this.z[i] > hz - 6;
    if (escaped) {
      this.alive[i] = 0; this.fled[i] = 1; this.state[i] = ST_DEAD;
      this.stats.fled[team]++;
    }
  }

  defect(i) {
    if (!this.turncoats) {
      this.turncoats = this.spawnRegimentShell(TEAM_REBEL, SWORD, 'Turncoats');
      this.events.push({ t: 'msg', text: 'Royal soldiers are throwing down the King\'s colours and joining the rebellion!' });
    }
    const r = this.turncoats;
    this.team[i] = TEAM_REBEL;
    this.reg[i] = r.id;
    r.members.push(i);
    r.initial++;
    if (this.type[i] === ARCHER) r.hasArchers = true;
    this.state[i] = ST_IDLE;
    this.morale[i] = 0.8;
    this.loyalty[i] = 0.8;
    this.target[i] = -1;
    if (r.alive === 0) { r.anchorX = this.x[i]; r.anchorZ = this.z[i]; r.order.x = this.x[i]; r.order.z = this.z[i]; }
    this.stats.defectors++;
    this.events.push({ t: 'defect', i });
  }

  spawnRegimentShell(team, type, name) {
    const r = this.addRegiment(team, type, name);
    r.initial = 0;
    this.events.push({ t: 'newReg', id: r.id });
    return r;
  }

  strike(i, tgt) {
    const st = STATS[this.type[i]];
    let dmg = st.dmg * this.rng.range(0.7, 1.3);
    if (tgt === PLAYER) {
      this.events.push({ t: 'hitPlayer', dmg: dmg * 0.35, kind: 'melee', x: this.x[i], z: this.z[i] });
      return;
    }
    const tt = this.type[tgt];
    if (this.type[i] === SPEAR && (tt === CAVALRY)) dmg *= st.antiCav;
    if (this.type[i] === CAVALRY) {
      const sp = Math.hypot(this.vx[i], this.vz[i]);
      if (sp > 5.5) dmg *= st.charge;
    }
    // Hitting from behind is deadlier
    const fx = Math.sin(this.heading[tgt]), fz = Math.cos(this.heading[tgt]);
    const dx = this.x[i] - this.x[tgt], dz = this.z[i] - this.z[tgt];
    if (fx * dx + fz * dz < 0) dmg *= 1.5;
    dmg *= 1 - STATS[tt].armor;
    this.hp[tgt] -= dmg;
    if (this.hp[tgt] <= 0) this.kill(tgt, 'melee');
  }

  loose(i, tr) {
    if (this.arrowCount >= MAX_ARROWS) this.recycleStuckArrow();
    if (this.arrowCount >= MAX_ARROWS) return;
    // Pick a soldier in the target block
    let tgt = -1;
    for (let tries = 0; tries < 4 && tgt < 0; tries++) {
      const j = tr.members[(this.rng() * tr.members.length) | 0];
      if (j !== undefined && this.alive[j]) tgt = j;
    }
    let tx, tz;
    // Some archers take aim at the strange armoured figure - more of them the closer he gets
    if (this.team[i] === TEAM_CROWN && this.player.alive && !this.player.vehicle) {
      const dp = Math.hypot(this.player.x - this.x[i], this.player.z - this.z[i]);
      if (dp < 110 && this.rng() < 0.05 * (1 - dp / 110) + 0.01) { tx = this.player.x; tz = this.player.z; tgt = PLAYER; }
    }
    if (tgt === -1) return;
    if (tgt !== PLAYER) { tx = this.x[tgt]; tz = this.z[tgt]; }
    const sx = this.x[i], sz = this.z[i];
    let d = Math.hypot(tx - sx, tz - sz);
    const T = d / ARROW_SPEED_H;
    if (tgt !== PLAYER) { tx += this.vx[tgt] * T; tz += this.vz[tgt] * T; }
    // Inaccuracy grows with range
    const spread = 0.8 + d * 0.035;
    tx += this.rng.gauss() * spread; tz += this.rng.gauss() * spread;
    d = Math.hypot(tx - sx, tz - sz);
    const t = Math.max(0.3, d / ARROW_SPEED_H);
    const sy = heightAt(sx, sz) + 1.6;
    const ty = heightAt(tx, tz) + 1.2;
    const k = this.arrowCount++ * ARROW_STRIDE;
    const a = this.arrows;
    a[k] = sx; a[k + 1] = sy; a[k + 2] = sz;
    a[k + 3] = (tx - sx) / t;
    a[k + 4] = (ty - sy) / t + 0.5 * GRAVITY * t;
    a[k + 5] = (tz - sz) / t;
    this.arrowTeam[this.arrowCount - 1] = this.team[i];
    this.arrowLife[this.arrowCount - 1] = 0;
  }

  recycleStuckArrow() {
    for (let n = 0; n < this.arrowCount; n++) {
      if (this.arrowLife[n] > 0) { this.removeArrow(n); return; }
    }
  }

  removeArrow(n) {
    const last = --this.arrowCount;
    if (n !== last) {
      const a = this.arrows;
      const k = n * ARROW_STRIDE, l = last * ARROW_STRIDE;
      for (let q = 0; q < ARROW_STRIDE; q++) a[k + q] = a[l + q];
      this.arrowTeam[n] = this.arrowTeam[last];
      this.arrowLife[n] = this.arrowLife[last];
    }
  }

  updateArrows(dt) {
    const a = this.arrows;
    for (let n = 0; n < this.arrowCount; n++) {
      const k = n * ARROW_STRIDE;
      if (this.arrowLife[n] > 0) {
        this.arrowLife[n] -= dt;
        if (this.arrowLife[n] <= 0) { this.removeArrow(n); n--; }
        continue;
      }
      a[k + 4] -= GRAVITY * dt;
      a[k] += a[k + 3] * dt; a[k + 1] += a[k + 4] * dt; a[k + 2] += a[k + 5] * dt;
      const x = a[k], y = a[k + 1], z = a[k + 2];
      const team = this.arrowTeam[n];
      // Player hit test (anywhere along the flight while low)
      if (team === TEAM_CROWN && this.player.alive && !this.player.vehicle) {
        const dx = x - this.player.x, dz = z - this.player.z;
        const gy = heightAt(this.player.x, this.player.z);
        if (dx * dx + dz * dz < 0.7 && y > gy && y < gy + 2) {
          this.events.push({ t: 'hitPlayer', dmg: 9, kind: 'arrow', x: x - a[k + 3], z: z - a[k + 5] });
          this.removeArrow(n); n--; continue;
        }
      }
      const gy = heightAt(x, z);
      if (y < gy + 1.8 && a[k + 4] < 0) {
        // Descending through head height: check soldiers here
        let hit = -1;
        this.grid.query(x, z, 1.2, (j) => {
          if (!this.alive[j] || this.team[j] === team) return false;
          const r = STATS[this.type[j]].radius + 0.15;
          const dx = this.x[j] - x, dz = this.z[j] - z;
          if (dx * dx + dz * dz < r * r) { hit = j; return true; }
          return false;
        });
        if (hit >= 0) {
          const dmg = STATS[ARCHER].arrowDmg * this.rng.range(0.6, 1.3) * (1 - STATS[this.type[hit]].armor * 0.8);
          this.hp[hit] -= dmg;
          this.morale[hit] -= 0.02;
          if (this.hp[hit] <= 0) this.kill(hit, 'arrow');
          this.removeArrow(n); n--; continue;
        }
      }
      if (y <= gy) {
        a[k + 1] = gy + 0.3;
        this.arrowLife[n] = 6; // stuck in the mud for a while
      }
      if (Math.abs(x) > HALF_WORLD || Math.abs(z) > HALF_WORLD) { this.removeArrow(n); n--; }
    }
  }

  integrate(i, dt) {
    const r = STATS[this.type[i]].radius;
    const xi = this.x[i], zi = this.z[i];
    // Separation from neighbours
    let px = 0, pz = 0;
    this.grid.query(xi, zi, 2.4, (j) => {
      if (j === i || !this.alive[j]) return false;
      const dx = xi - this.x[j], dz = zi - this.z[j];
      const rr = r + STATS[this.type[j]].radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        // Heavier units shove lighter ones
        const w = this.type[j] === CAVALRY && this.type[i] !== CAVALRY ? 0.8 : 0.5;
        px += dx * push * w; pz += dz * push * w;
      }
      return false;
    });
    let nx = xi + this.vx[i] * dt + px * Math.min(1, dt * 8);
    let nz = zi + this.vz[i] * dt + pz * Math.min(1, dt * 8);
    const lim = HALF_WORLD - 4;
    if (nx < -lim) nx = -lim; else if (nx > lim) nx = lim;
    if (nz < -lim) nz = -lim; else if (nz > lim) nz = lim;
    const nav = this.nav;
    const c = nav.cellIndex(nx, nz);
    if (nav.blocked[c]) {
      // Hack at enemy fortifications that are in the way
      if (nav.blocked[c] === 2 && this.team[i] === TEAM_CROWN && this.state[i] !== ST_ROUT) {
        nav.fortHp[c] -= STATS[this.type[i]].dmg * dt * 0.6;
        if (nav.fortHp[c] <= 0) { nav.clearFort(c); this.events.push({ t: 'fortGone', cell: c }); }
      }
      if (!nav.blocked[nav.cellIndex(nx, zi)]) nz = zi;
      else if (!nav.blocked[nav.cellIndex(xi, nz)]) nx = xi;
      else if (!nav.blocked[nav.cellIndex(xi, zi)]) { nx = xi; nz = zi; }
      // If we were already inside a blocked cell, keep moving (the flow field leads out)
      this.vx[i] *= 0.5; this.vz[i] *= 0.5;
    }
    this.x[i] = nx; this.z[i] = nz;
  }

  checkOutcome() {
    if (this.outcome) return;
    const alive = [0, 0], initial = [0, 0];
    for (const r of this.regiments) {
      initial[r.team] += r.initial;
      alive[r.team] += r.alive - r.routing;
    }
    this.teamStrength = [alive[0] / Math.max(1, initial[0]), alive[1] / Math.max(1, initial[1])];
    const hot = this.heroes['Harry Hotspur'];
    const king = this.heroes['King Henry IV'];
    if (hot !== undefined && !this.alive[hot]) this.finish('defeat', 'Hotspur has fallen. History repeats itself.');
    else if (king !== undefined && !this.alive[king]) this.finish('victory', 'King Henry IV is dead. The future is rewritten.');
    else if (this.time > 20 && this.teamStrength[1] < 0.2) this.finish('victory', 'The royal army has broken and fled the field.');
    else if (this.time > 20 && this.teamStrength[0] < 0.15) this.finish('defeat', 'The rebel army has been destroyed.');
  }

  finish(outcome, text) {
    this.outcome = outcome;
    this.events.push({ t: 'outcome', outcome, text });
  }

  // ---------------------------------------------------------------- snapshots for the renderer
  snapshot() {
    const n = this.n;
    const s = new Float32Array(n * SNAP_STRIDE);
    for (let i = 0; i < n; i++) {
      const k = i * SNAP_STRIDE;
      s[k] = this.x[i]; s[k + 1] = this.z[i]; s[k + 2] = this.heading[i];
      s[k + 3] = this.type[i] | (this.team[i] << 3) | (this.state[i] << 4);
      s[k + 4] = this.fled[i] ? -1 : this.hp[i] / this.maxHp[i];
      s[k + 5] = Math.hypot(this.vx[i], this.vz[i]);
    }
    return s;
  }

  arrowSnapshot() {
    const a = new Float32Array(this.arrowCount * ARROW_STRIDE);
    a.set(this.arrows.subarray(0, this.arrowCount * ARROW_STRIDE));
    return a;
  }

  regimentSummary() {
    return this.regiments.map((r) => ({
      id: r.id, team: r.team, type: r.type, name: r.name,
      alive: r.alive, routing: r.routing, initial: r.initial,
      morale: r.morale, x: r.anchorX, z: r.anchorZ, cx: r.cx, cz: r.cz, facing: r.facing,
      order: r.order.type, ox: r.order.x, oz: r.order.z, target: r.order.target, auto: r.auto,
      hero: r.heroIdx,
    }));
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function turnToward(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return a + d;
}

export { PLAYER };
