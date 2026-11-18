// Shared constants used by both the simulation worker and the renderer.
// Everything is in metres and seconds.

export const WORLD_SIZE = 640; // square battlefield, centred on the origin
export const HALF_WORLD = WORLD_SIZE / 2;

export const SIM_HZ = 20;
export const SIM_DT = 1 / SIM_HZ;

export const TEAM_REBEL = 0; // Percy / Glyndwr alliance - the player's side
export const TEAM_CROWN = 1; // King Henry IV's royal army

export const TEAM_NAMES = ['Rebel Alliance', 'Royal Army'];

// Unit types
export const ARCHER = 0;
export const SWORD = 1;
export const SPEAR = 2;
export const CAVALRY = 3;
export const HERO = 4;
export const NUM_TYPES = 5;

export const TYPE_NAMES = ['Longbowmen', 'Men-at-Arms', 'Spearmen', 'Knights', 'Commander'];

// Per-type stats.
// speed: walking speed, run: charge speed, reach: melee reach,
// dmg/cd: melee damage per swing and cooldown, armor: fraction of damage absorbed
export const STATS = [
  /* ARCHER  */ { hp: 60, speed: 2.6, run: 4.2, reach: 1.4, dmg: 8, cd: 1.1, armor: 0.05, radius: 0.45, bowRange: 150, bowCd: 5, arrowDmg: 24, morale: 0.9 },
  /* SWORD   */ { hp: 110, speed: 2.4, run: 4.0, reach: 1.7, dmg: 20, cd: 1.15, armor: 0.35, radius: 0.5, morale: 1.0 },
  /* SPEAR   */ { hp: 90, speed: 2.5, run: 4.0, reach: 2.7, dmg: 15, cd: 1.25, armor: 0.2, radius: 0.5, antiCav: 3.0, morale: 0.95 },
  /* CAVALRY */ { hp: 170, speed: 4.5, run: 10.0, reach: 2.1, dmg: 26, cd: 1.3, armor: 0.4, radius: 1.1, charge: 2.2, morale: 1.0 },
  /* HERO    */ { hp: 700, speed: 2.8, run: 4.4, reach: 2.0, dmg: 45, cd: 1.0, armor: 0.55, radius: 0.55, morale: 2.0 },
];

// Unit states (packed into the snapshot)
export const ST_IDLE = 0;
export const ST_MOVE = 1;
export const ST_FIGHT = 2;
export const ST_SHOOT = 3;
export const ST_ROUT = 4;
export const ST_DEAD = 5;

// Snapshot layout: one Float32 stride per unit
//  0 x, 1 z, 2 heading, 3 packed(type | team<<3 | state<<4), 4 hp fraction, 5 anim phase
export const SNAP_STRIDE = 6;
// Arrow snapshot: x, y, z, vx, vy, vz
export const ARROW_STRIDE = 6;
export const MAX_ARROWS = 4000;

// Orders a regiment can receive
export const ORDER_HOLD = 0;
export const ORDER_MOVE = 1; // move, only fight if attacked
export const ORDER_ATTACK_MOVE = 2; // move, engaging anything on the way
export const ORDER_ATTACK = 3; // attack a specific regiment
export const ORDER_RETREAT = 4;
export const ORDER_CHARGE = 5; // attack at a run, with a morale boost
export const ORDER_FOLLOW = 6; // stay close to the operative

export const ORDER_NAMES = ['Hold', 'Move', 'Advance', 'Attack', 'Retreat', 'Charge', 'Follow'];

// Regiment formations
export const FORMATIONS = ['line', 'wedge', 'shieldwall'];
export const FORMATION_NAMES = { line: 'Line', wedge: 'Wedge', shieldwall: 'Shield wall' };

// Extra snapshot flag bits (packed into field 3 above the state bits)
export const FLAG_GARRISON = 1 << 7;
export const FLAG_OFFICER = 1 << 8;
export const FLAG_AGENT = 1 << 9; // the Usurper's rival time-travellers

// Navigation cell types
export const CELL_PALISADE = 2;
export const CELL_BEACON = 6; // the Temporal Beacon at the player's settlement

// Pathfinding grid
export const NAV_CELL = 4;
export const NAV_DIM = WORLD_SIZE / NAV_CELL; // 160 x 160

// River Severn runs along the north of the field.
export const RIVER_Z = -250;
export const RIVER_HALF_WIDTH = 16;

// Fortification costs
export const PALISADE_COST_PER_M = 1.5;
export const STAKES_COST = 25;
