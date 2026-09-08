/**
 * The game library.
 *
 * Rust unpacks an archive and reports what it found; this module reads the
 * ChoiceScript out of it — the scene list, the achievements, the title — writes
 * the manifest, and hands the engine a preloaded scene cache.
 *
 * That last part is what keeps the engine off the network entirely: `scene.js`
 * consults a global `allScenes` before any fetch (the mechanism compiled
 * single-file games use), so filling that cache from disk means the interpreter
 * never asks for a URL.
 */
import type { AchievementTuple, ChoiceScriptApi } from './choicescript';
import * as db from './db';
import type { Ingested, StoredGame } from './db.types';

export type { StoredGame };

const basename = (p: string) => p.split('/').pop() ?? p;

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
 * The ChoiceScript half of an import, shared by every path in.
 *
 * startup.txt has to be read for the scene list and the achievements:
 * everything declared there is invisible to a restored save, which jumps
 * straight into a later scene.
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
  await db.commit(game);
  return game;
}

/** An archive the player dropped or picked. */
export async function importGame(file: File): Promise<StoredGame> {
  return record(await db.ingest(file));
}

/** A .cszip the operating system handed us, by association or by drag to dock. */
export async function importGamePath(path: string): Promise<StoredGame> {
  return record(await db.ingestPath(path));
}

/**
 * Archives shipped inside the app, imported once on a fresh profile. Rust
 * unpacks them and writes the marker; the manifests are finished here, because
 * parsing startup.txt is this side's job.
 */
export async function importBundled(): Promise<StoredGame[]> {
  const games: StoredGame[] = [];
  for (const ingested of await db.takeBundled()) {
    games.push(await record(ingested));
  }
  return games;
}

/** Paths delivered before the front end was listening for them. */
export async function pendingArchives(): Promise<string[]> {
  return db.takePendingArchives();
}

export const listGames = db.listGames;
export const deleteGame = db.deleteGame;
export const libraryBytes = db.libraryBytes;
export const exportGame = db.exportGame;

/**
 * Stamp a game as just opened.
 *
 * Fire-and-forget: the reader is already looking at the first screen by the
 * time this lands, and a failed write should not interrupt that — the rail
 * simply keeps the older order.
 */
export async function touchGame(game: StoredGame): Promise<void> {
  try {
    await db.commit({ ...game, lastPlayedAt: new Date().toISOString() });
  } catch {
    /* the game still opened; only the ordering of the rail is affected */
  }
}

/* ------------------------------------------------------------------ assets */

/**
 * Assets live in IndexedDB as Blobs, so they need object URLs to be reachable
 * from `<img src>`. One registry per game, revoked when another game opens.
 */
let activeAssets: { gameId: string; urls: Map<string, string> } | null = null;

export function releaseAssets() {
  /* Asset URLs are paths through the asset protocol, not object URLs, so there
   * is no handle to revoke — dropping the map is the whole of it. */
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
