# TIMEFALL: Crown & Caliber — implementation notes

The design lives in *Kingmakers-Style Single-Player Game — Design Doc* (Nov 18, 2026). This file tracks how
the prototype maps onto it, what is built, and what's next.

## Engine decision

The doc recommends Unity DOTS or Unreal Mass for a shipping game, and notes a Three.js browser build is only
realistic as a prototype. This repository is that prototype: Three.js renderer plus a battle simulation on a
Web Worker. The simulation turned out cheaper than the doc feared. About 2 ms per 50 ms tick for 3,000
individually simulated soldiers on one core, so we kept per-soldier AI rather than switching to squad-level
brains, and default battles to the doc's 500–1,500 soldier target for readability (Shrewsbury offers an
"Epic" ~3,300 option). The architecture (data-oriented sim, flow fields, instanced crowds) ports directly to
DOTS/Mass if we move engines.

## Vertical slice checklist (doc section 6)

| Item | Status |
|---|---|
| Hero: move, shoot (2 guns), parry, sledgehammer | ✅ 2-gun loadout + longsword; arm buckler parries blows/arrows with a gun out; sledgehammer staggers knights |
| Command mode toggle with slow-mo, 4 unit types, move/attack/hold | ✅ 20% slow-mo, plus charge, follow me, retreat and line/wedge/shield wall formations |
| 300–500 soldiers with morale + routing | ✅ raid ~260, defense up to ~500, Shrewsbury ~1,500 (Epic 3,300) |
| One battle map with a destructible palisade | ✅ plus a destructible castle (walls, gate) |
| Tiny settlement: 4 buildings + Temporal Beacon | ✅ House, Farm, Lumber Mill, Barracks, free placement; Beacon levels 1–4 |
| Shop with 5 items incl. one vehicle and one airstrike | ✅ the Depot: 10 items over 4 tiers incl. Armoured SUV, gunship, airstrike |
| Officer capture + 2 prisoner choices | ✅ capture wounded officers (incl. Prince Hal); Ransom, Interrogate, Recruit, Execute |

## Systems (doc section 4)

**4.1 Hero combat.** Guns: pistol, shotgun, assault rifle, sniper, grenade launcher (SMG, RPG and crossbow
are next). Caliber vs armor: peasants drop to anything; mail needs a rifle; plate needs the sniper, a headshot,
the hammer or explosives, and bullets visibly glance off plate. Stowed guns reload themselves; total ammo is
limited per mission, with **supply crates** as call-ins. **Downed state**: you bleed out for 18 s while your
bodyguard squad (which follows you everywhere) tries to drag you clear. On Squire you're medevaced; otherwise
the mission fails.

**4.2 Command.** Orders: move, advance (attack-move), attack, hold, **charge** (run + morale boost), **follow
me**, retreat, return to AI. Formations: line; wedge (+20% melee damage); shield wall (65% speed, arrows do
40%, melee 75%). Rock-paper-scissors: spears ×3 vs cavalry, swords ×1.5 vs spears, cavalry ×1.5 vs archers.
*Lieutenants* exist as named prisoners recruited to lead a squad (morale bonus); their AI personalities
(Aggressive/Defensive/Flanker) are next.

**4.3 Morale & loyalty.** Per-squad morale (shown in the roster). Officers falling breaks nearby
formations. **Fear of the Thunder-Stick**: gunfire and explosion terror starts at full strength and fades
15% per mission as the enemy adapts. Executions boost morale for one battle but cost reputation and loyalty;
low loyalty causes desertions. The operative and lieutenants steady nearby troops.

**4.4 Settlement.** Free placement on a hand-drawn settlement map. House (+40 population), Farm (+45 food per
mission), Lumber Mill (+45 wood), Barracks (recruit; two for cavalry), Temporal Beacon (Depot tier). The
settlement is **attacked between missions**: after the first raid, and sometimes after convoy raids, you must
defend Sycharth, and the buildings you placed appear around the Beacon in 3D.

**4.5 Economy.** Food and wood from buildings (spent on buildings and recruits); silver from loot pouches
dropped by fallen knights, kill bounties, mission rewards and ransoms (spent at the Depot and on the Beacon);
intel from interrogation (spent to sabotage the next enemy army by 10% per point, and to reveal enemy
strength in briefings). Relics are not in yet.

**4.6 Prisoners.** Officers who fall to anything but explosives are wounded and pulse gold; press E to
capture. Choices feed reputation, loyalty, instability (executing royalty) and the ending.

**4.7 Timeline Instability.** As in the README: modern gear, killing/capturing historical figures and
changing major events (Hotspur surviving Shrewsbury) raise it; low-tech missions lower it. 30% handgonnes,
60% rival agents, 80% time storms, 100% collapse.

**4.8 Progression.** Army veterancy: squads that survive keep their names and gain stars (morale and damage).
Hero XP and the relic skill tree are next.

**4.9 Vehicles.** Armoured SUV (rams, resupplies, crashes into walls), gunship and airstrike call-ins. Dirt
bike, truck with turret and tank are next.

## Campaign (doc section 5)

Act 1: The Hanmer Raid → Reprisal at Sycharth. Act 2: Royal Silver Convoy (repeatable, escalating) and
Shrewsbury (field battle + siege). Act 4 endings, gated by instability and reputation: Restore history
(< 35%), Crown a new king (< 80%), Take the crown yourself (≥ 50% or ruthless), Timeline collapse (100%).
Post-game: Endless Siege. The doc's full 4-act, ~25-mission structure (Act 3 sieges with trebuchets and
tanks; the Usurper as a boss) is the next big content push.

## Technical architecture

```
 main thread                                         simulation worker (src/sim)
 ───────────                                         ───────────────────────────
 render (Three.js, instancing)   ◀── snapshot 20 Hz ── Sim.step(): grid → commanders → mission → regiments →
 hero, weapons, hit tests                               per-soldier think → integrate → arrows → storms
 command UI, HUD, campaign hub   ── commands ───────▶  orders, formations, damage, explosions, capture
```

* `src/shared/` (terrain, castle layout, mission catalogue) is used by both threads.
* `src/sim/scenario.js` builds each mission from a config (difficulty, squads, instability, fear, sabotage).
* `src/game/campaign.js` holds the campaign rules and save; `hub.js` the between-mission screens.
* Struct-of-arrays soldiers, counting-sort spatial hash, cached Dijkstra flow fields, staggered thinking.

## Next (in the doc's suggested order)

1. Lieutenant AI personalities and squad groups; berserker and late-game hybrid units (musketeers, engineers).
2. More missions per act (rescue, escort, siege with trebuchets/tank), the Usurper as a recurring boss.
3. Hero XP classes (Marksman, Commander, Engineer, Juggernaut) and the relic skill tree.
4. More gear: SMG, RPG, crossbow, dirt bike, truck with turret, machine-gun nests and turrets.
5. Engine port decision (Unity DOTS vs Unreal Mass) once the loop is proven fun.
