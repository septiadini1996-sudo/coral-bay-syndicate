# Coral Bay Syndicate

An original open-world crime game for the browser, built for make.fun's
**Make GTA 6** bounty (gta6-01). No assets, names or places from any existing
game: the city, the people and the trouble are all Coral Bay's own.

You are **Jules Cordero**, a broke driver in a sun-soaked coastal city.
Fixer **Vera Lark** works out of the marina and quietly runs the bay; her
six-job story chain — package runs, a stolen coupe to recover, a boat-parts
heist, a timed dash, a hold-up and a final score against the rival Glass
Eels — pays exactly **$6,150** and climbs you from Rookie to Kingpin.
Between jobs, a courier desk and the Chop Shop pay for side work.

## Play it

Open `game/index.html` in desktop Chrome, or serve the folder with the
bundled zero-dependency server:

```
node serve.ts            # → http://localhost:8080
```

Any static file server pointed at `game/` works just as well, and on GitHub
Pages the game plays at the repository's Pages address under `/game/`.
(`main.ts` is not a server — it is the make.fun handover program described
at the bottom of this file.)

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move, drive |
| Mouse (pointer lock) | Look; over-the-shoulder when aiming |
| Right mouse (hold) | Aim |
| Left mouse | Fire |
| 1–4 | Fists / Pistol / SMG / Rifle |
| E | Talk, pick up, enter & exit cars |
| Shift | Run |
| Space | Handbrake |
| R | Next radio station (in a car) |
| M | Radio on/off |
| P | Pause (game time truly freezes) |

Progress — money, weapons, story position — saves to the browser
automatically after every job.

## What's in the world

- **The city**: a road grid with lane-correct right-hand traffic, smooth
  cornering and car-following; working traffic lights; roughly 18 traffic
  cars plus parked cars; pedestrians who stroll, chat and run from gunfire;
  a beach and marina with boats; palms along the coastal road.
- **Golden hour**: the game's signature light — a low warm sun, long
  shadows, amber fog and ACES tone mapping — is the default look.
- **Police**: a 0–5 star wanted system. Coral Bay PD spawns named units on
  the road grid ("Unit K-9 · Vega", "Air One"…) listed live, with distances,
  in the Police Response panel. Officers shoot from 2 stars; at **3 stars**
  they throw **roadblocks** — cruisers parked across your route with a spike
  strip that shreds your tyres until you change cars; at **4 stars** a
  **helicopter** joins with a spinning rotor and a sweeping searchlight.
  Boxed in, a bust meter fills; break line of sight and the heat cools.
- **Driving**: steal anything parked or moving; cars take damage, smoke,
  burn and explode (splash damage included); a working 5-station radio, all
  synthesised live — there are no audio files in this game at all.
- **Combat**: four 3D-modelled weapons, armour, hostile Glass Eels who
  fight back, headshot bonuses.
- **HUD**: weapon bar with ammo, mission panel with the current step and
  distance, police panel, vehicle status and speed, rank bar, money and
  clock, and a minimap whose base map is pre-rendered once, with a GPS route
  drawn over the road graph and blinking police blips.

## The four screenshots

`screenshots/` holds real renders of this code, taken with the game's own
deterministic staging (`game/index.html?shot=<name>&seed=1`, see
`shots.json`): the cover is a four-star golden-hour chase on the coastal
road with the helicopter up and the full HUD in frame; then the marina at
golden hour, a story moment with Vera, and a chase meeting a roadblock.

## Layout

- `game/index.html` — page, HUD markup and styles
- `game/src/util.js` — maths, seeded RNG, the road graph and GPS routing
- `game/src/world.js` — the city: roads, buildings, marina, golden-hour light
- `game/src/vehicles.js` — cars, traffic AI, damage, explosions, entering cars
- `game/src/people.js` — the player, pedestrians, gunmen, combat, armour
- `game/src/police.js` — wanted heat, pursuit, roadblocks, the helicopter
- `game/src/story.js` — the cast, the six jobs, side work, ranks
- `game/src/missions.js` — the mission state machine and its staging
- `game/src/audio.js` — WebAudio: five radio stations, engine, sirens, effects
- `game/src/hud.js` — HUD, minimap, subtitles, notifications
- `game/src/main.js` — boot, input, loop, pause, saving, screenshot staging
- `game/vendor/three.min.js` — three.js (vendored, MIT)
- `main.ts` — the make.fun handover program: copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json` with the
  kit's `vendor/makefun-game.ts`
- `serve.ts` — a tiny local static server for playing the game

## Handing it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed — see `LICENSE`. three.js is © its authors, MIT, vendored
unmodified as `game/vendor/three.min.js`.
