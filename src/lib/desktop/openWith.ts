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
 * Module scope, not a ref: React's StrictMode runs effects twice in
 * development, and two overlapping first-run imports would both find the
 * marker absent and install the bundled games twice.
 */
let bundledStarted = false;

export function useDesktopImports(handlers: ImportHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    let live = true;

    const run = async (label: string, work: () => Promise<StoredGame[]>) => {
      latest.current.onBusy?.(label);
      try {
        const games = await work();
        if (live && games.length) latest.current.onImported(games);
      } catch (e) {
        if (live) latest.current.onError?.((e as Error).message);
      } finally {
        if (live) latest.current.onBusy?.(null);
      }
    };

    if (!bundledStarted) {
      bundledStarted = true;
      void run('the bundled game', importBundled);
    }

    void pendingArchives().then((paths) => {
      for (const path of paths) {
        void run(basename(path), async () => [await importGamePath(path)]);
      }
    });

    const unlisten = listen<string>('open-archive', (event) => {
      void run(basename(event.payload), async () => [await importGamePath(event.payload)]);
    });

    return () => {
      live = false;
      void unlisten.then((off) => off());
    };
  }, []);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
