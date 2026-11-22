// The make.fun dossier library for browser-game entries, for Node 22 and later.
// One file, Node standard library only, erasable TypeScript: it runs as-is under
// `node main.ts`, with no build step and nothing to install.
//
// An entry is a directory holding game/ (the playable game as static files a
// desktop browser loads offline: game/index.html, its own scripts, styles and
// assets, and any library vendored under game/) and screenshots/ (3 or 4 PNG or
// JPEG renders of the game, the first by name the cover). buildDossier reads
// such a directory and returns the dossier (schema makefun/dossier/v1) as
// canonical JSON bytes: the screenshots as base64 with their hashes, and a text
// that opens with a "## Game" block (the source, vendored and asset counts and
// the totals) and then shows the game's sources, index.html first, then the
// scripts in the order the page loads them, then every other source by path.
//
//   import { buildDossier } from './vendor/makefun-game.ts';
//   writeFileSync('/output/dossier.json', buildDossier('/output', {
//     text_max_bytes: 163840,
//     screenshots: { max: 4, max_bytes: 262144 },
//     game_max_files: 993,
//     game_max_bytes: 50331648,
//     game_path_max_bytes: 1000,
//   }));
//
// Of the caps, only text_max_bytes shapes the bytes; the rest only refuse an
// entry the scorer would refuse, so pass them all. The text is deterministic:
// the same directory always writes the same bytes.

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ constants

/** The schema string every dossier carries. */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** The most bytes a finished dossier may hold: 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** The most images a dossier holds, whatever the caller's cap says. */
export const DOSSIER_MAX_IMAGES = 8;
/** The one file game/ must hold, at its root. */
export const INDEX_HTML = 'index.html';
/** The most bytes game/index.html may be: 1 MiB. */
export const INDEX_HTML_MAX_BYTES = 1024 * 1024;
/** The default cap on a game path's length, in UTF-8 bytes relative to game/. */
export const GAME_PATH_MAX_BYTES = 1000;
/** How many vendored files the Game block names before it counts the rest. */
const VENDORED_NAMED = 24;

/** The extensions (lowercase) that make a file a source the dossier shows. */
export const SOURCE_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'glsl', 'vert', 'frag', 'wgsl', 'json'] as const;
/** A generated file's name: minified output is vendored, whatever its extension. */
const GENERATED_NAME = /\.min\.(?:js|mjs|css)$/i;
/** A source file's name, by its extension. */
const SOURCE_NAME = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`, 'i');
/** A file the import walk can follow: a JavaScript module. */
const MODULE_NAME = /\.(?:js|mjs)$/i;

// ------------------------------------------------------------------ errors

/** The cap a refusal is blamed on, or null when the input itself is at fault. */
export type DossierLimit =
  | 'text_max_bytes'
  | 'screenshots.max'
  | 'screenshots.max_bytes'
  | 'game_max_files'
  | 'game_max_bytes'
  | 'game_path_max_bytes';

/** Why no dossier is written for a directory: its game/, its screenshots, or a cap it is past. */
export class DossierError extends Error {
  readonly limit: DossierLimit | null;
  constructor(message: string, limit: DossierLimit | null = null) {
    super(message);
    this.name = 'DossierError';
    this.limit = limit;
  }
}

// ------------------------------------------------------------------ small helpers

const decoder = new TextDecoder('utf-8');

/** Code-unit order: the same on every machine, unlike localeCompare. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A string's length in UTF-8 bytes. */
function utf8Length(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Bytes read as text for display; invalid UTF-8 becomes U+FFFD. */
function asText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** How many lines a file has: 0 when empty, else its line feeds, plus one for a last line that has none. */
function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let feeds = 0;
  for (const b of bytes) if (b === 0x0a) feeds++;
  return bytes[bytes.length - 1] === 0x0a ? feeds : feeds + 1;
}

/** A Markdown fence for `body`: three backticks, or one more than the longest run inside it. */
function fenceFor(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The fence language tag for a source path, from its extension. */
function fenceLanguage(path: string): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
    case 'mjs':
      return 'js';
    case 'glsl':
    case 'vert':
    case 'frag':
      return 'glsl';
    case 'wgsl':
      return 'wgsl';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    default:
      return 'text';
  }
}

// ------------------------------------------------------------------ the game tree

/** Caps on the game tree; each one absent means uncapped (paths still default to GAME_PATH_MAX_BYTES). */
export interface GameCaps {
  /** Files and directories under game/, summed: the platform counts each entry once. */
  game_max_files?: number;
  /** The files' sizes under game/, summed; directories cost nothing. */
  game_max_bytes?: number;
  /** Each path's length in UTF-8 bytes, relative to game/. */
  game_path_max_bytes?: number;
}

/** What a file under game/ is to the dossier. */
export type GameFileClass = 'source' | 'vendored' | 'asset';

/** One file under game/. */
export interface GameFile {
  /** POSIX path relative to game/, like `src/main.js`. */
  path: string;
  bytes: number;
  cls: GameFileClass;
}

/** Every entry under game/, walked once. */
export interface GameTree {
  /** The files, in code-unit path order. */
  files: GameFile[];
  /** The directories' paths, in code-unit order; game/ itself is '' and is not listed. */
  directories: string[];
  /** Files and directories together: the platform's own count. */
  count: number;
  /** The files' sizes, summed. */
  totalBytes: number;
}

/** The caps with defaults filled in; a cap that is present but not a whole number is a TypeError. */
function checkedGameCaps(caps: GameCaps, who: string): Record<keyof GameCaps, number> {
  const out: Record<keyof GameCaps, number> = {
    game_max_files: Infinity,
    game_max_bytes: Infinity,
    game_path_max_bytes: GAME_PATH_MAX_BYTES,
  };
  for (const key of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const value = caps[key] as unknown;
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${who}: caps.${key} must be a whole number, not ${String(value)}`);
    }
    out[key] = value;
  }
  return out;
}

