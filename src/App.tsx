import { useCallback, useState } from 'react';
import type { ChoiceScriptApi } from '@/lib/choicescript';
import { loadEngine, loadIcon, openGame, releaseAssets, type StoredGame } from '@/lib/library';
import { Shell } from '@/features/Shell';
import { Button } from '@/components/ui/button';

export default function App() {
  const [game, setGame] = useState<StoredGame | null>(null);
  const [cs, setCs] = useState<ChoiceScriptApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((manifest: StoredGame) => {
    setError(null);
    loadEngine()
      .then(async (engine) => {
        document.title = manifest.title;
        const icon = await loadIcon(manifest);
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = icon ?? `${import.meta.env.BASE_URL}favicon.png`;

        await openGame(manifest, engine);
        setGame(manifest);
        setCs(engine);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

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
  return (
    <Shell
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
