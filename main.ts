// Coral Bay Syndicate — the handover program for the make.fun gta6-01 entry.
//
// The game is the static site in game/ (open game/index.html in desktop
// Chrome, or serve the folder — see serve.ts). This program is what hands
// the entry in: it copies game/ and screenshots/ into the output directory
// and writes dossier.json there with the kit's vendored dossier builder, so
// the judge reads exactly the files that were handed in.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22, standard library only. It runs twice in grading and must write
// the same bytes both times, so the copy is a plain recursive copy in
// directory order and the dossier comes straight from buildDossier.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored here so a bad entry fails loudly at handover
// instead of silently at grading: at most 4 screenshots of at most 256 KiB,
// and the dossier's source text is capped at 160 KiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function checkScreenshots(dir: string): void {
  if (!existsSync(dir)) throw new Error('screenshots/ is missing — the entry needs 3 or 4 screenshots');
  const shots = readdirSync(dir).filter((name) => !name.startsWith('.')).sort();
  if (shots.length < 3 || shots.length > DOSSIER_CAPS.screenshots.max) {
    throw new Error(`screenshots/ holds ${shots.length} images; the gate wants 3 or 4`);
  }
  for (const name of shots) {
    const bytes = statSync(join(dir, name)).size;
    if (bytes > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`${name} is ${bytes} bytes; a screenshot may be at most 262144`);
    }
  }
}

function handOver(): void {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
  checkScreenshots(shotsDir);

  mkdirSync(outputDir, { recursive: true });
  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`Coral Bay Syndicate handed in: game/ + screenshots/ + dossier.json (${dossier.length} bytes) → ${outputDir}`);
}

handOver();
