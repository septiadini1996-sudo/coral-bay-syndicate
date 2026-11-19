// Coral Bay Syndicate — entry program for the make.fun gta6-01 bounty.
//
// It copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json there with the kit's own library, so the
// grader can rebuild the same dossier from the output and compare bytes.
//
// Two hard lessons are baked in:
//  - The output directory itself is never removed. On the grader it is a
//    mount point, so deleting it fails; only its contents are cleared, one
//    entry at a time, before the fresh copy goes in.
//  - Both directories come from the environment (MAKEFUN_BOT_DIR and
//    MAKEFUN_OUTPUT_DIR) whenever the harness sets them, and only fall back
//    to paths beside this file for local runs.
import { chmodSync, cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const botDir = process.env.MAKEFUN_BOT_DIR ?? here;
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(here, 'out');

// Empty a directory entry by entry, never removing the directory itself.
// A previous run's copies keep the repository's read-only modes, so each
// entry is made writable again before it is removed; without that, a second
// run into the same output would die on its own first run's files.
function wipe(dir: string): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      try { chmodSync(p, 0o700); } catch { /* already writable */ }
      wipe(p);
    }
    try { chmodSync(p, 0o600); } catch { /* a link or already writable */ }
    rmSync(p, { recursive: true, force: true });
  }
}

// The output directory may already exist (a mounted /output always does).
// Create it if needed, then clear only its contents.
mkdirSync(outDir, { recursive: true });
wipe(outDir);

cpSync(join(botDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(botDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`coral-bay-syndicate: game + screenshots copied, dossier ${dossier.byteLength} bytes -> ${outDir}`);
