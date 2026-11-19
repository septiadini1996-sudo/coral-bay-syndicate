# Coral Bay Syndicate

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/septiadini1996-sudo/coral-bay-syndicate/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game that runs entirely from static files in
the browser — no build step, no network, no downloaded assets. You are
**Rico Solano**, a fixer with a fedora, a gold chain and big plans, loose in
the sun-soaked island city of Coral Bay: downtown towers, a working marina,
a beachfront coast road, the villas of Palmera Heights, an airport with a
runway and a parked jet, and the yards and lockups of the industrial quarter.

## The Syndicate — a six-job story chain

Work for three contacts, each with a beacon on the map and a pulsing marker
on the minimap. Briefings, objectives with live distance readouts, timers,
payouts — and progress (cash, completed jobs, your best race time) saved in
the browser between visits.

1. **Opening Night** (Celia, the marina) — take her pink Comet GT and drive
   her to the Starfish Club downtown against the clock. *Pays $300.*
2. **Paper Trail** (Marco, downtown) — recover three ledger cases hidden in
   downtown alleys and bring them back. The last pickup brings the heat.
   *Pays $450.*
3. **Hot Metal** (Marco) — steal the Dune Crusher monster truck from the
   industrial yard and deliver it to the lockup while wanted level 2 hunts
   you. *Pays $650.*
4. **Bay Runner** (Celia) — a Falco RR sport bike, six checkpoints down the
   beachfront coast road, one 95-second clock. *Pays $800.*
5. **Sky High** (Don Falso, Palmera Heights) — steal the airport helicopter
   at wanted level 3 and set it down on the marina helipad. *Pays $1,200.*
6. **The Syndicate** (Don Falso, finale) — collect tribute at three spots
   across the city, then outrun a wanted-level-4 manhunt to the safehouse.
   *Pays $2,500 — and Coral Bay is yours.*

After the chain, the city keeps paying: Celia always has a **delivery run**
($150), and the **Bay Runner rematch** board at the beachfront start line
pays $400 for beating the clock again.

## The story, told in cutscenes

- Every chapter opens with a short **in-engine cutscene**: the camera glides
  around Rico and his contact while their dialogue plays as **Indonesian
  subtitles** with a hand-drawn-in-code **face portrait** and name for every
  speaker — Rico, Celia, Marco and Don Falso. Enter or a click skips.
- A persistent **mission tracker** under the minimap always shows the current
  chapter ("CHAPTER 2 — Paper Trail"), its objective and the live distance.
- The **mission menu** (Tab / J, or the 📋 button) lists all six chapters with
  their status — Selesai ✓ / Aktif / Berikutnya / Terkunci — giver, district
  and payout; finishing a chapter flashes a **CHAPTER COMPLETE +$450** card.
- Press **M** (or click the minimap) for the **full-screen map**: the whole
  island from the same painted ground canvas, district names, a legend,
  police blips, the objective, and the next chapter's giver wearing its
  **chapter number** — the minimap badges the number too.
- The pause menu's **TOKOH** panel introduces the four faces of the Syndicate
  with portraits, names and roles; in the world, every named character wears
  a floating name plate when you come within talking distance.
- And a fix the bay demanded: Rico now truly **sits in the driver's seat** of
  everything he steals — fedora, shades and all, visible through the glass —
  and steps out at the door when he leaves. No more kerbside ghosts.

## The law

- Wanted level 1–5, shown as stars. Interceptors pursue with real steering
  AI and flashing light bars, and will run Rico down if he is on foot.
- At **3 stars** the CBPD sets **roadblocks** — two Interceptors parked
  across the road ahead of you.
- At **4 stars** a **police helicopter** tracks you with a real spotlight
  cone and searchlight.
- Stand still near a unit and the bust meter fills: **BUSTED** means a fine
  and a dawn release at the safehouse. Health at zero means **WASTED** and a
  hospital bill. Keep your nose clean at low heat and the stars cool off.

## The machines

Everything with wheels (or rotors) can be stolen and driven, each with its
own handling: the **Comet GT** sports coupe, the vintage **Heritage
Roadster**, the **Dune Crusher** monster truck on huge wheels, the **Marlin
250** cruiser motorcycle, the **Falco RR** sport bike that leans into
corners, a **Beach Cruiser** bicycle, and a fully flyable **helicopter**
(R/F to climb and sink). Ambient traffic — sedans, pickups and vans — works
the grid, brakes for obstacles and gets out of the way (or doesn't).
Vehicles dent, smoke, and wreck.

## The living city

- A full day cycle: dawn, blue midday, golden hour, purple dusk, and nights
  with stars, a moon, lit windows and waking street lamps.
- Weather that rolls in off the bay: clear spells, hot haze, and **rain**
  with pooled streak particles, wet glossy roads and synthesized rain audio.
- Pedestrians in gangster styling — fedoras and panama hats, sunglasses,
  gold chains, tropical prints — walking the sidewalks and fleeing trouble;
  dogs trotting the beach and marina; seagulls circling the piers; moored
  boats bobbing under a striped lighthouse.
- The circular **minimap is the real map**: it is drawn from the same
  painted ground texture as the city itself, with police blips, giver
  markers, a pulsing objective marker and your heading arrow.
- Fists, a baseball bat, a lead pipe and a pistol, all found in the world.
- Fully synthesized WebAudio sound: engines, sirens that swell as units
  close in, rain, mission stingers — and a four-station car radio (Q, 1, 2).

## Controls

WASD/arrows to walk and drive · Shift sprint · Space jump / handbrake ·
E steal, enter, exit, talk · F or click to fight and shoot · Q and 1/2 for
the radio · R/F helicopter climb and sink · M full-screen map · Tab/J mission
menu · Enter skip cutscene · mouse drag to orbit the camera, wheel to zoom ·
P pause.

## Tech

Vanilla JavaScript over a vendored three.js build. The world, its ground
texture and its minimap all come from one seeded procedural paint of the
city, so Coral Bay is identical on every visit. `game/` is plain static
files; `main.ts` is the hand-in program that copies the game and its
screenshots to the output directory and writes the entry dossier.

Screenshots in `screenshots/` are posed with the game's own staging scenes
(`game/index.html?scene=chase` and friends) and captured unedited.