/**
 * What a path under game/ is to the dossier. A file under a directory named
 * vendor, or named *.min.js, *.min.mjs or *.min.css, is vendored; a file with a
 * source extension anywhere else is a source; everything else is an asset.
 */
export function classifyGamePath(path: string): GameFileClass {
  const segments = path.split('/');
  const base = segments[segments.length - 1] ?? '';
  const parents = segments.slice(0, -1);
  if (parents.includes('vendor') || GENERATED_NAME.test(base)) return 'vendored';
  return SOURCE_NAME.test(base) ? 'source' : 'asset';
}

/** Whether a path under game/ is a source file. */
export function isSourcePath(path: string): boolean {
  return classifyGamePath(path) === 'source';
}

/**
 * Every file and directory under game/, each file with its size and class.
 * Symbolic links and other special files are refused, as is a tree past any of
 * the caps. Only the directory listings are read, never the files themselves.
 */
export function readGameTree(gameDir: string, caps: GameCaps = {}): GameTree {
  const limits = checkedGameCaps(caps, 'readGameTree');
  let root;
  try {
    root = lstatSync(gameDir);
  } catch {
    throw new DossierError('game/: no such directory: a game is a directory of static files, its index.html at its root');
  }
  if (!root.isDirectory()) throw new DossierError('game/: not a directory (a game is a directory of static files)');

  const files: GameFile[] = [];
  const directories: string[] = [];
  let count = 0;
  let totalBytes = 0;
  const pending: string[] = [''];
  while (pending.length > 0) {
    const rel = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(rel === '' ? gameDir : join(gameDir, rel), { withFileTypes: true });
    } catch (err) {
      throw new DossierError(`game/${rel === '' ? '' : `${rel}/`}: cannot be read (${(err as Error).message})`);
    }
    for (const entry of entries) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const pathBytes = utf8Length(path);
      if (pathBytes > limits.game_path_max_bytes) {
        throw new DossierError(
          `game/${path}: a path of ${pathBytes} bytes, over the ${limits.game_path_max_bytes} allowed (game_path_max_bytes)`,
          'game_path_max_bytes',
        );
      }
      let stat;
      try {
        stat = lstatSync(join(gameDir, path));
      } catch {
        throw new DossierError(`game/${path}: cannot be read`);
      }
      count++;
      if (count > limits.game_max_files) {
        throw new DossierError(`game/: holds more than the ${limits.game_max_files} files and directories allowed (game_max_files)`, 'game_max_files');
      }
      if (stat.isDirectory()) {
        directories.push(path);
        pending.push(path);
      } else if (stat.isFile()) {
        totalBytes += stat.size;
        if (totalBytes > limits.game_max_bytes) {
          throw new DossierError(`game/: its files come to more than the ${limits.game_max_bytes} bytes allowed (game_max_bytes)`, 'game_max_bytes');
        }
        files.push({ path, bytes: stat.size, cls: classifyGamePath(path) });
      } else {
        throw new DossierError(`game/${path}: a symbolic link or special file (game/ holds plain files and directories only)`);
      }
    }
  }
  files.sort((a, b) => compareText(a.path, b.path));
  directories.sort(compareText);
  return { files, directories, count, totalBytes };
}

/** game/index.html's bytes, from the tree: refused when missing, a directory, or over the page cap. */
function readIndexPage(gameDir: string, tree: GameTree): Uint8Array {
  const file = tree.files.find((f) => f.path === INDEX_HTML);
  if (file === undefined) {
    if (tree.directories.includes(INDEX_HTML)) throw new DossierError('buildDossier: game/index.html: a directory, not the page');
    throw new DossierError('buildDossier: game/index.html: no such file: a game is a directory of static files, its index.html at its root');
  }
  if (file.bytes > INDEX_HTML_MAX_BYTES) {
    throw new DossierError(`buildDossier: game/index.html: ${file.bytes} bytes, over the ${INDEX_HTML_MAX_BYTES} a page may be`);
  }
  try {
    return new Uint8Array(readFileSync(join(gameDir, INDEX_HTML)));
  } catch (err) {
    throw new DossierError(`buildDossier: game/index.html: cannot be read (${(err as Error).message})`);
  }
}

// ------------------------------------------------------------------ the page's tags

/** One <script> of a page. */
export interface HtmlScript {
  /** Its src attribute, or null when the script is inline. */
  src: string | null;
  /** Its type attribute, lowercased and trimmed ('' when absent). */
  type: string;
  /** An inline script's text ('' for one with a src, or no body). */
  text: string;
}

/** One <link> of a page. */
export interface HtmlLink {
  href: string;
  /** Its rel attribute, lowercased and trimmed. */
  rel: string;
}

