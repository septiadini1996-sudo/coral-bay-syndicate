// Coral Bay Syndicate — the handover program (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a
// browser and play; no build step, no network). This program performs the
// make.fun handover: it copies game/ and screenshots/ from beside this file
// into the output directory — /output inside the grader, or the directory
// MAKEFUN_OUTPUT_DIR names outside it — and writes dossier.json there with
// buildDossier from the vendored make.fun library, under the scorer's caps.
// It then prints a one-line summary of what was handed over, so a human
// running it by hand can see the entry is whole before submitting.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, as the competition's gate states them: the dossier text
// is capped at 160 KiB, screenshots at 4 files of 256 KiB, game/ at 993
// entries and 48 MiB with no path over 1000 bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) count += copyTree(src, dst);
    else if (entry.isFile()) {
      cpSync(src, dst);
      count++;
    }
  }
  return count;
}

mkdirSync(outputDir, { recursive: true });
const gameFiles = copyTree(join(repoDir, 'game'), join(outputDir, 'game'));
const shotDir = join(repoDir, 'screenshots');
const shotFiles = existsSync(shotDir) ? copyTree(shotDir, join(outputDir, 'screenshots')) : 0;

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

const shotBytes = existsSync(join(outputDir, 'screenshots'))
  ? readdirSync(join(outputDir, 'screenshots')).reduce(
      (sum, name) => sum + statSync(join(outputDir, 'screenshots', name)).size,
      0,
    )
  : 0;
console.log(
  `coral-bay-syndicate: handed over ${gameFiles} game files and ${shotFiles} screenshots ` +
    `(${shotBytes} bytes) with a ${dossier.length}-byte dossier.json to ${outputDir}`,
);
