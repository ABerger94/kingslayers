# Kingslayers: Design Document

## 1. Pitch

It is 1403. Owain Glyndŵr's Welsh rebellion is at its height and Harry "Hotspur" Percy has turned against
King Henry IV. History says Hotspur dies at Shrewsbury and the rebellion withers. A collapse cascade in 2031
has been traced back to that morning, so one operative is sent back with a modern arsenal to change it.

**Pillars**
1. **Scale you can feel.** Thousands of soldiers on the field at once, each one simulated.
2. **One player, two lenses.** Fight in the mud as a shooter, then pull up and command the war as an RTS
   without a loading screen. Time slows while you think.
3. **Asymmetric power and fragile people.** Your weapons are overwhelming, but you are one person with
   finite ammunition. Medieval soldiers are not bullet sponges: they panic, flee and defect, and terror is a
   weapon in its own right.

## 2. Core loop

```
 ┌─────────────── FIELD (TPS) ───────────────┐        Tab         ┌──────────── COMMAND (RTS) ────────────┐
 │ shoot, drive, call support                │ ─────────────────▶ │ time ×0.3 (or paused)                 │
 │ break formations at key points            │                    │ select regiments, move / attack       │
 │ protect Hotspur                           │ ◀───────────────── │ build palisades, call strikes at mouse │
 └───────────────────────────────────────────┘        Tab         └───────────────────────────────────────┘
```

The two modes share one world. Your body stays on the field while you command, so royal soldiers can still
reach it. This keeps the switch tense rather than a free pause.

**Phases:**
1. *The field.* An archery duel, then the royal infantry and knights advance.
2. *The assault.* When the royal field army drops below 30% fighting strength, the rebel AI marches on the
   castle. Royal troops inside hold the courtyard until the walls are breached.
3. *The breach.* Wall sections (2,600 HP) and the gate (1,800 HP) are destructible. Breaching charges and
   airstrikes do it fast; rebel soldiers pressed against the gate batter it down slowly while the wall
   archers shoot them.
4. *The King.* King Henry IV and his guard stand before the keep.

**Win:** kill King Henry IV. **Lose:** Hotspur dies, or the rebel army falls below 12%.
**Twist:** at 2:00 Owain Glyndŵr arrives from the west with the Welsh host. Historically he never came.

## 3. Units (medieval)

| Type | Role | Notes |
|---|---|---|
| Longbowmen | ranged volleys to 150 m | arrows are real ballistic projectiles; skirmish back from melee |
| Men-at-Arms | heavy infantry | armoured, slow, the anvil |
| Spearmen / Billmen | anti-cavalry | 3× damage against horse |
| Knights | shock cavalry | charge bonus above 5.5 m/s; hunt archers, ride down fleeing men |
| Commanders | Hotspur, Henry IV, Prince Hal, Glyndŵr | morale aura (40 m); a commander's death sends a shock through the whole army |

Soldiers are grouped into **regiments** that keep formation slots around a moving anchor. The anchor waits
for stragglers (cohesion), so blocks advance as blocks and dissolve into melee once in contact.

## 3b. The royal castle

A curtain wall laid out on the navigation grid: 22×14 cells (88×56 m), round towers at the corners, the
middle of each side and flanking the gatehouse, plus an indestructible keep. Every wall and gate cell is a
blocked, destructible nav cell, so breaching one re-opens pathfinding through it automatically (the cached
flow fields are invalidated). Wall archers (the *garrison*) stand at 8 m. They can't be reached in melee or
by the SUV, arrows aimed at them fly at the right height, and they fall when their wall section goes.
Melee soldiers don't chase enemies on the other side of a wall (line-of-sight check on the nav grid).

## 4. Modern arsenal

