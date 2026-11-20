// makefun-game.ts - the dossier library for a make.fun browser-game entry.
//
// An entry is a directory holding two trees: game/ (the playable static
// files, index.html at its root) and screenshots/ (a handful of PNG or
// JPEG renders of the game). This library reads such a directory and
// writes its dossier: one canonical-JSON document that carries the
// screenshots and a bounded plain-text account of the game's own source.
// The entry's main.ts hands the dossier in, and the scorer builds the
// same document again from the same trees and compares the two byte for
// byte, so everything here is a pure function of the bytes on disk:
// no clocks, no randomness, no locale-dependent ordering anywhere.
//
// Node 22+, standard library only, erasable TypeScript: the file runs
// as-is under `node main.ts`, with no build step and nothing to install.
//
//   import { buildDossier } from './vendor/makefun-game.ts';
//   writeFileSync('/output/dossier.json', buildDossier('/output', {
//     text_max_bytes: 163840,
//     screenshots: { max: 4, max_bytes: 262144 },
//     game_max_files: 993,
//     game_max_bytes: 50331648,
//     game_path_max_bytes: 1000,
//   }));

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ constants

/** The schema string every dossier carries. */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** A dossier holds at most 4 MiB, screenshots included. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** A dossier holds at most this many images, whatever the caller's cap. */
export const DOSSIER_MAX_IMAGES = 8;
/** The one file every game/ must hold, at its root. */
export const INDEX_HTML = 'index.html';
/** game/index.html may be at most 1 MiB. */
export const INDEX_HTML_MAX_BYTES = 1024 * 1024;
/** The longest path under game/, in UTF-8 bytes. */
export const GAME_PATH_MAX_BYTES = 1000;
/** The Game block names this many vendored files before it counts the rest. */
const VENDORED_LISTED = 24;

