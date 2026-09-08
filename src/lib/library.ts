/**
 * The game library, entirely client-side.
 *
 * Ingest an archive, parse the metadata the engine needs, store it through
 * whichever backend is active, and hand the engine a preloaded scene cache so
 * it never makes a network request.
 *
 * That last part is what removes the server: `scene.js` consults a global
 * `allScenes` before any fetch (the mechanism compiled single-file games use),
 * so building that cache in the browser means there is nothing left to serve
 * but static files.
 */
import type { AchievementTuple, ChoiceScriptApi } from './choicescript';
import { extract, type ArchiveEntry } from './archive';
import * as db from './db';
import * as desktopDb from './db.tauri';
import { isDesktop } from './desktop';
import type { Ingested, StoredGame } from './db.types';

export type { StoredGame };

/* Published games ship a complete copy of the OLD runtime. Keeping any of it
 * would let a game shadow the engine we load. */
const RUNTIME_FILES = new Set([
  'index.html', 'mygame.js', 'version.js', 'scene.js', 'ui.js', 'util.js',
  'persist.js', 'navigator.js', 'style.css', 'alertify.js', 'alertify.min.js',
  'alertify.css', 'fastclick.js', 'credits.html', 'sandbox.html',
  'cache.php', 'redirect.php',
]);

/* Never stored, even if the archive contains one. Published game zips have
 * been observed shipping App Store signing keys. */
const SECRET_EXT = new Set(['.pem', '.key', '.p12', '.keystore', '.mobileprovision', '.jks']);

const ASSET_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico',
  '.mp3', '.ogg', '.wav', '.m4a', '.woff', '.woff2', '.ttf', '.otf',
]);

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const extname = (p: string) => {
  const m = /\.[a-z0-9]+$/i.exec(p);
  return m ? m[0].toLowerCase() : '';
};
const basename = (p: string) => p.split('/').pop() ?? p;

/** Reject anything that would escape the game's own namespace. */
function safeRelative(p: string): string | null {
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.includes('..') || p.startsWith('/')) return null;
  return parts.filter((s) => s && s !== '.').join('/');
}

/**
 * Authors nest their game differently: `scenes/`, `mygame/scenes/`, or
 * `TheGame/mygame/scenes/`. Find the prefix whose scenes folder holds a
 * startup.txt.
 */
function findSceneRoot(entries: ArchiveEntry[]): string | null {
  const candidates = new Map<string, Set<string>>();
  for (const e of entries) {
    const p = safeRelative(e.path);
    if (!p) continue;
    const m = /^(.*?)scenes\/([^/]+\.txt)$/i.exec(p);
    if (!m) continue;
    if (!candidates.has(m[1])) candidates.set(m[1], new Set());
    candidates.get(m[1])!.add(m[2].toLowerCase());
  }
  for (const [prefix, files] of candidates) {
    if (files.has('startup.txt')) return prefix;
  }
  return null;
}

/**
 * Everything declared in startup.txt is invisible to a restored save, which
 * jumps straight into a later scene. Without the scene list the first *finish
 * finds no next scene and ends the game; without achievements *achieve throws.
 * So they are parsed once, here, and handed to ChoiceScript.start().
 */
function parseSceneList(startup: string): string[] {
  const lines = startup.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*\*scene_list\s*$/i.test(l));
  if (start === -1) return [];

  const scenes: string[] = [];
  let indent: number | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const lead = (/^\s*/.exec(line) ?? [''])[0].length;
    if (indent === null) {
      if (lead === 0) break;
      indent = lead;
    }
    if (lead < indent) break;
    let name = line.trim();
    /* "$ town" marks a purchase-gated scene; the engine strips it, so we do */
    const purchase = /^\$(\w*)\s+(.*)/.exec(name);
    if (purchase) name = purchase[2];
    if (!/^[\w-]+$/.test(name)) break;
    if (!scenes.length && name.toLowerCase() !== 'startup') scenes.push('startup');
    scenes.push(name);
  }
  return scenes;
}

function parseAchievements(startup: string): AchievementTuple[] {
  const lines = startup.split(/\r?\n/);
  const out: AchievementTuple[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)\*achievement\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    /* the two descriptions are the following indented lines */
    const descriptions: string[] = [];
    for (let j = i + 1; j < lines.length && descriptions.length < 2; j++) {
      if (!lines[j].trim()) continue;
      if ((/^\s*/.exec(lines[j]) ?? [''])[0].length <= indent) break;
      descriptions.push(lines[j].trim());
    }
    const title = m[5].trim();
    out.push([
      m[2],
      m[3] !== 'hidden',
      parseInt(m[4], 10) || 0,
      title,
      descriptions[0] ?? title,
      descriptions[1] ?? descriptions[0] ?? title,
    ]);
  }
  return out;
}