/** One element that loads a file through its src: <img>, <source>, <video>, <audio> or <iframe>. */
export interface HtmlResource {
  /** Its tag name, lowercased. */
  tag: string;
  src: string;
}

/** One <script type="importmap"> block. */
export interface HtmlImportMap {
  /** Its JSON, when it parsed. */
  value: unknown;
  /** Why its text is not JSON, or null. */
  error: string | null;
}

/** What a page's markup says about the files it loads. */
export interface HtmlFacts {
  scripts: HtmlScript[];
  links: HtmlLink[];
  resources: HtmlResource[];
  importMaps: HtmlImportMap[];
}

/** The tags whose src attribute is a resource the page loads. */
const RESOURCE_TAGS = ['img', 'source', 'video', 'audio', 'iframe'] as const;

/** The index of the `>` that ends the tag whose body starts at `from`, honoring quoted values; -1 when none. */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let i = from; i < html.length; i++) {
    const ch = html[i]!;
    if (quote !== '') {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** A tag body's attributes: names lowercased, values unquoted, a valueless attribute ''. */
function parseAttributes(body: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s/]/.test(body[i]!)) i++;
    if (i >= body.length) break;
    const start = i;
    while (i < body.length && !/[\s=/>]/.test(body[i]!)) i++;
    const name = body.slice(start, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i]!)) i++;
    let value = '';
    if (body[i] === '=') {
      i++;
      while (i < body.length && /\s/.test(body[i]!)) i++;
      const quote = body[i];
      if (quote === '"' || quote === "'") {
        const end = body.indexOf(quote, i + 1);
        value = body.slice(i + 1, end < 0 ? body.length : end);
        i = end < 0 ? body.length : end + 1;
      } else {
        // An unquoted value runs to whitespace or the tag's end; a / inside it belongs to the value.
        const valueStart = i;
        while (i < body.length && !/[\s>]/.test(body[i]!)) i++;
        value = body.slice(valueStart, i);
      }
    }
    if (name !== '') attrs.set(name, value);
  }
  return attrs;
}

