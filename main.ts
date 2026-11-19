// Coral Bay Syndicate — hand-in program for the make.fun gta6-01 bounty.
// Copies game/ and screenshots/ into the output directory and writes the
// dossier with the kit's buildDossier helper, byte-identical on every run.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const botDir = process.env.MAKEFUN_BOT_DIR
  ? resolve(process.env.MAKEFUN_BOT_DIR)
  : dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : "/output";

// The output directory itself may be a mount point: never remove it, only
// empty its contents entry by entry, then write fresh copies into it.
if (existsSync(outputDir)) {
  for (const entry of readdirSync(outputDir)) {
    rmSync(join(outputDir, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(outputDir, { recursive: true });
}

cpSync(join(botDir, "game"), join(outputDir, "game"), { recursive: true });
cpSync(join(botDir, "screenshots"), join(outputDir, "screenshots"), { recursive: true });

const dossier = buildDossier(botDir, { text_max_bytes: 163840 });
writeFileSync(join(outputDir, "dossier.json"), dossier);