/** Extensions that make a file under game/ one of the game's own sources. */
export const SOURCE_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'glsl', 'vert', 'frag', 'wgsl', 'json'] as const;
/** Minified names are generated files, never sources, whatever their extension. */
const GENERATED_NAME = /\.min\.(?:js|mjs|css)$/i;
/** A path whose name carries a source extension. */
const SOURCE_NAME = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`, 'i');
/** A path the import walk follows into: a JavaScript module. */
const MODULE_NAME = /\.(?:js|mjs)$/i;

// ------------------------------------------------------------------ errors and caps

/** How the dossier regards one file under game/: shown, listed, or only counted. */
export type GameFileClass = 'source' | 'vendored' | 'asset';

/** The name of a cap that refused an entry, carried by DossierError.limit. */
export type DossierLimit = 'text_max_bytes' | 'screenshots.max' | 'screenshots.max_bytes' | 'game_max_files' | 'game_max_bytes' | 'game_path_max_bytes';

/** A refusal to build a dossier: the input is missing, malformed or past a cap. */
export class DossierError extends Error {
  /** The cap that refused, when a cap did; null when the input itself is at fault. */
  readonly limit: DossierLimit | null;
  constructor(message: string, limit: DossierLimit | null = null) {
    super(message);
    this.name = 'DossierError';
    this.limit = limit;
  }
}

/** The caps readGameTree answers to; each one absent means unbounded (but see the path default). */
export interface GameCaps {
  /** Files and directories under game/, counted together, as the platform counts them. */
  game_max_files?: number;
  /** The files' sizes under game/, summed; directories cost nothing. */
  game_max_bytes?: number;
  /** Each path's length in UTF-8 bytes, relative to game/. */
  game_path_max_bytes?: number;
}

/** One file under game/. */
export interface GameFile {
  /** POSIX path relative to game/, e.g. `src/main.js`. */
  path: string;
  /** Its size in bytes. */
  bytes: number;
  /** What the file is to the dossier. */
  cls: GameFileClass;
}

/** A whole walk of game/: every file and directory, with the totals. */
export interface GameTree {
  /** The files, sorted by path in code-unit order. */
  files: GameFile[];
  /** The directories' paths, sorted the same way; game/ itself is '' and not listed. */
  directories: string[];
  /** Files and directories together: the platform's own entry count. */
  count: number;
  /** The files' sizes, summed. */
  totalBytes: number;
}

/** The caps buildDossier answers to. Only text_max_bytes shapes the bytes written; the rest only refuse. */
export interface DossierCaps {
  /** The dossier text's budget, in UTF-8 bytes. */
  text_max_bytes: number;
  /** At most `max` screenshots, each at most `max_bytes` bytes. */
  screenshots?: { max: number; max_bytes: number };
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

// ------------------------------------------------------------------ small helpers

const utf8Decoder = new TextDecoder('utf-8');

/** Ordering by UTF-16 code unit: identical on every machine, unlike localeCompare. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Lowercase hex SHA-256 of a byte string. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The UTF-8 length of a string. */
function utf8Length(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Bytes read as text; invalid UTF-8 becomes U+FFFD. For display and scanning, never for hashing. */
function decodeText(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

/** How many lines a byte string holds: its LFs, plus one for a trailing line that has none. Empty is 0. */
function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (const b of bytes) if (b === 0x0a) n += 1;
  return bytes[bytes.length - 1] === 0x0a ? n : n + 1;
}

/** A Markdown fence for a body: one backtick longer than the body's longest backtick run, three at least. */
function fenceFor(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The fence language tag a source path earns in the dossier text. */
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

/**
 * A caller's caps made total: each cap given must be a whole number, and each missing one becomes
 * unbounded - except the path cap, whose absence still means the platform's own GAME_PATH_MAX_BYTES.
 */
function checkedGameCaps(caps: GameCaps, who: string): Record<keyof GameCaps, number> {
  const out: Record<keyof GameCaps, number> = {
    game_max_files: Infinity,
    game_max_bytes: Infinity,
    game_path_max_bytes: GAME_PATH_MAX_BYTES,
  };
  for (const k of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      throw new TypeError(`${who}: caps.${k} must be a whole number, not ${String(v)}`);
    }
    out[k] = v;
  }
  return out;
}

/**
 * What a path under game/ is to the dossier. Anything under a directory named `vendor`, and any
 * minified name, is vendored; a source extension anywhere else is a source; the rest are assets.
 */
export function classifyGamePath(path: string): GameFileClass {
  const segs = path.split('/');
  const base = segs[segs.length - 1] ?? '';
  const dirs = segs.slice(0, -1);
  if (dirs.includes('vendor') || GENERATED_NAME.test(base)) return 'vendored';
  return SOURCE_NAME.test(base) ? 'source' : 'asset';
}

/** Whether a path under game/ is one of the game's own sources. */
export function isSourcePath(path: string): boolean {
  return classifyGamePath(path) === 'source';
}

/**
 * Every file and directory under gameDir, each file with its size and class, plus the totals.
 * Only the directory listing is read, never a file's contents. Symbolic links and other special
 * files are refused, as is anything past the caps. Throws DossierError.
 */
export function readGameTree(gameDir: string, caps: GameCaps = {}): GameTree {
  const c = checkedGameCaps(caps, 'readGameTree');
  let root;
  try {
    root = lstatSync(gameDir);
  } catch {
    throw new DossierError('game/: no such directory: a game is a directory of static files, its index.html at its root');
  }
  if (!root.isDirectory()) throw new DossierError('game/: not a directory (a game is a directory of static files)');

  const files: GameFile[] = [];
  const directories: string[] = [];
  const pending: string[] = [''];
  let count = 0;
  let totalBytes = 0;
  while (pending.length > 0) {
    const rel = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(rel === '' ? gameDir : join(gameDir, rel), { withFileTypes: true });
    } catch (err) {
      throw new DossierError(`game/${rel === '' ? '' : `${rel}/`}: cannot be read (${(err as Error).message})`);
    }
    for (const e of entries) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      const pathBytes = utf8Length(path);
      if (pathBytes > c.game_path_max_bytes) {
        throw new DossierError(
          `game/${path}: a path of ${pathBytes} bytes, over the ${c.game_path_max_bytes} allowed (game_path_max_bytes)`,
          'game_path_max_bytes',
        );
      }
      let st;
      try {
        st = lstatSync(join(gameDir, path));
      } catch {
        throw new DossierError(`game/${path}: cannot be read`);
      }
      count += 1;
      if (count > c.game_max_files) {
        throw new DossierError(`game/: holds more than the ${c.game_max_files} files and directories allowed (game_max_files)`, 'game_max_files');
      }
      if (st.isDirectory()) {
        directories.push(path);
        pending.push(path);
      } else if (st.isFile()) {
        totalBytes += st.size;
        if (totalBytes > c.game_max_bytes) {
          throw new DossierError(`game/: its files come to more than the ${c.game_max_bytes} bytes allowed (game_max_bytes)`, 'game_max_bytes');
        }
        files.push({ path, bytes: st.size, cls: classifyGamePath(path) });
      } else {
        throw new DossierError(`game/${path}: a symbolic link or special file (game/ holds plain files and directories only)`);
      }
    }
  }
  files.sort((a, b) => compareCodeUnits(a.path, b.path));
  directories.sort(compareCodeUnits);
  return { files, directories, count, totalBytes };
}

/** The bytes of game/index.html as the tree reports it, or a DossierError saying why there are none. */
function readIndexBytes(gameDir: string, tree: GameTree): Uint8Array {
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

// ------------------------------------------------------------------ the page

/** One <script> tag of a page. */
export interface HtmlScript {
  /** The src attribute, or null for an inline script. */
  src: string | null;
  /** The type attribute, lowercased and trimmed; '' when absent. */
  type: string;
  /** An inline script's body; '' for a script with a src. */
  text: string;
}

/** One <link> tag of a page. */
export interface HtmlLink {
  /** The href attribute. */
  href: string;
  /** The rel attribute, lowercased and trimmed. */
  rel: string;
}

/** One element that loads a file through its src: <img>, <source>, <video>, <audio> or <iframe>. */
export interface HtmlResource {
  /** The tag name, lowercased. */
  tag: string;
  /** The src attribute. */
  src: string;
}

/** The tags whose src attribute is a resource the page loads. */
const RESOURCE_TAGS = ['img', 'source', 'video', 'audio', 'iframe'] as const;

/** One <script type="importmap"> block. */
export interface HtmlImportMap {
  /** The parsed JSON, when the body parsed. */
  value: unknown;
  /** Why the body is not JSON, or null when it is. */
  error: string | null;
}

/** What a page's markup says about the files it loads, all in document order. */
export interface HtmlFacts {
  scripts: HtmlScript[];
  links: HtmlLink[];
  resources: HtmlResource[];
  importMaps: HtmlImportMap[];
}

/** The offset of the `>` that ends a tag whose innards start at `from`, skipping quoted values; -1 when there is none. */
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

/** A tag's attributes as a map: names lowercased, values unquoted, a valueless attribute ''. */
function parseAttributes(body: string): Map<string, string> {
  const out = new Map<string, string>();
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
        const s = i;
        while (i < body.length && !/[\s>]/.test(body[i]!)) i++;
        value = body.slice(s, i);
      }
    }
    if (name !== '') out.set(name, value);
  }
  return out;
}

/** The offset of `</name` at or after `from`, ASCII case-insensitively; -1 when there is none. */
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
 * The load-bearing tags of a page, in document order: every <script>, every <link> with an href,
 * every resource element with a src, and every import-map block. This is a tag scan, not an HTML
 * parser: comments and the doctype are skipped, and only the attributes these tags carry are read.
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
    const rest = html.slice(at + 1, at + 8).toLowerCase();
    if (rest.startsWith('script') && !/[A-Za-z0-9]/.test(html[at + 7] ?? '')) {
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
    if (rest.startsWith('link') && !/[A-Za-z0-9]/.test(html[at + 5] ?? '')) {
      const end = findTagEnd(html, at + 5);
      if (end < 0) break;
      const attrs = parseAttributes(html.slice(at + 5, end));
      const href = attrs.get('href');
      if (href !== undefined) links.push({ href, rel: (attrs.get('rel') ?? '').trim().toLowerCase() });
      i = end + 1;
      continue;
    }
    const tag = RESOURCE_TAGS.find((name) => rest.startsWith(name) && !/[A-Za-z0-9]/.test(html[at + 1 + name.length] ?? ''));
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

// ------------------------------------------------------------------ the import map and paths

/** A page's import map, parsed: specifiers to references, a null value blocking its specifier. */
export interface ImportMap {
  imports: Record<string, string | null>;
  scopes: Record<string, Record<string, string | null>>;
}

/** The reading of a page's import map: both fields null when the page holds none at all. */
export interface ImportMapRead {
  map: ImportMap | null;
  error: string | null;
}

/** Whether a JSON value is a plain object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sets an own enumerable property, so even a "__proto__" key stays a key and never the prototype. */
function setOwn<T>(o: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * A page's import map, parsed. A page holds at most one; "imports" and "scopes" are each optional,
 * and a null value is kept, since it blocks its specifier. Anything unusable - a second map, text
 * that is not JSON, a shape an import map does not have - reads as an error and no map.
 */
export function importMapOf(facts: HtmlFacts): ImportMapRead {
  if (facts.importMaps.length === 0) return { map: null, error: null };
  if (facts.importMaps.length > 1) return { map: null, error: `index.html holds ${facts.importMaps.length} import maps: a page holds one at most` };
  const only = facts.importMaps[0]!;
  if (only.error !== null) return { map: null, error: `index.html's import map is not JSON (${only.error})` };
  if (!isPlainObject(only.value)) return { map: null, error: 'index.html\'s import map is not a JSON object' };
  const importsRaw = only.value.imports ?? {};
  if (!isPlainObject(importsRaw)) return { map: null, error: 'index.html\'s import map holds an "imports" that is not an object' };
  const imports: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(importsRaw)) {
    if (value !== null && typeof value !== 'string') return { map: null, error: `index.html's import map maps ${JSON.stringify(key)} to no string` };
    setOwn(imports, key, value);
  }
  const scopes: Record<string, Record<string, string | null>> = {};
  const scopesRaw = only.value.scopes;
  if (scopesRaw !== undefined) {
    if (!isPlainObject(scopesRaw)) return { map: null, error: 'index.html\'s import map holds a "scopes" that is not an object' };
    for (const [scope, entries] of Object.entries(scopesRaw)) {
      if (!isPlainObject(entries)) return { map: null, error: `index.html's import map scope ${JSON.stringify(scope)} is not an object` };
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

/** A URI scheme at the head of a reference: `name:`. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Whether a reference is relative: non-empty, no scheme, no leading // and no leading /. */
export function isRelativeRef(ref: string): boolean {
  return ref.length > 0 && !URI_SCHEME.test(ref) && !ref.startsWith('//') && !ref.startsWith('/');
}

/**
 * Whether a module specifier is relative in JavaScript's sense: ./ or ../ (or . or .. themselves).
 * A bare name such as "phaser" is not relative, whatever an import map then makes of it.
 */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * The path under game/ that a relative reference names, resolved against the importing file's
 * path (`from`, POSIX, relative to game/). A query or fragment is dropped. Null when the
 * reference is not relative, names nothing, or climbs out of game/.
 */
export function resolveGamePath(ref: string, from: string): string | null {
  if (!isRelativeRef(ref)) return null;
  const cut = ref.search(/[?#]/);
  const raw = cut < 0 ? ref : ref.slice(0, cut);
  if (raw === '') return null;
  const parts = from.split('/').slice(0, -1);
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  return parts.join('/');
}

/** What an import map says about one specifier: not found, or found with a value (null when blocked). */
export interface ImportMapMatch {
  found: boolean;
  value: string | null;
}

/** One map's answer for a specifier: an exact own key wins, else the longest own key ending in / that prefixes it. */
function matchEntry(entries: Record<string, string | null>, specifier: string): ImportMapMatch {
  if (Object.hasOwn(entries, specifier)) return { found: true, value: entries[specifier]! };
  let best: string | null = null;
  for (const key of Object.keys(entries)) {
    if (key.endsWith('/') && specifier.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  if (best === null) return { found: false, value: null };
  const base = entries[best]!;
  if (base === null) return { found: true, value: null };
  return { found: true, value: `${base}${specifier.slice(best.length)}` };
}

/**
 * The game path a scope key's prefix names, or null when it names none: the key resolved against
 * index.html, with '.' and './' meaning game/ itself. An absolute scope names a site path instead.
 */
function scopePrefix(scope: string): string | null {
  const cut = scope.search(/[?#]/);
  const raw = cut < 0 ? scope : scope.slice(0, cut);
  if (raw === '.' || raw === './') return '';
  return resolveGamePath(scope, INDEX_HTML);
}

/**
 * What the page's import map says for a specifier imported from `from`: a matching scope's map
 * first (the longest scope prefix that covers the importer wins), then the top-level imports.
 */
export function importMapMatch(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): ImportMapMatch {
  if (map === null) return { found: false, value: null };
  let best: { prefix: string; entries: Record<string, string | null> } | null = null;
  for (const [scope, entries] of Object.entries(map.scopes)) {
    const prefix = scopePrefix(scope);
    if (prefix === null || !from.startsWith(prefix)) continue;
    if (best === null || prefix.length > best.prefix.length) best = { prefix, entries };
  }
  if (best !== null) {
    const scoped = matchEntry(best.entries, specifier);
    if (scoped.found) return scoped;
  }
  return matchEntry(map.imports, specifier);
}

/** The value an import map gives a bare specifier imported from `from`; null when unmapped or blocked. */
export function mappedSpecifier(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): string | null {
  const match = importMapMatch(map, specifier, from);
  return match.found ? match.value : null;
}

/** The path under game/ a specifier names from `from`: relative to the importer, or through the import map. */
function resolveSpecifier(specifier: string, from: string, map: ImportMap | null): string | null {
  if (isRelativeSpecifier(specifier)) return resolveGamePath(specifier, from);
  const match = importMapMatch(map, specifier, from);
  if (!match.found || match.value === null || !isRelativeRef(match.value)) return null;
  return resolveGamePath(match.value, INDEX_HTML);
}

// ------------------------------------------------------------------ static imports

const IDENT_START = /[A-Za-z_$]/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * A module's static import and export-from specifiers, in source order, found by a lexical scan:
 * comments, strings, template literals and regular expressions are stepped over, so the words
 * inside them are never read as imports. This is not a parser. It recognizes `import 'x'`,
 * `import ... from 'x'`, `export ... from 'x'` and `export * from 'x'`; anything it cannot make
 * sense of is left alone (the scorer's own check parses the module properly).
 */
export function sourceImports(source: string): string[] {
  const found: string[] = [];
  const n = source.length;
  let i = 0;
  // The last significant character seen (whitespace and comments do not count). A `/` opens a
  // regular expression only where a value could start; after a value it is division instead.
  let prev = '';
  const regexCanStart = (p: string): boolean => p === '' || '([{,;:=!&|?+-*%^~<>'.includes(p);

  /** Advances past whitespace and any run of // and block comments. */
  const skipSpaceAndComments = (): void => {
    for (;;) {
      while (i < n && /\s/.test(source[i]!)) i++;
      if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') i++;
        continue;
      }
      if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      return;
    }
  };

  /** Reads the string literal whose opening quote is at i; returns its value, or null when it never closes on its line. */
  const readString = (quote: string): string | null => {
    i++;
    let s = '';
    while (i < n) {
      const ch = source[i]!;
      if (ch === quote) {
        i++;
        return s;
      }
      if (ch === '\\') {
        const next = source[i + 1];
        if (next === undefined) return null;
        s += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
        i += 2;
        continue;
      }
      if (ch === '\n') return null;
      s += ch;
      i++;
    }
    return null;
  };

  /** Steps over a template literal; ${} nesting is not tracked, a scan is enough for import hunting. */
  const skipTemplate = (): void => {
    i++;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        i++;
        return;
      }
      i++;
    }
  };

  /** Steps over a regular-expression literal, character classes and escapes included. */
  const skipRegex = (): void => {
    i++;
    let inClass = false;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        i++;
        return;
      } else if (ch === '\n') return;
      i++;
    }
  };

  /** Reads the identifier at i (possibly empty) and advances past it. */
  const readWord = (): string => {
    const start = i;
    while (i < n && IDENT_CHAR.test(source[i]!)) i++;
    return source.slice(start, i);
  };

  /** The string literal just ahead, if one is there; otherwise null. */
  const stringAhead = (): string | null => {
    skipSpaceAndComments();
    const ch = source[i];
    if (ch !== '"' && ch !== "'") return null;
    return readString(ch);
  };

  /**
   * From just after an `import` or `export` keyword, walks the clause to its `from 'x'` and
   * returns the specifier; returns null at a stopAt character, at the end, or at anything the
   * clause grammar does not expect. A string met along the way is the specifier itself
   * (the side-effect form, `import 'x'`).
   */
  const readClause = (stopAt: string[]): string | null => {
    for (;;) {
      skipSpaceAndComments();
      if (i >= n) return null;
      const ch = source[i]!;
      if (stopAt.includes(ch)) return null;
      if (ch === '"' || ch === "'") return readString(ch);
      if (ch === '{' || ch === '}' || ch === ',' || ch === '*') {
        i++;
        continue;
      }
      if (IDENT_START.test(ch)) {
        const word = readWord();
        if (word === 'from') return stringAhead();
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
      if (regexCanStart(prev)) skipRegex();
      else i++;
      prev = '/';
      continue;
    }
    if (IDENT_START.test(ch)) {
      const word = readWord();
      prev = 'a';
      if (word === 'import') {
        skipSpaceAndComments();
        // `import(...)` is dynamic and `import.meta` is not an import: neither is followed.
        if (source[i] === '(' || source[i] === '.') continue;
        const spec = readClause(['=', ';']);
        if (spec !== null) found.push(spec);
        continue;
      }
      if (word === 'export') {
        skipSpaceAndComments();
        // Only `export * ...` and `export { ... }` can carry a `from` clause.
        if (source[i] !== '*' && source[i] !== '{') continue;
        const spec = readClause(['=', ';']);
        if (spec !== null) found.push(spec);
        continue;
      }
      continue;
    }
    prev = ch;
    i++;
  }
  return found;
}

// ------------------------------------------------------------------ load order

/** One source file of a game: its path under game/ and its bytes. */
export interface GameSource {
  path: string;
  bytes: Uint8Array;
}

/** The JavaScript MIME types, by essence, that make a <script> a classic script. */
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

/** Whether a script type (htmlFacts lowercases and trims it) makes the script a classic one: none, or a JavaScript MIME type. */
function isClassicScript(type: string): boolean {
  return type === '' || CLASSIC_SCRIPT_TYPES.has(type.split(';')[0]!.trim());
}

/**
 * The source JS files of a game in the order the page loads them. index.html's scripts are taken
 * in document order: a classic script's src stands where it is (its text is never walked - a
 * classic script has no static imports), and a module script, whether external or inline, is
 * followed by a depth-first walk of its static imports, each specifier resolved against the
 * importer or through the page's import map. A file is listed the first time it is reached and
 * never twice; a reference that resolves to no source JS file is skipped, and so is a script of
 * another type entirely (a shader block, JSON data). index.html itself is never in the result.
 */
export function importOrder(sources: readonly GameSource[], facts: HtmlFacts): string[] {
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const map = importMapOf(facts).map;
  const textOf = (path: string): string => {
    const file = byPath.get(path);
    return file === undefined ? '' : decodeText(file.bytes);
  };
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (path: string, walk = true): void => {
    if (seen.has(path) || !MODULE_NAME.test(path) || !byPath.has(path)) return;
    seen.add(path);
    order.push(path);
    if (!walk) return;
    for (const specifier of sourceImports(textOf(path))) {
      const target = resolveSpecifier(specifier, path, map);
      if (target !== null) visit(target);
    }
  };
  for (const script of facts.scripts) {
    if (script.type !== 'module') {
      if (isClassicScript(script.type) && script.src !== null && isRelativeRef(script.src)) {
        const target = resolveGamePath(script.src, INDEX_HTML);
        if (target !== null) visit(target, false);
      }
      continue;
    }
    if (script.src !== null) {
      // A script's src is a URL reference, not a module specifier: `main.js` is relative to the page.
      const target = isRelativeRef(script.src) ? resolveGamePath(script.src, INDEX_HTML) : resolveSpecifier(script.src, INDEX_HTML, map);
      if (target !== null) visit(target);
    } else {
      for (const specifier of sourceImports(script.text)) {
        const target = resolveSpecifier(specifier, INDEX_HTML, map);
        if (target !== null) visit(target);
      }
    }
  }
  return order;
}

// ------------------------------------------------------------------ canonical JSON

/**
 * JSON with one spelling per value: object keys in code-unit order, no whitespace. Accepts null,
 * booleans, finite numbers, strings, arrays and plain objects; throws TypeError on anything else.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalJson: only plain objects and arrays');
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort(compareCodeUnits)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

// ------------------------------------------------------------------ the dossier

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
/** A screenshot's name: letters, digits and . _ -, 1 to 128 characters, never starting with . or -. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Whether `bytes` opens with `magic` at `at`. */
function opensWith(bytes: Uint8Array, magic: readonly number[], at = 0): boolean {
  return bytes.length >= at + magic.length && magic.every((b, idx) => bytes[at + idx] === b);
}

/** The extension a file's bytes are grouped by in the Game block: its last dot's tail, lowercased. */
function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '(none)';
}

/** The lines of the `## Game` block: what game/ holds, by class, with the totals. No source text. */
function gameBlockLines(tree: GameTree): string[] {
  const sources = tree.files.filter((f) => f.cls === 'source');
  const vendored = tree.files.filter((f) => f.cls === 'vendored');
  const assets = tree.files.filter((f) => f.cls === 'asset');
  const sum = (list: readonly GameFile[]): number => list.reduce((n, f) => n + f.bytes, 0);
  const lines = [
    '## Game',
    '',
    `Source files: ${sources.length} (${sum(sources)} bytes)`,
    `Vendored files: ${vendored.length} (${sum(vendored)} bytes)`,
  ];
  if (vendored.length > 0) {
    const listed = vendored.slice(0, VENDORED_LISTED).map((f) => `game/${f.path} (${f.bytes} bytes)`);
    const more = vendored.length > VENDORED_LISTED ? `, and ${vendored.length - VENDORED_LISTED} more` : '';
    lines.push(`  ${listed.join(', ')}${more}`);
  }
  const byExt = new Map<string, { n: number; bytes: number }>();
  for (const f of assets) {
    const ext = extensionOf(f.path);
    const at = byExt.get(ext) ?? { n: 0, bytes: 0 };
    at.n += 1;
    at.bytes += f.bytes;
    byExt.set(ext, at);
  }
  const extText = [...byExt]
    .sort((a, b) => compareCodeUnits(a[0], b[0]))
    .map(([ext, at]) => `${ext} ${at.n} (${at.bytes} bytes)`)
    .join(', ');
  lines.push(`Assets: ${extText === '' ? 'none' : extText}`);
  lines.push(`Totals: ${tree.count} files and directories (${tree.totalBytes} bytes)`);
  return lines;
}

/** One source as the dossier shows it: its raw bytes, its decoded text, and its ready fenced block. */
interface PreparedSource {
  /** The file's bytes, untouched. */
  norm: Uint8Array;
  /** The bytes decoded as text. */
  text: string;
  /** The fence the text sits in. */
  fence: string;
  /** The whole block: fence and language, the text (an LF added when it lacks one), the fence, a blank line. */
  block: string;
  /** The block's UTF-8 length. */
  blockBytes: number;
  /** The file's line count. */
  lines: number;
}

/**
 * A source section cut short inside its text: the heading, then the first k whole lines in the
 * fence, the fence closed, a line saying how many of the file's lines are not shown, and finally
 * tail(hiddenBytes) - the dossier's cut line, told how many source bytes this file leaves out.
 * k is the largest count (at least one, fewer than all) whose section fits in `room` UTF-8 bytes;
 * null when not even one line fits. Cuts land only just after an LF, which is never inside a
 * UTF-8 sequence, so no character is ever split.
 */
function truncatedSection(
  heading: string,
  code: { norm: Uint8Array; text: string; fence: string },
  language: string,
  room: number,
  tail: (hidden: number) => string,
): string | null {
  const total = countLines(code.norm);
  const lines = code.text.split('\n');
  const open = `${code.fence}${language}\n`;
  const close = `${code.fence}\n\n`;
  const note = (k: number): string => `[${total - k} of this file's ${total} lines not shown.]\n`;
  const fixed = utf8Length(heading) + utf8Length(open) + utf8Length(close);
  let best = 0;
  let shown = 0;
  let raw = 0;
  for (let k = 1; k < total; k++) {
    shown += utf8Length(lines[k - 1]!) + 1;
    raw = code.norm.indexOf(0x0a, raw) + 1;
    if (fixed + shown + utf8Length(note(k)) + utf8Length(tail(code.norm.length - raw)) <= room) best = k;
  }
  if (best === 0) return null;
  let rawEnd = 0;
  for (let k = 0; k < best; k++) rawEnd = code.norm.indexOf(0x0a, rawEnd) + 1;
  const head = lines.slice(0, best).map((l) => `${l}\n`).join('');
  return `${heading}${open}${head}${close}${note(best)}${tail(code.norm.length - rawEnd)}`;
}

/**
 * The dossier of an entry directory, as canonical-JSON bytes. The document names the schema, a
 * cover index (always 0: the first screenshot by name), the screenshots in name order with their
 * media types, SHA-256 hashes and base64 bytes, and the text: the Game block, then a Sources
 * section - index.html first, the page's scripts in load order, the remaining sources by path -
 * each source under a heading with its path, line count and byte count, its text in a fence.
 *
 * The text is held to caps.text_max_bytes UTF-8 bytes: sources go in whole, in order, while they
 * fit; the first that does not fit goes in cut at its last whole line that fits (or not at all,
 * when not one line fits); and a last line names how many whole files and bytes were left out.
 *
 * Throws DossierError on a game tree that cannot be read or is past a cap, a missing
 * game/index.html, screenshots no dossier can hold, a text cap too small for even the Game block
 * and the cut line, or a finished dossier past DOSSIER_MAX_BYTES.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const max = caps.text_max_bytes;
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(max)}`, 'text_max_bytes');
  }
  // The screenshot caps that bind: the caller's, when given and tighter; else the dossier's own.
  let maxImages = { n: DOSSIER_MAX_IMAGES, whose: 'a dossier holds' };
  let maxImageBytes = { n: DOSSIER_MAX_BYTES, whose: 'a dossier holds' };
  if (caps.screenshots !== undefined) {
    const s = caps.screenshots as { max?: unknown; max_bytes?: unknown } | null;
    if (typeof s !== 'object' || s === null) throw new DossierError('buildDossier: caps.screenshots must be an object {max, max_bytes}');
    for (const k of ['max', 'max_bytes'] as const) {
      const v = s[k];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
        throw new DossierError(`buildDossier: caps.screenshots.${k} must be a positive integer, not ${String(v)}`, `screenshots.${k}`);
      }
    }
    if ((s.max as number) < maxImages.n) maxImages = { n: s.max as number, whose: 'caps.screenshots.max allows' };
    if ((s.max_bytes as number) < maxImageBytes.n) maxImageBytes = { n: s.max_bytes as number, whose: 'caps.screenshots.max_bytes allows' };
  }
  const gameCaps: GameCaps = {};
  for (const k of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      throw new DossierError(`buildDossier: caps.${k} must be a whole number, not ${String(v)}`, k);
    }
    gameCaps[k] = v;
  }

  const gameDir = join(dir, 'game');
  const tree = readGameTree(gameDir, gameCaps);
  const html = htmlFacts(decodeText(readIndexBytes(gameDir, tree)));

  const sources = tree.files
    .filter((f) => f.cls === 'source')
    .map((f) => ({ path: f.path, bytes: new Uint8Array(readFileSync(join(gameDir, f.path))) }));
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const loaded = importOrder(sources, html).filter((p) => p !== INDEX_HTML);
  const placed = new Set<string>([INDEX_HTML, ...loaded]);
  const rest = sources.map((s) => s.path).filter((p) => !placed.has(p)).sort(compareCodeUnits);
  const order = [INDEX_HTML, ...loaded, ...rest];

  const prepared = new Map<string, PreparedSource>();
  const prepare = (path: string): PreparedSource | null => {
    const hit = prepared.get(path);
    if (hit !== undefined) return hit;
    const file = byPath.get(path);
    if (file === undefined) return null;
    const t = decodeText(file.bytes);
    const fence = fenceFor(t);
    const block = `${fence}${fenceLanguage(path)}\n${t}${t.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
    const code: PreparedSource = { norm: file.bytes, text: t, fence, block, blockBytes: utf8Length(block), lines: countLines(file.bytes) };
    prepared.set(path, code);
    return code;
  };

  const shotNames = ((): string[] => {
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
        .filter((e) => e.isFile() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort(compareCodeUnits);
    } catch (err) {
      throw new DossierError(`buildDossier: screenshots/ cannot be read (${(err as Error).message})`);
    }
  })();
  if (shotNames.length === 0) throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  if (shotNames.length > maxImages.n) {
    throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${maxImages.n} ${maxImages.whose}`, 'screenshots.max');
  }
  const images = shotNames.map((name) => {
    if (!IMAGE_NAME.test(name)) {
      throw new DossierError(`buildDossier: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
    }
    const size = lstatSync(join(dir, 'screenshots', name)).size;
    if (size > maxImageBytes.n) {
      throw new DossierError(`buildDossier: screenshots/${name} is ${size} bytes, over the ${maxImageBytes.n} ${maxImageBytes.whose}`, 'screenshots.max_bytes');
    }
    const bytes = new Uint8Array(readFileSync(join(dir, 'screenshots', name)));
    if (bytes.length > maxImageBytes.n) {
      throw new DossierError(`buildDossier: screenshots/${name} is ${bytes.length} bytes, over the ${maxImageBytes.n} ${maxImageBytes.whose}`, 'screenshots.max_bytes');
    }
    const media_type = opensWith(bytes, PNG_MAGIC) ? 'image/png' : opensWith(bytes, JPEG_MAGIC) ? 'image/jpeg' : null;
    if (media_type === null) throw new DossierError(`buildDossier: screenshots/${name} is neither a PNG nor a JPEG`);
    return { name, media_type, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  });

  const head = [...gameBlockLines(tree), '', '## Sources', '', ''].join('\n');
  const sections = order.map((path) => {
    const code = prepare(path);
    const lines = code === null ? 0 : code.lines;
    const bytes = code === null ? 0 : code.norm.length;
    const heading = `### game/${path} (${lines} ${lines === 1 ? 'line' : 'lines'}, ${bytes} bytes)\n\n`;
    // An empty file shows its heading and nothing else: there is no text to fence.
    const shown = lines === 0 ? null : code;
    return { heading, code: shown, size: utf8Length(heading) + (shown === null ? 0 : shown.blockBytes), bytes };
  });
  // restBytes[k] is the summed source bytes of every section after section k.
  const restBytes = new Array<number>(sections.length + 1).fill(0);
  for (let k = sections.length - 1; k >= 0; k--) restBytes[k] = restBytes[k + 1]! + (k + 1 < sections.length ? sections[k + 1]!.bytes : 0);

  const cutLine = (files: number, bytes: number): string =>
    `[Cut at ${max} bytes: ${files} file${files === 1 ? '' : 's'} and ${bytes} bytes of source left out.]\n`;
  let out = head;
  let used = utf8Length(head);
  let kept = 0;
  for (; kept < sections.length; kept++) {
    const section = sections[kept]!;
    const restCount = sections.length - kept - 1;
    // A section is only taken whole when the cut line for everything after it still fits too.
    const tail = restCount === 0 ? 0 : utf8Length(cutLine(restCount, restBytes[kept]!));
    if (used + section.size + tail > max) break;
    out += section.code === null ? section.heading : `${section.heading}${section.code.block}`;
    used += section.size;
  }
  if (kept < sections.length) {
    const first = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const after = restBytes[kept]!;
    const part =
      first.code === null
        ? null
        : truncatedSection(first.heading, first.code, fenceLanguage(order[kept]!), max - used, (hidden) => cutLine(restCount, after + hidden));
    out += part ?? cutLine(restCount + 1, after + first.bytes);
  }
  if (utf8Length(out) > max) {
    throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Game block and the cut line`, 'text_max_bytes');
  }

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: out.replace(/\n+$/, '\n'), images };
  const bytes = Buffer.from(canonicalJson(doc), 'utf8');
  if (bytes.length > DOSSIER_MAX_BYTES) throw new DossierError(`buildDossier: the dossier is ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}