/** The index of `</name` at or after `from`, ASCII case-insensitively; -1 when there is none. */
function findCloseTag(html: string, from: number, name: string): number {
  const needle = `</${name}`;
  for (let i = from; i + needle.length <= html.length; i++) {
    if (html[i] !== '<') continue;
    let hit = true;
    for (let j = 1; j < needle.length; j++) {
      if (html[i + j]!.toLowerCase() !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Every <script>, <link href>, <img src>, <source src>, <video src>, <audio src>,
 * <iframe src> and <script type="importmap"> of a page, in document order.
 * Comments and the doctype are skipped. This is a tag scan, not an HTML parser.
 */
export function htmlFacts(html: string): HtmlFacts {
  const scripts: HtmlScript[] = [];
  const links: HtmlLink[] = [];
  const resources: HtmlResource[] = [];
  const importMaps: HtmlImportMap[] = [];
  let i = 0;
  while (i < html.length) {
    const at = html.indexOf('<', i);
    if (at < 0) break;
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', at)) {
      const end = html.indexOf('>', at + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const ahead = html.slice(at + 1, at + 8).toLowerCase();
    if (ahead.startsWith('script') && !/[A-Za-z0-9]/.test(html[at + 7] ?? '')) {
      const end = findTagEnd(html, at + 7);
      if (end < 0) break;
      const attrs = parseAttributes(html.slice(at + 7, end));
      const type = (attrs.get('type') ?? '').trim().toLowerCase();
      const src = attrs.get('src') ?? null;
      let body = '';
      const close = findCloseTag(html, end + 1, 'script');
      if (src === null) body = html.slice(end + 1, close < 0 ? html.length : close);
      i = close < 0 ? html.length : close + 8;
      if (type === 'importmap') {
        let value: unknown = null;
        let error: string | null = null;
        try {
          value = JSON.parse(body);
        } catch (err) {
          error = (err as Error).message;
        }
        importMaps.push({ value, error });
      } else {
        scripts.push({ src, type, text: src === null ? body : '' });
      }
      continue;
    }
    if (ahead.startsWith('link') && !/[A-Za-z0-9]/.test(html[at + 5] ?? '')) {
      const end = findTagEnd(html, at + 5);
      if (end < 0) break;
      const attrs = parseAttributes(html.slice(at + 5, end));
      const href = attrs.get('href');
      if (href !== undefined) links.push({ href, rel: (attrs.get('rel') ?? '').trim().toLowerCase() });
      i = end + 1;
      continue;
    }
    const tag = RESOURCE_TAGS.find((name) => ahead.startsWith(name) && !/[A-Za-z0-9]/.test(html[at + 1 + name.length] ?? ''));
    if (tag !== undefined) {
      const end = findTagEnd(html, at + 1 + tag.length);
      if (end < 0) break;
      const attrs = parseAttributes(html.slice(at + 1 + tag.length, end));
      const src = attrs.get('src');
      if (src !== undefined) resources.push({ tag, src });
      i = end + 1;
      continue;
    }
    const end = findTagEnd(html, at + 1);
    i = end < 0 ? html.length : end + 1;
  }
  return { scripts, links, resources, importMaps };
}

// ------------------------------------------------------------------ the import map

/** A page's import map: specifiers to references; a null value blocks its specifier. */
export interface ImportMap {
  imports: Record<string, string | null>;
  scopes: Record<string, Record<string, string | null>>;
}

/** The page's import map read: map and error both null when the page holds none. */
export interface ImportMapRead {
  map: ImportMap | null;
  error: string | null;
}

/** Whether a value is a plain JSON-style object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sets an own enumerable property even for a "__proto__" key, which stays a key, never the prototype. */
function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * The page's one import map, parsed: none when the page holds no import map
 * (one is optional), else the map, or the reason it cannot be used — a second
 * map, text that is not JSON, or a shape an import map does not have.
 */
export function importMapOf(facts: HtmlFacts): ImportMapRead {
  if (facts.importMaps.length === 0) return { map: null, error: null };
  if (facts.importMaps.length > 1) {
    return { map: null, error: `index.html holds ${facts.importMaps.length} import maps: a page holds one at most` };
  }
  const only = facts.importMaps[0]!;
  if (only.error !== null) return { map: null, error: `index.html's import map is not JSON (${only.error})` };
  if (!isPlainObject(only.value)) return { map: null, error: "index.html's import map is not a JSON object" };

  const importsRaw = only.value.imports ?? {};
  if (!isPlainObject(importsRaw)) return { map: null, error: 'index.html\'s import map holds an "imports" that is not an object' };
  const imports: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(importsRaw)) {
    if (value !== null && typeof value !== 'string') {
      return { map: null, error: `index.html's import map maps ${JSON.stringify(key)} to no string` };
    }
    setOwn(imports, key, value);
  }

  const scopes: Record<string, Record<string, string | null>> = {};
  const scopesRaw = only.value.scopes;
  if (scopesRaw !== undefined) {
    if (!isPlainObject(scopesRaw)) return { map: null, error: 'index.html\'s import map holds a "scopes" that is not an object' };
    for (const [scope, entries] of Object.entries(scopesRaw)) {
      if (!isPlainObject(entries)) {
        return { map: null, error: `index.html's import map scope ${JSON.stringify(scope)} is not an object` };
      }
      const inner: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(entries)) {
        if (value !== null && typeof value !== 'string') {
          return { map: null, error: `index.html's import map scope ${JSON.stringify(scope)} maps ${JSON.stringify(key)} to no string` };
        }
        setOwn(inner, key, value);
      }
      setOwn(scopes, scope, inner);
    }
  }
  return { map: { imports, scopes }, error: null };
}

// ------------------------------------------------------------------ references and specifiers

/** A URI scheme's leading `name:`. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Whether a reference is relative: not empty, no scheme, no leading // and no leading /. */
export function isRelativeRef(ref: string): boolean {
  return ref.length > 0 && !URI_SCHEME.test(ref) && !ref.startsWith('//') && !ref.startsWith('/');
}

/**
 * Whether a module specifier is relative in JavaScript's sense: ./ or ../ (or
 * . or ..). A bare name like `phaser` is not, whatever the import map makes of
 * it; isRelativeRef answers for URL references instead, where `main.js` counts.
 */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * The path under game/ that the relative reference `ref` names, resolved
 * against the importing file's path `from` (POSIX, relative to game/). A query
 * or fragment is dropped. Null when `ref` is not relative, names nothing, or
 * climbs out of game/.
 */
export function resolveGamePath(ref: string, from: string): string | null {
  if (!isRelativeRef(ref)) return null;
  const cut = ref.search(/[?#]/);
  const raw = cut < 0 ? ref : ref.slice(0, cut);
  if (raw === '') return null;
  const parts = from.split('/').slice(0, -1);
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.length === 0 ? null : parts.join('/');
}

/** What an import map says about a specifier: found false when it maps nothing, value null when a null entry blocks it. */
export interface ImportMapMatch {
  found: boolean;
  value: string | null;
}

/** The entry for a specifier in one map: an exact own key, else the longest own key ending in / that prefixes it. */
function lookupEntry(entries: Record<string, string | null>, specifier: string): ImportMapMatch {
  if (Object.hasOwn(entries, specifier)) return { found: true, value: entries[specifier]! };
  let bestKey: string | null = null;
  for (const key of Object.keys(entries)) {
    if (key.endsWith('/') && specifier.startsWith(key) && (bestKey === null || key.length > bestKey.length)) bestKey = key;
  }
  if (bestKey === null) return { found: false, value: null };
  const base = entries[bestKey]!;
  return base === null ? { found: true, value: null } : { found: true, value: `${base}${specifier.slice(bestKey.length)}` };
}

/**
 * The game path a scope key's URL prefix names, or null when it cannot name
 * one: the scope resolved against index.html, with '.' and './' meaning game/
 * itself. An absolute scope names a site path, not a file of the game.
 */
function scopePrefixPath(scope: string): string | null {
  const cut = scope.search(/[?#]/);
  const raw = cut < 0 ? scope : scope.slice(0, cut);
  if (raw === '.' || raw === './') return '';
  return resolveGamePath(scope, INDEX_HTML);
}

/**
 * What the page's import map says for `specifier` imported from `from`: a
 * matching scope's map first (its longest URL prefix wins), then the top-level
 * imports.
 */
export function importMapMatch(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): ImportMapMatch {
  if (map === null) return { found: false, value: null };
  let best: { prefix: string; entries: Record<string, string | null> } | null = null;
  for (const [scope, entries] of Object.entries(map.scopes)) {
    const prefix = scopePrefixPath(scope);
    if (prefix === null || !from.startsWith(prefix)) continue;
    if (best === null || prefix.length > best.prefix.length) best = { prefix, entries };
  }
  if (best !== null) {
    const scoped = lookupEntry(best.entries, specifier);
    if (scoped.found) return scoped;
  }
  return lookupEntry(map.imports, specifier);
}

/** The value an import map gives a bare specifier: null when nothing maps it, or a null entry blocks it. */
export function mappedSpecifier(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): string | null {
  const match = importMapMatch(map, specifier, from);
  return match.found ? match.value : null;
}

/** The path a specifier names from `from`: relative to the importer, or through the import map; null when neither reaches a path under game/. */
function resolveSpecifier(specifier: string, from: string, map: ImportMap | null): string | null {
  if (isRelativeSpecifier(specifier)) return resolveGamePath(specifier, from);
  const match = importMapMatch(map, specifier, from);
  if (!match.found || match.value === null || !isRelativeRef(match.value)) return null;
  return resolveGamePath(match.value, INDEX_HTML);
}

// ------------------------------------------------------------------ static imports, lexically

const IDENT_START = /[A-Za-z0-9_$]/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * A module's static import and export-from specifiers, in source order, found
 * by a lexical scan: comments, strings, template literals and regular
 * expressions are stepped over, so words inside them are never read as
 * imports. It recognizes `import 'x'`, `import ... from 'x'`,
 * `export ... from 'x'` and `export * from 'x'`; anything it cannot make sense
 * of is left alone. This is not a parser — the gate parses modules itself.
 */
export function sourceImports(source: string): string[] {
  const found: string[] = [];
  const n = source.length;
  let i = 0;
  // The last significant character seen, for the regex-versus-division guess:
  // a / opens a regular expression only where a value cannot just have ended.
  let prev = '';
  const regexCanOpen = (): boolean => prev === '' || '([{,;:=!&|?+-*%^~<>'.includes(prev);

  const skipSpaceAndComments = (): void => {
    for (;;) {
      while (i < n && /\s/.test(source[i]!)) i++;
      if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') i++;
      } else if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
      } else {
        return;
      }
    }
  };

  // Reads the string literal whose opening quote is at i, returning its value
  // (escapes resolved the simple way) or null when it never closes on its line.
  const readString = (quote: string): string | null => {
    i++;
    let value = '';
    while (i < n) {
      const ch = source[i]!;
      if (ch === quote) {
        i++;
        return value;
      }
      if (ch === '\n') return null;
      if (ch === '\\') {
        const next = source[i + 1];
        if (next === undefined) return null;
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
        i += 2;
      } else {
        value += ch;
        i++;
      }
    }
    return null;
  };

  const skipTemplate = (): void => {
    i++;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
      } else if (ch === '`') {
        i++;
        return;
      } else {
        i++;
      }
    }
  };

  const skipRegex = (): void => {
    i++;
    let inClass = false;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
      } else if (ch === '[') {
        inClass = true;
        i++;
      } else if (ch === ']') {
        inClass = false;
        i++;
      } else if (ch === '/' && !inClass) {
        i++;
        return;
      } else if (ch === '\n') {
        return;
      } else {
        i++;
      }
    }
  };

  const readIdentifier = (): string => {
    const start = i;
    while (i < n && IDENT_CHAR.test(source[i]!)) i++;
    return source.slice(start, i);
  };

  // A string literal after optional space, or null; the position advances either way.
  const readMaybeString = (): string | null => {
    skipSpaceAndComments();
    const ch = source[i];
    return ch === '"' || ch === "'" ? readString(ch) : null;
  };

  // From just after `import` or `export`: walks the clause to its `from 'x'`,
  // or to a bare string (the `import 'x'` form); null when neither shows up.
  const readClause = (): string | null => {
    for (;;) {
      skipSpaceAndComments();
      if (i >= n) return null;
      const ch = source[i]!;
      if (ch === '=' || ch === ';') return null;
      if (ch === '"' || ch === "'") return readString(ch);
      if (ch === '{' || ch === '}' || ch === ',' || ch === '*') {
        i++;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const word = readIdentifier();
        if (word === 'from') return readMaybeString();
        continue;
      }
      return null;
    }
  };

  while (i < n) {
    skipSpaceAndComments();
    if (i >= n) break;
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      readString(ch);
      prev = ch;
      continue;
    }
    if (ch === '`') {
      skipTemplate();
      prev = '`';
      continue;
    }
    if (ch === '/') {
      if (regexCanOpen()) skipRegex();
      else i++;
      prev = '/';
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const word = readIdentifier();
      prev = 'a';
      if (word === 'import') {
        skipSpaceAndComments();
        if (source[i] === '(' || source[i] === '.') continue; // a dynamic import, or import.meta
        const specifier = readClause();
        if (specifier !== null) found.push(specifier);
      } else if (word === 'export') {
        skipSpaceAndComments();
        if (source[i] !== '*' && source[i] !== '{') continue; // only a re-export carries a specifier
        const specifier = readClause();
        if (specifier !== null) found.push(specifier);
      }
      continue;
    }
    prev = ch;
    i++;
  }
  return found;
}

