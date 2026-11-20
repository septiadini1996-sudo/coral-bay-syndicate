// Coral Bay Syndicate - entrypoint (Node 22, standard library only).
//
// This program hands the game in. It stages the entry into the output
// directory (MAKEFUN_OUTPUT_DIR locally, /output in the grader):
// copies game/ and screenshots/ across, verifies the staged tree
// against the scorer's published caps, and writes dossier.json with
// the vendored make.fun library so the dossier is exactly the bytes
// the gate rebuilds for itself. The staging is a pure copy plus a
// content-derived dossier, so two runs write identical bytes. The
// output directory itself is never deleted, only created if missing
// and written into.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Stage the two payload trees beside this program's output dossier.
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Verify what was staged before summarizing it: walk both trees and
// refuse early, with the cap named, if anything is over its limit.
function walk(dir: string, base: string, acc: { files: number; bytes: number }): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, rel, acc);
    else {
      acc.files += 1;
      acc.bytes += st.size;
      if (Buffer.byteLength(rel) > CAPS.game_path_max_bytes) {
        throw new Error('path over cap: ' + rel);
      }
    }
  }
}
const gameStats = { files: 0, bytes: 0 };
walk(join(outDir, 'game'), '', gameStats);
if (gameStats.files > CAPS.game_max_files) throw new Error('game file count over cap: ' + gameStats.files);
if (gameStats.bytes > CAPS.game_max_bytes) throw new Error('game bytes over cap: ' + gameStats.bytes);

const shotDir = join(outDir, 'screenshots');
const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.')).sort();
if (shots.length > CAPS.screenshots.max) throw new Error('too many screenshots: ' + shots.length);
for (const shot of shots) {
  const size = statSync(join(shotDir, shot)).size;
  if (size > CAPS.screenshots.max_bytes) throw new Error('screenshot over cap: ' + shot + ' (' + size + ' bytes)');
}

// The dossier is a pure function of the staged tree's contents.
const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(
  'coral-bay-syndicate: staged ' + gameStats.files + ' game files (' + gameStats.bytes + ' bytes), ' +
  shots.length + ' screenshots, dossier ' + Buffer.byteLength(dossier) + ' bytes',
);
