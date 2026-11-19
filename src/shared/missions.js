// Mission catalogue shared by the campaign screens (main thread) and the scenarios (simulation).
// Positions are world metres; the player's lines are always to the north (negative z).

export const MISSIONS = {
  raid: {
    id: 'raid', act: 1, kind: 'Raid',
    title: 'The Hanmer Raid',
    blurb: 'A royal supply camp sits in the pease field south of Hanmer. Break the guard, take the silver, and capture any officers you can. Your first taste of what one rifle can do in 1403.',
    enemy: 'About 220 royal soldiers: archers, men-at-arms, spearmen and a few knights, each band led by an officer.',
    reward: 250,
    spawn: { x: 6, z: -78 }, suv: { x: 16, z: -86 },
    win: 'Rout or destroy the royal camp guard.',
  },
  defense: {
    id: 'defense', act: 1, kind: 'Defense',
    title: 'Reprisal at Sycharth',
    blurb: 'Word of your raid reached Prince Hal. His riders are coming to burn Sycharth, Glyndŵr\'s manor and your settlement, and with it the Temporal Beacon. Raise palisades, hold the line through three waves.',
    enemy: 'Three waves of royal troops, growing stronger. The last is led by one of Prince Hal\'s captains.',
    reward: 300,
    spawn: { x: 16, z: -160 }, suv: { x: 30, z: -168 },
    beacon: { x: 10, z: -182 },
    win: 'Survive all three waves. If the Beacon falls, you lose contact with the future.',
  },
  convoy: {
    id: 'convoy', act: 2, kind: 'Raid (repeatable)',
    title: 'Royal Silver Convoy',
    blurb: 'The Handler has tracked a royal pay convoy. Hit it, take its silver, and get out. Repeatable, and the guard grows each time.',
    enemy: 'A convoy escort of 180–300 soldiers with officers.',
    reward: 200,
    spawn: { x: 6, z: -78 }, suv: { x: 16, z: -86 },
    win: 'Rout or destroy the convoy escort.',
  },
  shrewsbury: {
    id: 'shrewsbury', act: 2, kind: 'Field battle & siege',
    title: 'Shrewsbury, 21 July 1403',
    blurb: 'Harry Hotspur stands against King Henry IV. History says Hotspur dies and the rebellion withers. Keep him alive, break the royal army, then storm the castle and end the King, and choose what history becomes.',
    enemy: 'The royal army in the field, a castle garrison, and the King\'s guard.',
    reward: 600,
    spawn: { x: 24, z: -158 }, suv: { x: 32, z: -168 },
    win: 'Keep Hotspur alive. Break the field army, breach the castle, kill King Henry IV.',
  },
  endless: {
    id: 'endless', act: 4, kind: 'Endless Siege',
    title: 'Endless Siege',
    blurb: 'Post-game: defend your settlement and its Beacon against wave after escalating wave. How long can you hold?',
    enemy: 'Escalating waves, forever.',
    reward: 0,
    spawn: { x: 16, z: -160 }, suv: { x: 30, z: -168 },
    beacon: { x: 10, z: -182 },
    win: 'Survive as many waves as you can.',
  },
  classic: {
    id: 'classic', act: 0, kind: 'Quick battle',
    title: 'Shrewsbury (quick battle)',
    blurb: 'The full battle with the full arsenal, outside the campaign.',
    enemy: '', reward: 0,
    spawn: { x: 24, z: -158 }, suv: { x: 32, z: -168 },
  },
};

export const SQUAD_TYPES = {
  spear: { label: 'Spearmen', unit: 2, men: 40, food: 45, wood: 15, beats: 'cavalry' },
  sword: { label: 'Swordsmen', unit: 1, men: 32, food: 60, wood: 30, beats: 'spearmen' },
  archer: { label: 'Archers', unit: 0, men: 32, food: 45, wood: 35, beats: 'infantry at range' },
  cavalry: { label: 'Cavalry', unit: 3, men: 16, food: 70, wood: 40, beats: 'archers', needsBarracks: 2 },
  // Late-game hybrids (doc 4.2): gear and know-how from the future, so they cost instability per battle
  engineer: { label: 'Sappers', unit: 1, men: 24, food: 55, wood: 60, beats: 'walls, gates and palisades; mends your palisades', needsBeacon: 2, engineer: true, inst: 0.5 },
  musket: { label: 'Handgonners', unit: 0, men: 28, food: 50, wood: 40, beats: 'armour at range; the noise breaks nerves', needsBeacon: 3, handgun: true, inst: 1.5 },
};

// Lieutenant personalities (doc 4.2): how a lieutenant's squad fights when left to the AI
export const TRAITS = {
  aggressive: { name: 'Aggressive', desc: 'Charges early in a wedge and goes straight for the enemy.', archer: 'Pushes the bowmen in close and never gives ground.' },
  defensive: { name: 'Defensive', desc: 'Holds its ground in a shield wall and fights only what comes close.', archer: 'Holds the ground it was given and shoots from there.' },
  flanker: { name: 'Flanker', desc: 'Swings wide and hits engaged enemies in the side or rear.', archer: 'Shoots into enemies already locked in melee with your men.' },
};
// Description of a trait for a squad of the given unit type (archers fight differently)
export const traitDesc = (trait, unit) => (unit === 0 ? TRAITS[trait].archer : TRAITS[trait].desc);

// Personality of a lieutenant, fixed by his name so older saves get one too
export function traitFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ['aggressive', 'defensive', 'flanker'][h % 3];
}