// ------------------------------------------------------------------ the page's load order

/** A source file of a game: its path under game/ and its bytes. */
export interface GameSource {
  path: string;
  bytes: Uint8Array;
}

/** The JavaScript MIME types (the HTML standard's list) that make a <script> a classic script. */
const CLASSIC_SCRIPT_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/** Whether a <script>'s type (already lowercased and trimmed) makes it classic: none, or a JavaScript MIME type. */
function isClassicType(type: string): boolean {
  return type === '' || CLASSIC_SCRIPT_TYPES.has(type.split(';')[0]!.trim());
}

/**
 * The source JS files in the order the page loads them: index.html's scripts
 * in document order — a classic script's src where it stands (its text is not
 * walked; a classic script has no static imports), a module script followed by
 * a depth-first walk of its static imports, each module's own imports in
 * source order, a file listed once, the first time it is reached. Specifiers
 * resolve relative to the importer or through the page's import map;
 * references that resolve to no source JS file are skipped, as are scripts of
 * other types. index.html itself is never in the result.
 */
export function importOrder(sources: readonly GameSource[], facts: HtmlFacts): string[] {
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const map = importMapOf(facts).map;
  const order: string[] = [];
  const seen = new Set<string>();

  const visit = (path: string, walkImports: boolean): void => {
    if (seen.has(path) || !MODULE_NAME.test(path) || !byPath.has(path)) return;
    seen.add(path);
    order.push(path);
    if (!walkImports) return;
    for (const specifier of sourceImports(asText(byPath.get(path)!.bytes))) {
      const target = resolveSpecifier(specifier, path, map);
      if (target !== null) visit(target, true);
    }
  };

  for (const script of facts.scripts) {
    if (script.type === 'module') {
      if (script.src !== null) {
        // A script's src is a URL reference, not a module specifier: `main.js` is relative to the page.
        const target = isRelativeRef(script.src)
          ? resolveGamePath(script.src, INDEX_HTML)
          : resolveSpecifier(script.src, INDEX_HTML, map);
        if (target !== null) visit(target, true);
      } else {
        for (const specifier of sourceImports(script.text)) {
          const target = resolveSpecifier(specifier, INDEX_HTML, map);
          if (target !== null) visit(target, true);
        }
      }
    } else if (isClassicType(script.type) && script.src !== null && isRelativeRef(script.src)) {
      // A classic script loads where it stands; an import map does not apply to it.
      const target = resolveGamePath(script.src, INDEX_HTML);
      if (target !== null) visit(target, false);
    }
  }
  return order;
}

