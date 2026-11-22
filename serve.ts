// Coral Bay Syndicate — zero-dependency static server (Node ≥ 18, TypeScript
// syntax kept to erasable types so `node --experimental-strip-types serve.ts`
// works, as does any TS runner). Prefer main.ts under Deno; this is the
// fallback for a plain Node install:
//
//   node serve.ts                                    → http://localhost:8080
//
// Serves game/ only, refuses path escapes, and never touches the network
// beyond the local listener.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const GAME_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "game");
const PORT = 8080;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

export function resolveInside(urlPath: string): string | null {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, "");
  const target = join(GAME_DIR, clean === "" ? "index.html" : clean);
  return target.startsWith(GAME_DIR) ? target : null;
}

const server = createServer(async (req, res) => {
  const target = resolveInside(new URL(req.url ?? "/", "http://x").pathname);
  if (!target) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log("Coral Bay Syndicate → http://localhost:" + PORT);
});
