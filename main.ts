// Coral Bay Syndicate — hand-in program for the make.fun gta6-01 bounty.
// Copies game/ and screenshots/ into the output directory and writes the
// dossier with the kit's buildDossier helper, byte-identical on every run.
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const botDir = process.env.MAKEFUN_BOT_DIR
  ? resolve(process.env.MAKEFUN_BOT_DIR)
  : dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : "/output";

// The repo is mounted read-only, so a plain copy would inherit no-write
// permission bits and a later run could not clear its own output. Walk the
// tree and force owner-writable modes before deleting, and normalize the
// modes of everything we write so repeat runs behave identically.
function walk(path, fn) {
  fn(path);
  if (lstatSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry), fn);
  }
}
function makeWritable(path) {
  walk(path, (p) => { try { chmodSync(p, lstatSync(p).isDirectory() ? 0o755 : 0o644); } catch { /* best effort */ } });
}

// The output directory itself may be a mount point: never remove it, only
// empty its contents entry by entry, then write fresh copies into it.
if (existsSync(outputDir)) {
  for (const entry of readdirSync(outputDir)) {
    const target = join(outputDir, entry);
    makeWritable(target);
    rmSync(target, { recursive: true, force: true });
  }
} else {
  mkdirSync(outputDir, { recursive: true });
}

cpSync(join(botDir, "game"), join(outputDir, "game"), { recursive: true });
cpSync(join(botDir, "screenshots"), join(outputDir, "screenshots"), { recursive: true });
makeWritable(join(outputDir, "game"));
makeWritable(join(outputDir, "screenshots"));

const dossier = buildDossier(botDir, { text_max_bytes: 163840 });
const dossierPath = join(outputDir, "dossier.json");
writeFileSync(dossierPath, dossier);
try { chmodSync(dossierPath, 0o644); } catch { /* best effort */ }