// ------------------------------------------------------------------ canonical JSON

/**
 * JSON with every object's keys in code-unit order and no whitespace: one
 * spelling per value. Takes null, booleans, finite numbers, strings, arrays
 * and plain objects; anything else is a TypeError.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalJson: only plain objects and arrays');
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

// ------------------------------------------------------------------ the dossier itself

/** What buildDossier is held to. A gate's caps object may be passed whole; only these keys are read. */
export interface DossierCaps {
  /** The dossier text's cap, in UTF-8 bytes. The one cap that shapes the output. */
  text_max_bytes: number;
  /** At most `max` screenshots, each at most `max_bytes` bytes; the dossier's own limits hold either way. */
  screenshots?: { max: number; max_bytes: number };
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
/** The names a screenshot may have. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Whether `bytes` opens with `magic` (at `at`). */
function startsWithBytes(bytes: Uint8Array, magic: readonly number[], at = 0): boolean {
  return bytes.length >= at + magic.length && magic.every((b, k) => bytes[at + k] === b);
}

/** A file name's extension, lowercased, for the Game block's asset counts; '(none)' when it has none. */
function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '(none)';
}

/** The "## Game" block: what game/ holds, by class, with the totals. No source text. */
function gameBlock(tree: GameTree): string[] {
  const sources = tree.files.filter((f) => f.cls === 'source');
  const vendored = tree.files.filter((f) => f.cls === 'vendored');
  const assets = tree.files.filter((f) => f.cls === 'asset');
  const totalOf = (list: readonly GameFile[]): number => list.reduce((sum, f) => sum + f.bytes, 0);
  const lines = [
    '## Game',
    '',
    `Source files: ${sources.length} (${totalOf(sources)} bytes)`,
    `Vendored files: ${vendored.length} (${totalOf(vendored)} bytes)`,
  ];
  if (vendored.length > 0) {
    const named = vendored.slice(0, VENDORED_NAMED).map((f) => `game/${f.path} (${f.bytes} bytes)`);
    const rest = vendored.length > VENDORED_NAMED ? `, and ${vendored.length - VENDORED_NAMED} more` : '';
    lines.push(`  ${named.join(', ')}${rest}`);
  }
  const byExtension = new Map<string, { n: number; bytes: number }>();
  for (const f of assets) {
    const ext = extensionOf(f.path);
    const bucket = byExtension.get(ext) ?? { n: 0, bytes: 0 };
    bucket.n++;
    bucket.bytes += f.bytes;
    byExtension.set(ext, bucket);
  }
  const assetText = [...byExtension]
    .sort((a, b) => compareText(a[0], b[0]))
    .map(([ext, bucket]) => `${ext} ${bucket.n} (${bucket.bytes} bytes)`)
    .join(', ');
  lines.push(`Assets: ${assetText === '' ? 'none' : assetText}`);
  lines.push(`Totals: ${tree.count} files and directories (${tree.totalBytes} bytes)`);
  return lines;
}

