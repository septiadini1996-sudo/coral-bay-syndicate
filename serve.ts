// serve.ts - a small static file server for developing Coral Bay Syndicate.
//
// The game is plain static files under game/, with no build step, so all it
// takes to play it locally is something that answers HTTP requests with
// those files and the right content types:
//
//   node serve.ts              serves game/ at http://localhost:8080
//   node serve.ts --port 9000  the same, on another port
//
// Node's standard library does all the work. Requests are confined to
// game/: a path that tries to climb out of it is refused, a directory is
// answered with its index.html, and nothing is cached, so an edit is one
// refresh away. This is a development convenience, not a hardened server.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

/** The content type each extension is served as; anything unlisted is a plain byte stream. */
const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.wasm', 'application/wasm'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.bin', 'application/octet-stream'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

/** The port to listen on: --port N when it names a usable port, else 8080. */
function chosenPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  const n = at < 0 ? NaN : Number(argv[at + 1]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

/** Answers with a bare status line and no body worth mentioning. */
function refuse(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    refuse(res, 400, 'bad request');
    return;
  }

  // The file the path names inside game/; a trailing slash asks for the directory's page.
  const rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = resolve(join(gameRoot, `.${rel}`));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    refuse(res, 403, 'forbidden');
    return;
  }

  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    refuse(res, 404, 'not found');
    return;
  }

  res.writeHead(200, {
    'content-type': CONTENT_TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

const port = chosenPort(process.argv.slice(2));
createServer((req, res) => {
  handle(req, res).catch(() => refuse(res, 500, 'server error'));
}).listen(port, '127.0.0.1', () => {
  console.log(`Coral Bay Syndicate: game/ is being served at http://localhost:${port}`);
});
