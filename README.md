# TIMEFALL: Crown & Caliber

A single-player third-person shooter / real-time strategy hybrid. A rogue time-traveller, **the Usurper**,
has broken history. You are sent back to Owain Glyndŵr's rebellion in 1403 with a rifle and **the Handler**
in your ear, who runs the **Depot** and sends gear from the future in exchange for the silver you loot.

Fight on the front line, zoom out to command your army, build your settlement, take prisoners, and steer
history toward the ending you choose. But every piece of modern tech you use **fractures the timeline**.

Built to the vertical slice in *Kingmakers-Style Single-Player Game — Design Doc* (Nov 2026). See
[DESIGN.md](DESIGN.md) for what is implemented and what is next.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

On the title screen choose **New campaign**, **Continue campaign**, or **Quick battle: Shrewsbury**
(the full battle with the full arsenal, outside the campaign). The campaign saves in your browser.

### The campaign loop

1. **Campaign map:** pick a mission (raid, settlement defense, field battle and siege), choose your two guns, deploy.
2. **Battle:** fight in third person, switch to command view, loot silver, capture wounded officers.
3. **Settlement:** place buildings freely (House, Farm, Lumber Mill, Barracks) around the **Temporal Beacon**,
   upgrade the Beacon to unlock better Depot tiers, recruit squads.
4. **Depot:** spend silver on guns (pistol, crossbow, shotgun, SMG, rifle, sniper, grenade launcher, rocket
   launcher), call-ins (supply drops, gunship, airstrikes), C4 and the armoured SUV.
5. **Army:** recruit squads (incl. late-game **Sappers** and **Handgonners**) and assign lieutenants.
6. **Operative:** spend skill points earned from XP on four skill trees: Marksman, Commander, Engineer, Juggernaut.
7. **Keep:** decide each prisoner's fate: Ransom, Interrogate, Recruit (as a lieutenant), or Execute.

### Lieutenants and smarter armies

Recruited prisoners become lieutenants, each with a personality that decides how his squad fights when you
leave it to the AI: **Aggressive** (wedge, charges early), **Defensive** (shield wall, holds its ground) or
**Flanker** (swings wide and hits engaged enemies in the side). Royal captains have personalities too, so
watch for knights circling around your flank. Both generals now pick fights they can win (spears hunt
cavalry, swords hunt spears), gang up on enemies already locked in melee, and pull battered regiments back
to their commander to rally.

### Kill streaks and hit feedback

Headshots, armour glances (you need a bigger gun) and kills each have their own marker and sound. Kill
streaks pay out: 5 kills, a second wind (+30% health, magazine topped up); 8, terror (nearby royal soldiers
lose their nerve); 12, the Handler sends a breaching charge.

Act 1: *The Hanmer Raid* → *Reprisal at Sycharth* (defend your settlement). Act 2: repeatable *Royal Silver
Convoy* raids and *Shrewsbury, 21 July 1403* (field battle, then storm the castle and kill the King).
Your Timeline Instability and your choices decide the ending. Post-game: **Endless Siege**.

### Timeline Instability

A 0–100% meter. Modern gear raises it (a pistol barely; airstrikes a lot), and so does killing or capturing
historical figures. Light-touch missions let history heal. As it rises, the past fights back:

| Instability | Effect |
|---|---|
| 30%+ | royal archers field crude **handgonnes** |
| 60%+ | **the Usurper's agents**, rival time-travellers with rifles, hunt you |
| 80%+ | **time storms** strike the battlefield |
| 100% | **timeline collapse**: game over |

### Controls

| Field (shooter) | |
|---|---|
| WASD / Shift / mouse | move / sprint / aim |
| LMB · RMB | fire · aim (sniper scope) / block with the sword |
| 1 / 2 · 3 or Q | your two guns · longsword |
| | the **crossbow** is silent and never raises instability; the **rocket launcher** blows walls open |
| Hold C | **arm buckler**: parry blows and arrows from the front, even while holding a gun |
| V | **sledgehammer** bash: staggers even armoured knights |
| E | capture a wounded officer (they pulse gold on the ground) |
| R | reload (stowed guns reload themselves; total ammo is limited, so call in supply drops) |
| T · G | supply drop at your aim point · breaching charge |
| Z · X · F | airstrike · gunship · enter/exit the SUV |
| Tab | command view (time slows to 20%) |

| Command (strategy) | |
|---|---|
| LMB / drag · RMB | select squads · move / attack |
| H · A · C · F · R · G | hold · advance · **charge** · **follow me** · retreat · back to AI |
| 1 · 2 · 3 | **line** · **wedge** (hits harder) · **shield wall** (slow; arrows barely hurt) |
| B · Space | palisade · tactical pause |

Armor matters: pistols drop archers and spearmen; men-at-arms need a rifle; plate knights need the sniper,
a headshot, the sledgehammer or explosives. Swordsmen beat spearmen, spearmen beat cavalry, cavalry beat
archers.

### Xbox controller

Press any button on the controller. On-screen hints switch to it while you're using it.

| Field | |
|---|---|
| Sticks · LT · RT | move/look · aim/block · fire/swing |
| LB (hold) · RB · B · R3 | buckler · next weapon · sword ⇄ gun · sledgehammer |
| X · Y | reload · capture an officer (when close) / enter the SUV |
| Hold A or L3 | sprint |
| D-pad ◀ ▶ ▲ ▼ | airstrike · gunship · C4 · supply drop |
| View | command mode |

| Command | |
|---|---|
| Left / right stick · LT/RT | pan / cursor · zoom |
| A · B | select · order |
| X · Y · ▲ · ▼ | hold · charge · advance · retreat |
| LB/RB · L3 · R3 | cycle squads · select all · next formation |
| Menu · View | pause · back to the field |

If the controller misbehaves (aim drifts, D-pad does nothing), open **Controller setup** on the title screen
(or press **F2** in game) and map it. It's saved in the browser.

### Troubleshooting

`EPERM: operation not permitted ... node_modules\\.vite-temp` on Windows: update to the latest code (the
scripts load the config without writing that temp file), or run `npx vite --configLoader native`.

## Tests and benchmark

```bash
npm test                                             # battle sanity test + castle siege test
node tools/balance.mjs                               # AI-vs-AI kill ratios per mission
node tools/balance.mjs --squads raid                 # lieutenants, Handgonners, Sappers compared
node tools/headless-battle.mjs --mission=raid        # also: convoy, defense, endless, shrewsbury
node tools/headless-battle.mjs --mission=raid --instability=90   # handgonnes, agents, time storms
```