/** A source prepared for the dossier text. */
interface PreparedSource {
  /** The file's raw bytes. */
  raw: Uint8Array;
  /** Its text, decoded (invalid UTF-8 becomes U+FFFD). */
  body: string;
  fence: string;
  /** The whole fenced section body: fence and language, the text (a last LF added when it lacks one), the fence, a blank line. */
  block: string;
  blockBytes: number;
  lines: number;
}

/**
 * A source's section cut short: its heading, then as many whole leading lines
 * as fit in `room` bytes (at least one, fewer than all), its fence closed, a
 * line naming how many of its lines are not shown, and finally `tail(hidden)`,
 * the cut line, told how many of this file's bytes were left out. Null when
 * not even one line fits. Cuts fall only after a line feed, which never splits
 * a UTF-8 sequence, so no character is cut in half.
 */
function partialSection(
  heading: string,
  code: PreparedSource,
  language: string,
  room: number,
  tail: (hidden: number) => string,
): string | null {
  const total = code.lines;
  const bodyLines = code.body.split('\n');
  const open = `${code.fence}${language}\n`;
  const close = `${code.fence}\n\n`;
  const noteFor = (shown: number): string => `[${total - shown} of this file's ${total} lines not shown.]\n`;
  const fixedBytes = utf8Length(heading) + utf8Length(open) + utf8Length(close);
  let best = 0;
  let bestEnd = 0; // the raw byte offset just past the best-th line's line feed
  let shownBytes = 0;
  let rawEnd = 0;
  for (let k = 1; k < total; k++) {
    shownBytes += utf8Length(bodyLines[k - 1]!) + 1;
    rawEnd = code.raw.indexOf(0x0a, rawEnd) + 1;
    const totalBytes = fixedBytes + shownBytes + utf8Length(noteFor(k)) + utf8Length(tail(code.raw.length - rawEnd));
    if (totalBytes <= room) {
      best = k;
      bestEnd = rawEnd;
    }
  }
  if (best === 0) return null;
  const headText = bodyLines
    .slice(0, best)
    .map((line) => `${line}\n`)
    .join('');
  return `${heading}${open}${headText}${close}${noteFor(best)}${tail(code.raw.length - bestEnd)}`;
}

