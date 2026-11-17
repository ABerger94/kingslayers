# Kingslayers

A third-person shooter / real-time strategy hybrid. You are a modern special-operations soldier
sent back to **the Battle of Shrewsbury, 21 July 1403**, with an assault rifle, a shotgun, a grenade
launcher, a longsword, breaching charges, an armoured SUV, an attack helicopter and airstrikes.

**Objectives:** keep Harry "Hotspur" Percy alive, break King Henry IV's army in the field, breach the
royal castle (C4, airstrikes, or let your soldiers batter down the gate) and kill the King inside.
Choose Squire, Knight or Kingslayer difficulty on the intro screen.

Every battle is a live simulation of ~3,000 soldiers (up to ~3,600 once Owain Glyndŵr's Welsh arrive),
each with their own targeting, pathfinding, morale and loyalty, running on a Web Worker thread
separate from rendering.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` produces a static site in `dist/` that can be hosted anywhere.

### Controls

| Field (shooter) | |
|---|---|
| WASD / Shift | move / sprint |
| Mouse, LMB, RMB | aim, fire, aim down sights |
| 1 / 2 / 3 / 4, wheel | assault rifle / shotgun / grenade launcher / longsword |
| Q | quick-swap between sword and your last gun |
| Sword | click for a 3-hit combo (the third is a spin), hold to charge a heavy blow, sprint + click to lunge, RMB to block blows and arrows from the front. Sword kills rally nearby rebels |
| R | reload |
| G | breaching charge (C4, 4-second fuse; sticks to walls in front of you). 3 carried |
| Z | airstrike on the crosshair |
| X | attack helicopter support |
| F | enter / exit the armoured SUV (ram through formations). Standing next to it resupplies ammo, health and C4 |
| **Tab** | switch to command view |

| Command (strategy) | |
|---|---|
| LMB / drag | select your regiments (or click them in the roster) |
| RMB ground / enemy | move / attack that regiment |
| H · A · R · G | hold · advance (attack-move) · retreat · hand back to AI |
| B | build a palisade (click start, click end) |
| Z / X | airstrike / gunship at the mouse |
| Space | tactical pause; time runs at 30% in command view anyway |
| WASD, Q/E, wheel | pan, rotate, zoom |

### Xbox controller

Plug in or pair an Xbox controller (or any controller the browser lists as "standard") and press any
button. On-screen hints switch to controller buttons while you're using it. Supports rumble in
Chrome and Edge.

| Field | |
|---|---|
| Left stick / right stick | move (analog) / look, with light aim assist |
| LT / RT | aim down sights / fire (sword: block / tap combo, hold heavy) |
| LB / RB · B | previous / next weapon · sword ⇄ gun |
| D-pad ▲ / ▼ | breaching charge / grenade launcher |
| X · Y | reload · enter/exit SUV |
| hold A or click L3 | sprint |
| D-pad ◀ / ▶ | airstrike / gunship |
| In the SUV | RT gas, LT brake/reverse, left stick steer, B handbrake |
| View | command mode |

| Command | |
|---|---|
| Left stick / right stick | pan camera / move cursor |
| LT / RT | zoom out / in |
| A (hold and move to box-select) · B | select · move or attack order (B also cancels building) |
| LB / RB · L3 · R3 | cycle regiments · select all · hand back to AI |
| X · Y · D-pad ▲ ▼ | hold · palisade · advance · retreat |
| D-pad ◀ / ▶ | airstrike / gunship at the cursor |
| Menu · View | pause · back to the field |

### Troubleshooting

`EPERM: operation not permitted ... node_modules\.vite-temp` on Windows: update to the latest code
(the scripts now load the config without writing that temp file), or run `npx vite --configLoader native`.

## Tests and benchmark

```bash
npm test           # 60 s headless battle with sanity checks, plus a siege test
                   # (field army removed: rebels must batter the gate and kill the King)
npm run bench      # full AI-vs-AI battle, reports tick cost
```

The simulation runs at roughly 2 ms per 50 ms tick for 3,000 soldiers on one core.

See [DESIGN.md](DESIGN.md) for the game design and architecture.
