# Kingslayers

A third-person shooter / real-time strategy hybrid. You are a modern special-operations soldier
sent back to **the Battle of Shrewsbury, 21 July 1403**, with an assault rifle, a shotgun, a grenade
launcher, an armoured SUV, an attack helicopter and airstrikes. Keep Harry "Hotspur" Percy alive,
break King Henry IV's army, and rewrite history.

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
| 1 / 2 / 3, wheel | assault rifle / shotgun / grenade launcher |
| R | reload |
| Z | airstrike on the crosshair |
| X | attack helicopter support |
| F | enter / exit the armoured SUV (ram through formations) |
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

## Tests and benchmark

```bash
npm test           # 60 s headless battle with sanity checks
npm run bench      # full AI-vs-AI battle, reports tick cost
```

The simulation runs at roughly 2 ms per 50 ms tick for 3,000 soldiers on one core.

See [DESIGN.md](DESIGN.md) for the game design and architecture.