/**
 * The dossier of an entry directory, as canonical JSON bytes. Throws
 * DossierError on a game tree it cannot read or one past a cap, a missing
 * game/index.html, screenshots no dossier can hold, a text cap too small for
 * the Game block and the cut line, or a finished dossier over DOSSIER_MAX_BYTES.
 *
 * The text holds at most caps.text_max_bytes UTF-8 bytes: every source that
 * fits goes in whole, in order; the first that does not goes in up to its last
 * complete line that fits (or not at all, when not one line fits), and nothing
 * follows it but a last line naming how many whole files and how many bytes of
 * source were left out.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const maxText = caps.text_max_bytes;
  if (!Number.isSafeInteger(maxText) || maxText <= 0) {
    throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(maxText)}`, 'text_max_bytes');
  }
  // The binding screenshot caps: the caller's, when given and tighter; else the dossier's own.
  let imageCountCap = { n: DOSSIER_MAX_IMAGES, whose: 'a dossier holds' };
  let imageBytesCap = { n: DOSSIER_MAX_BYTES, whose: 'a dossier holds' };
  if (caps.screenshots !== undefined) {
    const shots = caps.screenshots as { max?: unknown; max_bytes?: unknown } | null;
    if (typeof shots !== 'object' || shots === null) throw new DossierError('buildDossier: caps.screenshots must be an object {max, max_bytes}');
    for (const key of ['max', 'max_bytes'] as const) {
      const value = shots[key];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new DossierError(`buildDossier: caps.screenshots.${key} must be a positive integer, not ${String(value)}`, `screenshots.${key}`);
      }
    }
    if ((shots.max as number) < imageCountCap.n) imageCountCap = { n: shots.max as number, whose: 'caps.screenshots.max allows' };
    if ((shots.max_bytes as number) < imageBytesCap.n) imageBytesCap = { n: shots.max_bytes as number, whose: 'caps.screenshots.max_bytes allows' };
  }
  const gameCaps: GameCaps = {};
  for (const key of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const value = caps[key] as unknown;
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new DossierError(`buildDossier: caps.${key} must be a whole number, not ${String(value)}`, key);
    }
    gameCaps[key] = value;
  }

  const gameDir = join(dir, 'game');
  const tree = readGameTree(gameDir, gameCaps);
  const page = htmlFacts(asText(readIndexPage(gameDir, tree)));

  const sources: GameSource[] = tree.files
    .filter((f) => f.cls === 'source')
    .map((f) => ({ path: f.path, bytes: new Uint8Array(readFileSync(join(gameDir, f.path))) }));
  const sourceByPath = new Map(sources.map((s) => [s.path, s]));
  const loadOrder = importOrder(sources, page).filter((p) => p !== INDEX_HTML);
  const placed = new Set<string>([INDEX_HTML, ...loadOrder]);
  const remaining = sources
    .map((s) => s.path)
    .filter((p) => !placed.has(p))
    .sort(compareText);
  const sectionOrder = [INDEX_HTML, ...loadOrder, ...remaining];

  const prepared = new Map<string, PreparedSource>();
  const prepare = (path: string): PreparedSource | null => {
    const cached = prepared.get(path);
    if (cached !== undefined) return cached;
    const file = sourceByPath.get(path);
    if (file === undefined) return null;
    const body = asText(file.bytes);
    const fence = fenceFor(body);
    const block = `${fence}${fenceLanguage(path)}\n${body}${body.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
    const made: PreparedSource = { raw: file.bytes, body, fence, block, blockBytes: utf8Length(block), lines: countLines(file.bytes) };
    prepared.set(path, made);
    return made;
  };

  const shotNames = readScreenshotNames(dir);
  if (shotNames.length === 0) throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  if (shotNames.length > imageCountCap.n) {
    throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${imageCountCap.n} ${imageCountCap.whose}`, 'screenshots.max');
  }
  const images = shotNames.map((name) => readScreenshot(dir, name, imageBytesCap));

  const head = [...gameBlock(tree), '', '## Sources', '', ''].join('\n');
  const sections = sectionOrder.map((path) => {
    const code = prepare(path);
    const lines = code === null ? 0 : code.lines;
    const bytes = code === null ? 0 : code.raw.length;
    const heading = `### game/${path} (${lines} ${lines === 1 ? 'line' : 'lines'}, ${bytes} bytes)\n\n`;
    const shown = lines === 0 ? null : code;
    return { heading, code: shown, size: utf8Length(heading) + (shown === null ? 0 : shown.blockBytes), bytes };
  });
  // bytesAfter[k]: the source bytes of the sections after section k.
  const bytesAfter = new Array<number>(sections.length + 1).fill(0);
  for (let k = sections.length - 1; k >= 0; k--) {
    bytesAfter[k] = bytesAfter[k + 1]! + (k + 1 < sections.length ? sections[k + 1]!.bytes : 0);
  }

  const cutLine = (files: number, bytes: number): string =>
    `[Cut at ${maxText} bytes: ${files} file${files === 1 ? '' : 's'} and ${bytes} bytes of source left out.]\n`;
  let out = head;
  let used = utf8Length(head);
  let kept = 0;
  while (kept < sections.length) {
    const section = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const tailBytes = restCount === 0 ? 0 : utf8Length(cutLine(restCount, bytesAfter[kept]!));
    if (used + section.size + tailBytes > maxText) break;
    out += section.code === null ? section.heading : `${section.heading}${section.code.block}`;
    used += section.size;
    kept++;
  }
  if (kept < sections.length) {
    // The first source that does not fit whole: its head, up to the last
    // complete line that fits, then nothing more.
    const first = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const after = bytesAfter[kept]!;
    const part =
      first.code === null
        ? null
        : partialSection(first.heading, first.code, fenceLanguage(sectionOrder[kept]!), maxText - used, (hidden) => cutLine(restCount, after + hidden));
    out += part ?? cutLine(restCount + 1, after + first.bytes);
  }
  if (utf8Length(out) > maxText) {
    throw new DossierError(`buildDossier: caps.text_max_bytes ${maxText} cannot hold even the Game block and the cut line`, 'text_max_bytes');
  }

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: out.replace(/\n+$/, '\n'), images };
  const bytes = Buffer.from(canonicalJson(doc), 'utf8');
  if (bytes.length > DOSSIER_MAX_BYTES) {
    throw new DossierError(`buildDossier: the dossier is ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** The screenshot file names of an entry, in code-unit order; names starting with '.' are skipped. */
function readScreenshotNames(dir: string): string[] {
  const shotsDir = join(dir, 'screenshots');
  let stat;
  try {
    stat = lstatSync(shotsDir);
  } catch {
    throw new DossierError('buildDossier: no screenshots/ directory: an entry hands in 3 or 4 renders of its game, the first by name the cover');
  }
  if (!stat.isDirectory()) {
    throw new DossierError('buildDossier: screenshots is not a directory: an entry hands in 3 or 4 renders of its game, the first by name the cover');
  }
  try {
    return readdirSync(shotsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort(compareText);
  } catch (err) {
    throw new DossierError(`buildDossier: screenshots/ cannot be read (${(err as Error).message})`);
  }
}

/** One screenshot, checked and read: its name, its media type by magic bytes, its hash and its base64. */
function readScreenshot(dir: string, name: string, cap: { n: number; whose: string }): { name: string; media_type: string; sha256: string; base64: string } {
  if (!IMAGE_NAME.test(name)) {
    throw new DossierError(`buildDossier: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
  }
  const size = lstatSync(join(dir, 'screenshots', name)).size;
  if (size > cap.n) {
    throw new DossierError(`buildDossier: screenshots/${name} is ${size} bytes, over the ${cap.n} ${cap.whose}`, 'screenshots.max_bytes');
  }
  const bytes = new Uint8Array(readFileSync(join(dir, 'screenshots', name)));
  if (bytes.length > cap.n) {
    throw new DossierError(`buildDossier: screenshots/${name} is ${bytes.length} bytes, over the ${cap.n} ${cap.whose}`, 'screenshots.max_bytes');
  }
  const media_type = startsWithBytes(bytes, PNG_MAGIC) ? 'image/png' : startsWithBytes(bytes, JPEG_MAGIC) ? 'image/jpeg' : null;
  if (media_type === null) throw new DossierError(`buildDossier: screenshots/${name} is neither a PNG nor a JPEG`);
  return { name, media_type, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
}
