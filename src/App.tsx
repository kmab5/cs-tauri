import { useCallback, useEffect, useState } from 'react';
import type { ChoiceScriptApi } from '@/lib/choicescript';
import {
  loadEngine,
  loadIcon,
  openGame,
  releaseAssets,
  touchGame,
  type StoredGame,
} from '@/lib/library';
import { Shell } from '@/features/Shell';
import { Button } from '@/components/ui/button';
import { getTheme, getZoom } from '@/lib/theme';
import { loadMode, type AppMode } from '@/lib/mode';
import { setWindowTitle } from '@/lib/desktop/title';
import { importBundled, listGames } from '@/lib/library';

export default function App() {
  const [game, setGame] = useState<StoredGame | null>(null);
  const [cs, setCs] = useState<ChoiceScriptApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode | null>(null);

  const open = useCallback((manifest: StoredGame) => {
    setError(null);
    loadEngine()
      .then(async (engine) => {
        /* The window title, not just the document's: the taskbar, Alt-Tab and
           the window switcher all read the former. */
        setWindowTitle(manifest.title);
        const icon = await loadIcon(manifest);
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = icon ?? `${import.meta.env.BASE_URL}favicon.png`;

        await openGame(manifest, engine);
        /* The reader's choice from the library page follows them in, so the
           story does not open in a different palette from the shelf. */
        engine.setTheme(getTheme());
        engine.setZoom(getZoom());
        void touchGame(manifest);
        setGame(manifest);
        setCs(engine);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  /*
   * A standalone build has one game and no shelf, so there is nothing to pick:
   * import whatever shipped inside the app, then open it. The library build
   * skips all of this and renders the shelf as before.
   */
  useEffect(() => {
    let live = true;
    void loadMode().then(async (m) => {
      if (!live) return;
      setMode(m);
      if (!m.standalone) return;
      /* Named from the marker the exporter wrote, before the engine has even
         loaded — the window appears on the taskbar long before the first
         screen renders. */
      setWindowTitle(m.title);
      try {
        await importBundled();
        const games = await listGames();
        if (!live) return;
        if (!games.length) {
          return setError('This app ships a game, but it could not be unpacked.');
        }
        open(games[0]);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    });
    return () => {
      live = false;
    };
  }, [open]);

  if (error) {
    return (
      <div className="app-measure py-10">
        <p
          role="alert"
          className="rounded-cs border-l-[3px] border-accent bg-accent-wash px-4 py-3 font-ui text-sm text-accent"
        >
          {error}
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }

  /* The frame keeps the library alongside the story, so it renders whether or
     not a game is open. */
  /* Nothing renders until the mode is known: a shelf that flashes up for a
     frame in a single-game app is worse than a moment of nothing. */
  if (!mode) return null;

  if (mode.standalone && (!game || !cs)) {
    return (
      <div className="app-measure py-10 font-ui">
        <p className="app-note" role="status">
          Opening {mode.title ?? 'the story'}…
        </p>
      </div>
    );
  }

  return (
    <Shell
      standalone={mode.standalone}
      game={game}
      cs={cs}
      onPlay={(manifest) => {
        if (manifest.id === game?.id) return;
        /* The engine holds one game at a time and cannot be re-pointed in
           place, so switching restarts the window. Saves are on disk. */
        if (game) return window.location.reload();
        open(manifest);
      }}
      onExit={() => {
        releaseAssets();
        window.location.reload();
      }}
    />
  );
}
