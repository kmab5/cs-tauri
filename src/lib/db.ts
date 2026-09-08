/**
 * Storage, resolved once at startup.
 *
 * The same application runs as a static site and as a desktop app, and the two
 * store games in completely different places. Rather than thread a flag
 * through every caller, the choice is made here and everything above imports
 * `db` without knowing which backend answered.
 *
 * Both modules are bundled either way. The desktop backend is a few hundred
 * bytes of `invoke` calls, which is cheaper than the build complexity of
 * conditional imports.
 */
import { isDesktop } from './desktop';
import * as tauri from './db.tauri';
import * as web from './db.web';
import type { Backend } from './db.types';

export type { StoredGame, Ingested } from './db.types';

const backend: Backend = isDesktop() ? tauri : web;

export const commit = (...args: Parameters<Backend['commit']>) => backend.commit(...args);
export const listGames = () => backend.listGames();
export const getGame = (id: string) => backend.getGame(id);
export const getScenes = (id: string) => backend.getScenes(id);
export const getAssetUrls = (id: string) => backend.getAssetUrls(id);
export const deleteGame = (id: string) => backend.deleteGame(id);
export const quota = () => backend.quota();
export const requestPersistence = () => backend.requestPersistence();
