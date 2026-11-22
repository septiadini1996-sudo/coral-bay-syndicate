# Coral Bay Syndicate

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Coral Bay Syndicate** is an original open-world crime game built from scratch for the make.fun "Make GTA 6" bounty (competition `gta6-01`). Everything in it was invented for Coral Bay — the city, the characters, the vehicles, the names, the story, the art and the music. It contains no Rockstar IP.

## The city

Coral Bay is a coastal city caught in golden hour: a low, warm sun, long shadows, and a palm-lined coast road. The road network runs to some sixty-three junctions, and the shoreline is anchored by a marina with moored boats and a harbormaster's hut, with beaches running along the coast.

## The story

Vera Lark — a marina fixer in a violet suit and a gold blouse — hires you for the kind of work the harbour would rather not put in writing. Her six-job story chain pays exactly **$6,150** across the chain. Between story jobs, courier work is offered at silver beacons around the city. Every paid job moves you up the ladder, from **Harbour Runner** to **Kingpin of Coral Bay**.

## The Coral Bay PD

The police are not decoration. Coral Bay PD cruisers hunt in packs, and the police response panel tracks each unit by name, with its live distance to you. Officers open fire from two wanted stars. At three stars the PD starts setting **roadblocks**: cruisers parked across the road behind **spike strips** that shred your tyres and wreck the car's handling until you ditch it and take another vehicle. At four stars the **AIR-1 "Kestrel"** helicopter joins the pursuit, sweeping the streets with its searchlight.

## Features

- A three.js open world rendered in warm golden-hour light
- Lane-correct traffic with working traffic lights and car-following behaviour
- GPS routing drawn on a minimap with a pre-rendered base map
- A rich HUD: a weapon bar with ammunition, a mission panel, the police response panel, vehicle status, a rank bar, money, a clock and a radio row
- Five synthesized radio stations to flip through while driving
- 3D-modeled guns, vehicle damage and explosions, and player armour
- A pause that truly freezes game time — nothing ticks behind the menu
- Progress saved in your browser's localStorage

## How to play

You need desktop Chrome. Either:

- serve the repo with the bundled dev server — run `node serve.ts`, then open <http://localhost:8080>; or
- open `game/index.html` directly in the browser.

You can also play online, with nothing to install, via GitHub Pages: <https://septiadini1996-sudo.github.io/coral-bay-syndicate/game/>

**Good to know:** click the game view once to capture the mouse (pointer lock); Esc or P pauses the game and releases it. Money, rank and story progress persist between sessions in localStorage, so you can close the tab mid-campaign and pick the chain back up later — clearing the browser's site data is what resets them.

## Controls

| Input | Action |
| --- | --- |
| WASD | Walk / drive |
| Mouse (pointer lock) | Look and aim |
| E | Interact; enter and exit vehicles |
| Shift | Sprint |
| Esc or P | Pause |

## Screenshots

All four shots are real renders of the game itself.

- `screenshots/1-cover.jpg` — a golden-hour chase along the coast road, the Kestrel overhead
- `screenshots/2-marina.jpg` — Vera at the marina
- `screenshots/3-mission.jpg` — the "Glass Eels" story beat
- `screenshots/4-roadblock.jpg` — approaching a police roadblock

## Tech

Coral Bay Syndicate is plain static files: no build step, and the game makes no network requests at runtime. The root `main.ts` is a Node 22 handover program that packages `game/` and `screenshots/` together with a dossier for the bounty judges.

## License

MIT — see [LICENSE](LICENSE).