| Asset | Effect | Limits |
|---|---|---|
| Assault rifle | hitscan, headshots ×2.5 | 30-round magazine, 300 reserve |
| Combat shotgun | 10 pellets, range falloff | 8 shells |
| Grenade launcher | 7 m blast, knock-back, mass panic | 6 rounds, 30 reserve |
| Armoured SUV | ramming kills, ignores arrows | 1,500 HP; knights and spearmen slow it |
| Attack helicopter | 30 s orbit, minigun bursts and rockets | 80 s cooldown |
| Airstrike | 5-bomb line, 10 m blasts | 50 s cooldown |
| Longsword | combo, spin, charged heavy, lunge, block; kills rally nearby rebels | unlimited, but you have to get close |
| Breaching charge (C4) | 4 s fuse, blows open walls and gates | 3 carried, restocked at the SUV |

Explosions do more than damage. They drain morale up to 2.8× the blast radius and erode royal loyalty, so
the right strike at the right moment routs a regiment without killing most of it.

## 5. Morale and loyalty

Each soldier has **morale** (will to fight now) and **loyalty** (to their side).

* Morale drifts with local odds (allies against enemies within 10 m), a nearby commander, regimental losses,
  and proximity to the operative.
* Shocks: a comrade dying nearby, gunfire, explosions, a commander's death.
* Below 0.2 a soldier **routs** and flees toward his own baggage lines. Routers rally above 0.55 if no enemy
  is within 18 m; routers who reach the map edge leave the battle.
* Routing royal soldiers with loyalty below 0.35 may **defect** and join a rebel *Turncoats* regiment.

## 6. Technical architecture

```
 main thread                                         simulation worker (src/sim)
 ───────────                                         ───────────────────────────
 render (Three.js, instancing)   ◀── snapshot 20 Hz ── Sim.step(): grid → commanders → regiments →
 player, weapons, hit tests                             per-soldier think → integrate → arrows
 command UI, HUD                 ── commands ───────▶  orders, damage, explosions, palisades
```

* **Data-oriented sim.** Soldiers are struct-of-arrays typed arrays. The spatial hash rebuild is a counting
  sort with no allocations. Typical cost is about 2 ms per tick for 3,000 soldiers.
* **Pathfinding with flow fields.** A 160×160 nav grid (river, woods, palisades). Dijkstra integration fields
  are cached per goal (LRU) and shared by every soldier heading there. A straight-line check skips the field
  when the way is clear.
* **Staggered thinking.** Target searches and morale updates run about twice a second per soldier, spread
  across ticks. Archers pick targets per regiment to avoid 150 m neighbour queries.
* **Rendering.** One `InstancedMesh` per (unit type × livery/gear part): 10 draw calls for the whole army.
  Team colour is per-instance, so defectors change colour for free. Animation is procedural (bob, lean, death
  fall), interpolated between 20 Hz snapshots. Arrows are instanced too.
* **Player authority split.** The main thread hit-tests bullets against interpolated positions (capsule test)
  and sends `damage` / `explode` messages. The worker is authoritative for everything else.

### Scaling past one worker (next step)
The per-soldier `think()` phase only reads shared state and writes that soldier's own fields, except damage,
which can be emitted as events. That makes it straightforward to split across N workers with
`SharedArrayBuffer` (this needs COOP/COEP headers): partition soldier ranges per worker, merge damage events
on the coordinator, then integrate. The target is 10,000+ soldiers.

## 7. Roadmap

1. **Campaign.** Linked battles across 1403–1405 (Shrewsbury → Battle of Grosmont → Siege of Harlech), with a
   strategic map, Glyndŵr's parliament at Machynlleth, and a timeline meter showing how far history has shifted.
2. **Logistics.** Ammunition is the core strategic resource. Supply drops are rare, and you can recover
   munitions from the SUV.
3. **More assets:** sniper rifle, drones for scouting in command view, mortar teams, night-vision night raids.
4. **Counter-play:** royal commanders learn. They spread out after airstrikes, use mantlets against gunfire,
   and dig pits against the SUV.
5. **Siege and building:** stakes against cavalry, trenches, field guns crafted by "your" smiths.
6. **Content and art:** skinned, animated soldiers (GPU vertex animation textures), heraldry per regiment,
   audio barks, weather (the real battle was fought in the late afternoon).
7. **Multi-worker simulation** (section 6) and LOD impostors for 10k+ soldiers.
