/**
 * IndexedDB storage for games: the web backend.
 *
 * There is no server. Scenes are stored as text and assets as Blobs, both
 * keyed by game id.
 *
 * Known trade-off, accepted deliberately: Safari evicts IndexedDB after seven
 * days without interaction unless the site is installed to the home screen.
 * Chrome and Firefox do not. Games are also per-device — there is no sync.
 */

import type { Ingested, StoredGame } from './db.types';

const DB_NAME = 'choicescript';
const DB_VERSION = 1;
const GAMES = 'games';
const SCENES = 'scenes';
const ASSETS = 'assets';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES, { keyPath: 'id' });
      // scene and asset keys are `${gameId}/${name}`, so a range query over
      // that prefix gets everything belonging to one game
      if (!db.objectStoreNames.contains(SCENES)) db.createObjectStore(SCENES);
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the game database'));
  });
  return dbPromise;
}

function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        let result: T;
        Promise.resolve(run(t)).then((r) => (result = r), reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('Database transaction failed'));
        t.onabort = () => reject(t.error ?? new Error('Database transaction aborted'));
      }),
  );
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Every key belonging to one game, via a prefix range. */
function prefixRange(id: string) {
  return IDBKeyRange.bound(`${id}/`, `${id}/\uffff`);
}

export async function putGame(
  game: StoredGame,
  scenes: Record<string, string>,
  assets: Record<string, Blob>,
): Promise<void> {
  await tx([GAMES, SCENES, ASSETS], 'readwrite', (t) => {
    t.objectStore(GAMES).put(game);
    const sceneStore = t.objectStore(SCENES);
    for (const [name, text] of Object.entries(scenes)) sceneStore.put(text, `${game.id}/${name}`);
    const assetStore = t.objectStore(ASSETS);
    for (const [name, blob] of Object.entries(assets)) assetStore.put(blob, `${game.id}/${name}`);
  });
}

export async function listGames(): Promise<StoredGame[]> {
  const games = await tx([GAMES], 'readonly', (t) =>
    wrap(t.objectStore(GAMES).getAll() as IDBRequest<StoredGame[]>),
  );
  return games.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  return tx([GAMES], 'readonly', (t) =>
    wrap(t.objectStore(GAMES).get(id) as IDBRequest<StoredGame | undefined>),
  );
}

export async function getScenes(id: string): Promise<Record<string, string>> {
  return tx([SCENES], 'readonly', async (t) => {
    const store = t.objectStore(SCENES);
    const keys = (await wrap(store.getAllKeys(prefixRange(id)))) as string[];
    const values = (await wrap(store.getAll(prefixRange(id)))) as string[];
    const out: Record<string, string> = {};
    keys.forEach((key, i) => (out[key.slice(id.length + 1)] = values[i]));
    return out;
  });
}

export async function getAssets(id: string): Promise<Record<string, Blob>> {
  return tx([ASSETS], 'readonly', async (t) => {
    const store = t.objectStore(ASSETS);
    const keys = (await wrap(store.getAllKeys(prefixRange(id)))) as string[];
    const values = (await wrap(store.getAll(prefixRange(id)))) as Blob[];
    const out: Record<string, Blob> = {};
    keys.forEach((key, i) => (out[key.slice(id.length + 1)] = values[i]));
    return out;
  });
}

/**
 * Blobs are only reachable from an <img> through an object URL. The caller
 * owns these and revokes them when another game opens; see releaseAssets().
 */
export async function getAssetUrls(id: string): Promise<Record<string, string>> {
  const blobs = await getAssets(id);
  const out: Record<string, string> = {};
  for (const [name, blob] of Object.entries(blobs)) out[name] = URL.createObjectURL(blob);
  return out;
}

/** Web commits the unpacked files themselves; there is nowhere else to put them. */
export async function commit(game: StoredGame, ingested: Ingested): Promise<void> {
  if (!ingested.payload) throw new Error('the web backend needs the unpacked files');
  await putGame(game, ingested.payload.scenes, ingested.payload.assets);
}

export async function deleteGame(id: string): Promise<void> {
  await tx([GAMES, SCENES, ASSETS], 'readwrite', (t) => {
    t.objectStore(GAMES).delete(id);
    t.objectStore(SCENES).delete(prefixRange(id));
    t.objectStore(ASSETS).delete(prefixRange(id));
  });
  /* saves are namespaced by game id in localStorage */
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(`CS-${id}`)) localStorage.removeItem(key);
  }
}

/** How much room the browser is giving us, when it will say. */
export async function quota(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/**
 * Ask the browser to keep this data. Granted silently in Chrome when the site
 * is installed or engaged with; it is what stops Safari's seven-day eviction
 * once the app is added to the home screen.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
