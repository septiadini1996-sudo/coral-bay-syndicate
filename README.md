# Coral Bay Syndicate

An original open-world crime game that runs entirely in the browser.
You are **Rico**, a driver-for-hire in the sun-soaked coastal city of
Coral Bay. Take six jobs from Celia, Marco and Vera — deliveries,
a stolen prize coupe, a convoy ambush and a bank score — work your way
up the Syndicate Rank from *Nobody* to *Kingpin*, and finish with the
finale card: **CORAL BAY IS YOURS**. The full chain pays **$6,150**.

Everything is hand-built for this entry: the city, the characters,
the vehicles, the story and even the radio music (synthesized live
with WebAudio — there are no audio files). The only library is
three.js, vendored under `game/vendor/`.

## How to run

Serve the `game/` folder with any static file server and open
`index.html` in a desktop browser, e.g. from this repository root:

```
node serve.ts          # then open http://localhost:8080
```

or `npx serve game`, `python3 -m http.server -d game`, etc.
No build step, no network requests: the game is plain static files.

To hand the entry in (what the grader runs):

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory,
verifies the staged tree against the competition caps, and writes
`dossier.json` using the vendored make.fun library in
`vendor/makefun-game.ts`. Running it twice produces identical bytes.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (pointer lock); drag rotates aim |
| Shift | Sprint |
| E | Enter / exit the nearest car |
| 1 / 2 / 3 | Fists / pistol / SMG |
| Click | Fire pistol (a clean click — dragging only aims) |
| Hold click | SMG automatic fire |
| M | Full-screen GPS map |
| Tab | Mission menu |
| , / . | Previous / next radio station |

## The world

- A procedural coastal city on a 160-unit road grid (about ±1,300
  units), with named buildings and big readable sign boards, parks,
  palm trees and **270+ street lamps** — 800+ collision circles in all.
- Working **traffic lights at 10 intersections**; AI traffic
  (22 cars: sedans, taxis, pickups) drives the road graph, keeps its
  lane and stops at red.
- The **marina** on the south shore: a walkable pier, docked boats,
  beach palms — and Celia, your first contact, waiting at the pier end.
- **32 pedestrians** plus story characters. Story characters are part
  of the plot: shot at, they duck and flee — they can never die.

## Systems

- **Combat & vehicles:** three weapon slots with ammo and a weapon
  bar. Cars have real health — the vehicle panel shows CONDITION %.
  Below 45 health a car smokes; a car destroyed by gunfire or an
  explosion **blows up** (fire, area damage, chain reactions). Cars
  wrecked by crashes alone never explode. Vehicle impacts knock
  pedestrians down; survivors get up and run.
- **Aiming:** drawing a weapon shifts the camera over Rico's shoulder
  so his head clears the crosshair; the crosshair turns red
  (#ff5a4d) when a target is inside the aim cone. Armed, Rico carries
  a visible multi-part 3D gun.
- **Police:** a five-star wanted system. The police panel shows the
  state (SEARCHING / PURSUIT), active units and the nearest unit's
  distance. Lose them and the heat cools; get pinned and you are
  busted — death and arrest both respawn you with armor reset to 0.
- **Armor:** three vest pickups in the world grant +50 armor; armor
  absorbs damage before health.
- **GPS:** Dijkstra routing over the road graph, drawn as a gold
  ribbon in the world, a line on the minimap and the full map, plus a
  HUD direction arrow.
- **Radio:** five synthesized stations; switching updates the radio
  bar and pops a toast.
- **Progress:** cash, lifetime earnings (Syndicate Rank), armor, ammo
  and story progress persist in `localStorage`.

## Layout

- `game/index.html` — page, HUD markup and styles
- `game/src/util.js` — state hub, RNG, collision grid, save/load
- `game/src/world.js` — city, marina, lamps, traffic lights, road graph
- `game/src/people.js` — person builder, pedestrians, story cast, player
- `game/src/vehicles.js` — cars, traffic AI, damage and explosions
- `game/src/police.js` — wanted system and pursuing cruisers
- `game/src/story.js` — subtitled cutscene dialogue
- `game/src/missions.js` — the six-job chain and the GPS marker
- `game/src/hud.js` — HUD, minimap, full map, menus, route ribbon
- `game/src/audio.js` — WebAudio radio stations and sound effects
- `game/src/main.js` — boot, input, cameras, shooting, frame loop
- `screenshots/` — four screenshots of the running game