/**
 * Unpack an archive in the browser.
 *
 * The desktop build does this in Rust instead — see db.tauri.ingest — because
 * the files have to land on disk anyway and the archive would otherwise cross
 * the IPC boundary twice.
 */
async function ingestWeb(file: File): Promise<Ingested> {
  let entries: ArchiveEntry[];
  try {
    entries = await extract(file);
  } catch (e) {
    throw new Error(`Could not read the archive: ${(e as Error).message}`);
  }
  if (!entries.length) throw new Error('The archive is empty.');

  const root = findSceneRoot(entries);
  if (root === null) {
    throw new Error(
      'No ChoiceScript game found. The archive must contain a "scenes" folder with a startup.txt inside it.',
    );
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const decoder = new TextDecoder();
  const scenes: Record<string, string> = {};
  const assets: Record<string, Blob> = {};
  const skipped: string[] = [];
  let startup = '';
  let bytes = 0;

  for (const entry of entries) {
    const rel = safeRelative(entry.path);
    if (!rel) continue;

    const base = basename(rel);
    if (SECRET_EXT.has(extname(base))) {
      skipped.push(`${base} (credential, not stored)`);
      continue;
    }
    if (!rel.startsWith(root)) continue;

    const inner = rel.slice(root.length);
    if (!inner || base.startsWith('.') || inner.includes('__MACOSX')) continue;

    const sceneMatch = /^scenes\/([^/]+)\.txt$/i.exec(inner);
    if (sceneMatch) {
      const text = decoder.decode(entry.data);
      scenes[sceneMatch[1]] = text;
      bytes += entry.data.byteLength;
      if (sceneMatch[1].toLowerCase() === 'startup') startup = text;
      continue;
    }
    if (inner.includes('/scenes/')) continue;

    if (RUNTIME_FILES.has(base.toLowerCase())) {
      skipped.push(base);
      continue;
    }

    const ext = extname(base);
    if (ASSET_EXT.has(ext)) {
      assets[inner] = new Blob([entry.data as BlobPart], {
        type: MIME[ext] ?? 'application/octet-stream',
      });
      bytes += entry.data.byteLength;
    }
  }

  if (!Object.keys(scenes).length) {
    throw new Error('No scene files were found in the archive.');
  }

  return {
    id,
    scenes: Object.keys(scenes).sort(),
    assets: Object.keys(assets).sort(),
    skipped,
    startup,
    bytes,
    source: file.name,
    payload: { scenes, assets },
  };
}

/**
 * The ChoiceScript half of an import, shared by every path in.
 *
 * Whether the files were unpacked by the browser or by Rust, startup.txt still
 * has to be read for the scene list and the achievements: everything declared
 * there is invisible to a restored save, which jumps straight into a later
 * scene.
 */
function buildManifest(ingested: Ingested): StoredGame {
  const { startup } = ingested;
  return {
    id: ingested.id,
    title: (/^\s*\*title\s+(.+)$/im.exec(startup)?.[1] ?? 'Untitled game').trim(),
    author: (/^\s*\*author\s+(.+)$/im.exec(startup)?.[1] ?? '').trim(),
    scenes: ingested.scenes,
    assets: ingested.assets,
    skipped: ingested.skipped,
    sceneList: parseSceneList(startup),
    achievements: parseAchievements(startup),
    source: ingested.source,
    uploadedAt: new Date().toISOString(),
    bytes: ingested.bytes,
  };
}

async function record(ingested: Ingested): Promise<StoredGame> {
  const game = buildManifest(ingested);
  await db.commit(game, ingested);
  /* ask to keep it: this is what defeats Safari's seven-day eviction once the
   * app is installed to the home screen. A no-op on the desktop. */
  void db.requestPersistence();
  return game;
}

export async function importGame(file: File): Promise<StoredGame> {
  return record(isDesktop() ? await desktopDb.ingest(file) : await ingestWeb(file));
}

/** A .cszip the operating system handed us, by association or by drag to dock. */
export async function importGamePath(path: string): Promise<StoredGame> {
  if (!isDesktop()) throw new Error('importing by path needs the desktop app');
  return record(await desktopDb.ingestPath(path));
}

/**
 * Archives shipped inside the app, imported once on a fresh profile. Rust
 * unpacks them and writes the marker; the manifests are finished here, because
 * parsing startup.txt is this side's job.
 */
export async function importBundled(): Promise<StoredGame[]> {
  if (!isDesktop()) return [];
  const games: StoredGame[] = [];
  for (const ingested of await desktopDb.takeBundled()) {
    games.push(await record(ingested));
  }
  return games;
}

/** Paths delivered before the front end was listening for them. */
export async function pendingArchives(): Promise<string[]> {
  return isDesktop() ? desktopDb.takePendingArchives() : [];
}

export const listGames = db.listGames;
export const deleteGame = db.deleteGame;
export const quota = db.quota;

/* ------------------------------------------------------------------ assets */

/**
 * Assets live in IndexedDB as Blobs, so they need object URLs to be reachable
 * from `<img src>`. One registry per game, revoked when another game opens.
 */
let activeAssets: { gameId: string; urls: Map<string, string> } | null = null;

export function releaseAssets() {
  if (!activeAssets) return;
  /* Only web object URLs are handles that leak. Desktop asset URLs are paths
   * to files on disk; revoking one would be meaningless. */
  for (const url of activeAssets.urls.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  activeAssets = null;
}

async function mountAssets(gameId: string) {
  releaseAssets();
  const urls = new Map(Object.entries(await db.getAssetUrls(gameId)));
  activeAssets = { gameId, urls };
}

/** `*image cover.png` arrives as a bare filename relative to the game. */
export function assetUrl(_gameId: string, source: string): string {
  if (/^(https?:|data:|blob:)/i.test(source)) return source;
  const clean = source.replace(/^\.?\//, '');
  return activeAssets?.urls.get(clean) ?? activeAssets?.urls.get(basename(clean)) ?? clean;
}

export function gameIconUrl(game: StoredGame): string | null {
  const named = game.assets.find((a) =>
    /(^|\/)(icon|favicon|cover|logo)[^/]*\.(png|ico|jpe?g|webp|svg)$/i.test(a),
  );
  if (!named) return null;
  return activeAssets?.urls.get(named) ?? null;
}

/**
 * Icons in the library list need URLs before their game is opened, so they get
 * their own short-lived object URLs.
 */
export async function loadIcon(game: StoredGame): Promise<string | null> {
  const named = game.assets.find((a) =>
    /(^|\/)(icon|favicon|cover|logo)[^/]*\.(png|ico|jpe?g|webp|svg)$/i.test(a),
  );
  if (!named) return null;
  const urls = await db.getAssetUrls(game.id);
  return urls[named] ?? null;
}

/* ------------------------------------------------------------------ engine */

let enginePromise: Promise<ChoiceScriptApi> | null = null;

export function loadEngine(): Promise<ChoiceScriptApi> {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${import.meta.env.BASE_URL}engine/bundle.js`;
    script.onload = () =>
      window.ChoiceScript
        ? resolve(window.ChoiceScript)
        : reject(new Error('The engine bundle did not expose window.ChoiceScript'));
    script.onerror = () => reject(new Error('Could not load the engine bundle'));
    document.head.appendChild(script);
  });
  return enginePromise;
}

/**
 * Hand the engine a preloaded scene cache and the assets, then start it.
 *
 * `scene.js` checks the global `allScenes` before any network call, so filling
 * it here means the engine never fetches anything — which is what makes the
 * whole app a static site. Scenes are parsed with `loadLines`, exactly as
 * compile.js does, because that is what populates `labels` for *goto.
 */
export async function openGame(game: StoredGame, engine: ChoiceScriptApi) {
  const [scenes] = await Promise.all([db.getScenes(game.id), mountAssets(game.id)]);

  const Scene = (window as unknown as { Scene: new () => {
    loadLines(text: string): void;
    crc: number;
    lines: string[];
    labels: Record<string, number>;
  } }).Scene;

  const allScenes: Record<string, { crc: number; lines: string[]; labels: Record<string, number> }> = {};
  for (const [name, text] of Object.entries(scenes)) {
    const scene = new Scene();
    scene.loadLines(text);
    allScenes[name] = { crc: scene.crc, lines: scene.lines, labels: scene.labels };
  }
  (window as unknown as { allScenes: unknown }).allScenes = allScenes;

  window.storeName = `CS-${game.id}`;

  engine.start({
    sceneList: game.sceneList,
    achievements: game.achievements,
    title: game.title,
    author: game.author,
  });
}
