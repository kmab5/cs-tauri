/**
 * File storage for games: the desktop backend.
 *
 * Everything lives under the OS application data directory as ordinary files:
 *
 *     games/<id>/manifest.json
 *     games/<id>/scenes/<name>.txt
 *     games/<id>/assets/<path>
 *     stores/CS-<id>.json
 *
 * A player can copy a game folder out, back it up, or read a scene in a text
 * editor. None of that is true of an IndexedDB blob store.
 */
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

import type { Ingested, StoredGame } from './db.types';

/** Rust returns a native path; on Windows that means backslashes. */
function join(root: string, name: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  const tail = sep === '\\' ? name.replace(/\//g, '\\') : name;
  return `${root.replace(/[\\/]$/, '')}${sep}${tail}`;
}

/** The manifest *is* the record; Rust stores it verbatim and hands it back. */
export async function commit(game: StoredGame): Promise<void> {
  await invoke('write_manifest', { id: game.id, manifest: game });
}

export async function listGames(): Promise<StoredGame[]> {
  const manifests = await invoke<StoredGame[]>('list_manifests');
  return manifests.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  return (await listGames()).find((game) => game.id === id);
}

export async function getScenes(id: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('read_scenes', { id });
}

/**
 * Asset-protocol URLs, not object URLs. The webview streams the file from
 * disk, so opening a game with 66 images costs one IPC call rather than 66
 * blob transfers, and nothing needs revoking afterwards.
 */
export async function getAssetUrls(id: string): Promise<Record<string, string>> {
  const [root, game] = await Promise.all([
    invoke<string>('asset_root', { id }),
    getGame(id),
  ]);
  const out: Record<string, string> = {};
  for (const name of game?.assets ?? []) out[name] = convertFileSrc(join(root, name));
  return out;
}

export async function deleteGame(id: string): Promise<void> {
  await invoke('delete_game', { id });
}

/**
 * There is no browser quota here, and the disk's free space is not a limit
 * worth putting in front of someone importing a 4 MB game. Reporting a quota
 * of zero is what hides the storage line the web build shows.
 */
export async function quota(): Promise<{ usage: number; quota: number } | null> {
  const usage = await invoke<number>('library_bytes');
  return { usage, quota: 0 };
}

/** The application data directory is already persistent. */
export async function requestPersistence(): Promise<boolean> {
  return true;
}

/** Hand an archive to Rust, which unpacks it and reports what it found. */
export async function ingest(file: File): Promise<Ingested> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await invoke<Omit<Ingested, 'payload'>>('import_archive', bytes, {
    headers: { source: encodeURIComponent(file.name) },
  });
  return { ...result, source: decodeURIComponent(result.source) };
}

/** Same pipeline, for a file the OS handed us: a .cszip or a bundled game. */
export async function ingestPath(path: string): Promise<Ingested> {
  return invoke<Ingested>('import_archive_path', { path });
}

/** Bundled archives, imported once on a fresh profile. */
export async function takeBundled(): Promise<Ingested[]> {
  return invoke<Ingested[]>('take_bundled');
}

/** Archive paths the OS delivered before the front end was listening. */
export async function takePendingArchives(): Promise<string[]> {
  return invoke<string[]>('take_pending_archives');
}
