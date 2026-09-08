/**
 * Archives that arrive without anybody dropping one.
 *
 * Two sources, one pipeline: games bundled inside the app, imported once on a
 * fresh profile, and `.cszip` files the operating system hands us because the
 * player double-clicked one.
 *
 * The OS delivery is queued in Rust as well as emitted as an event, because a
 * file opened from a cold start arrives while the webview is still loading and
 * an event nobody is listening for is simply lost. So we drain the queue first,
 * then subscribe for the rest.
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

import { importBundled, importGamePath, pendingArchives, type StoredGame } from '@/lib/library';

export interface ImportHandlers {
  /** Called after each batch, so the library can refresh. */
  onImported: (games: StoredGame[]) => void;
  onBusy?: (label: string | null) => void;
  onError?: (message: string) => void;
}

/**
 * The bundled import, once per process, as a promise rather than a flag.
 *
 * A flag plus a mount-scoped `live` guard is what left the app stuck on
 * "Unpacking bundled game…" forever: StrictMode mounts, starts the import,
 * unmounts (setting live = false), and remounts — the second mount saw the flag
 * and skipped, while the first mount's completion was discarded because its
 * effect had been cleaned up. Nothing ever cleared the label and the library
 * never refreshed.
 *
 * Holding the promise means every mount, however many there are, awaits the
 * same work and every one of them sees the result.
 */
let bundled: Promise<StoredGame[]> | null = null;

export function useDesktopImports(handlers: ImportHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {

    const run = async (label: string, work: () => Promise<StoredGame[]>) => {
      latest.current.onBusy?.(label);
      try {
        const games = await work();
        if (games.length) latest.current.onImported(games);
      } catch (e) {
        latest.current.onError?.((e as Error).message);
      } finally {
        /* Not gated on `live`. A label this component set has to be cleared
           even if the component is gone, or it stays on screen for the rest of
           the session — which is exactly what happened. */
        latest.current.onBusy?.(null);
      }
    };

    bundled ??= importBundled();
    void run('the bundled game', () => bundled!);

    void pendingArchives().then((paths) => {
      for (const path of paths) {
        void run(basename(path), async () => [await importGamePath(path)]);
      }
    });

    const unlisten = listen<string>('open-archive', (event) => {
      void run(basename(event.payload), async () => [await importGamePath(event.payload)]);
    });

    return () => {
      void unlisten.then((off) => off());
    };
  }, []);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
