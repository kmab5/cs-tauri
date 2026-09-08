/**
 * The engine's save store, backed by a JSON file per game.
 *
 * ChoiceScript reaches persistence only through `window.store`, and
 * `initStore()` (engine/util.js:791) returns an existing `window.store` rather
 * than constructing one. So installing an object with the same three methods
 * before the engine boots replaces the storage layer with no change to
 * `engine/`, which is generated and must not be edited.
 *
 * One deliberate difference from the upstream store: the namespace is read on
 * every call instead of being captured once. `initStore()` caches
 * `window.store` for the lifetime of the page while `openGame()` reassigns
 * `window.storeName` for each game, so a store that captured its name would
 * write the second game's saves into the first game's namespace.
 */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

type StoreMap = Record<string, string>;
type GetCallback = (ok: boolean, value: string | null) => void;
type SetCallback = (ok: boolean) => void;

interface EngineStore {
  get(key: string, fn?: GetCallback, scope?: unknown): void;
  set(key: string, value: string, fn?: SetCallback, scope?: unknown): void;
  remove(key: string, fn?: SetCallback, scope?: unknown): void;
}

declare global {
  interface Window {
    store?: EngineStore;
  }
}

const FLUSH_DELAY = 200;

const loaded = new Map<string, Promise<StoreMap>>();
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

function namespace(): string {
  return window.storeName || 'CS-mygame';
}

function load(name: string): Promise<StoreMap> {
  let entry = loaded.get(name);
  if (!entry) {
    entry = invoke<StoreMap>('read_store', { name }).catch(() => ({}) as StoreMap);
    loaded.set(name, entry);
  }
  return entry;
}

async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const names = [...dirty];
  dirty.clear();
  inFlight = Promise.all(
    names.map(async (name) => {
      const data = await load(name);
      try {
        await invoke('write_store', { name, data });
      } catch (e) {
        // Put it back so the next flush, or the one on close, tries again.
        dirty.add(name);
        console.error(`could not write save file for ${name}`, e);
      }
    }),
  ).then(() => undefined);
  return inFlight;
}

function schedule(name: string) {
  dirty.add(name);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushNow(), FLUSH_DELAY);
}

const store: EngineStore = {
  get(key, fn, scope) {
    const name = namespace();
    void load(name).then(
      (map) => fn?.call(scope, true, Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null),
      () => fn?.call(scope, false, null),
    );
  },

  set(key, value, fn, scope) {
    const name = namespace();
    void load(name).then((map) => {
      map[key] = String(value);
      schedule(name);
      // The callback fires on the in-memory write, not the file write. The
      // engine chains its next step off it, and a player should not wait on
      // disk to see "Saved".
      fn?.call(scope, true);
    });
  },

  remove(key, fn, scope) {
    const name = namespace();
    void load(name).then((map) => {
      delete map[key];
      schedule(name);
      fn?.call(scope, true);
    });
  },
};

/**
 * A player who saves and immediately quits must not lose that save. The close
 * is intercepted, the pending write awaited, and the window then destroyed
 * explicitly — returning from the handler would let the process exit while the
 * write was still in the debounce window.
 */
async function flushBeforeClose() {
  const appWindow = getCurrentWindow();
  await appWindow.onCloseRequested(async (event) => {
    if (!dirty.size && !timer) return;
    event.preventDefault();
    await flushNow();
    await inFlight;
    await appWindow.destroy();
  });
}

export function installFileStore() {
  window.store = store;
  void flushBeforeClose().catch(() => {
    /* a window that will not report closes still saves on the debounce */
  });
}
