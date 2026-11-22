# Coral Bay Syndicate

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for the make.fun "Make GTA 6" bounty,
written from scratch for this entry. No Rockstar IP: the city, characters,
vehicles, names, story, art and music are all invented for Coral Bay.

The sun is going down on a coastal city of some sixty-five road junctions,
and Vera Lark — marina fixer, violet suit, gold blouse — is hiring. Run her
six-job story chain (exactly $6,150 across the chain), take courier work off
the silver beacons, climb from Harbour Runner to Kingpin of Coral Bay, and
mind the Coral Bay PD: cruisers that hunt in packs, officers who shoot from
two stars, roadblocks with spike strips at three, and the AIR-1 "Kestrel"
helicopter with its searchlight at four.

## Play it

```sh
node serve.ts          # then open http://localhost:8080
```

Any static file server pointed at `game/` works just as well — the game is
plain static files (three.js vendored under `game/vendor/`) with no build
step and no network requests. Desktop Chrome, keyboard and mouse.

**Controls** — WASD move/drive · mouse look, right mouse aim, left mouse
fire · **E** talk / enter & exit cars · **Shift** sprint · **1/2/3** fists,
pistol, SMG · **R** reload on foot, change radio station in a car ·
**Space** handbrake · **M** mute · **Esc/P** pause. Progress saves to
localStorage after every paid job; pause freezes game time completely.

## What's in the bay

- **A living city** — lane-correct right-hand traffic that queues at red
  lights, ~38 cars (traffic, parked, police), ~22 pedestrians who stroll,
  gather at the marina and flee from trouble, traffic lights, palms, towers.
- **A golden-hour look** — low warm sun with one crisp 2048 shadow map,
  gradient peach sky, warm fog, ACES tone mapping, pixel ratio capped at 1.5.
- **Crime and response** — a 0–5 star wanted system that cools while you are
  unseen, pursuit steering with target lead, a bust meter, tyre-shredding
  spike strips, vehicle damage and explosions, armour and health.
- **Story and side work** — six named jobs from Vera ("First Errand",
  "Dockside Run", "Glass Eels", "Cold Storage", "Harbour Lights", "The Long
  Goodbye") plus repeatable courier runs.
- **A full HUD** — mission panel with live step distances, a police response
  panel naming every unit and its distance, minimap with GPS route and
  flashing police blips, weapon bar, vehicle status, radio row, ranks.
- **Synthesized sound** — five WebAudio radio stations (pop, synthwave,
  jazz, talk, rock), engine, sirens that swell as units close in, rotor
  wash, gunfire and booms. No audio files.

## Layout

- `game/index.html` — page, CSS and all HUD markup.
- `game/src/` — one file per job: `util.js` (maths, Dijkstra), `city.js`
  (world, road graph, golden-hour rig), `vehicles.js` (cars, traffic,
  damage), `people.js` (pedestrians, Vera), `police.js` (wanted system,
  roadblocks, helicopter), `story.js` (missions, saving), `audio.js`
  (synth radio and SFX), `hud.js` (every overlay), `main.js` (loop, input,
  cameras, gunplay, staged screenshot scenes via `?shot=1..4`).
- `main.ts` — the handover program: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json` with the vendored library.
- `screenshots/` — four real renders of the game (see `shots.json`).

## License

MIT — see `LICENSE`.
