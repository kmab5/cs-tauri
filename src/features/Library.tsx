/**
 * The library: upload a game archive, then pick one to play.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, HardDrive } from 'lucide-react';
import { deleteGame, importGame, listGames, loadIcon, quota, type StoredGame } from '@/lib/library';
import { useDesktopImports } from '@/lib/desktop/openWith';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/* icons are Blobs in IndexedDB, so each needs its own object URL */
function GameIcon({ game }: { game: StoredGame }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    loadIcon(game).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      setUrl(u);
    });
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [game]);

  return (
    <img
      src={url ?? `${import.meta.env.BASE_URL}favicon.png`}
      alt=""
      aria-hidden="true"
      className="size-11 shrink-0 rounded object-cover"
      style={{ background: 'var(--cs-rule)' }}
    />
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function Library({ onPlay }: { onPlay: (game: StoredGame) => void }) {
  const [games, setGames] = useState<StoredGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listGames()
      .then((list) => {
        setGames(list);
        setError(null);
        void quota().then(setSpace);
      })
      .catch((e: Error) => {
        setGames([]);
        setError(`Could not open local storage: ${e.message}`);
      });
  }, []);

  useEffect(refresh, [refresh]);

  /* Bundled games on a fresh profile, and any .cszip the operating system
     hands us. Inert on the web. */
  useDesktopImports({
    onImported: refresh,
    onBusy: setBusy,
    onError: (message) => setError(message),
  });

  function take(file: File | undefined) {
    if (!file) return;
    if (!/\.(zip|cszip|tar|tgz|gz)$/i.test(file.name)) {
      return setError('Please choose a .zip, .cszip, .tar or .tar.gz file.');
    }
    setBusy(file.name);
    setError(null);
    importGame(file)
      .then((game) => {
        setBusy(null);
        refresh();
        onPlay(game);
      })
      .catch((e: Error) => {
        setBusy(null);
        setError(e.message);
      });
  }

  return (
    <div className="mx-auto max-w-measure px-4 pb-10 pt-6">
      <header className="mb-6 border-b border-rule pb-4">
        <h1 className="m-0 font-ui text-xl font-semibold">ChoiceScript</h1>
        <p className="mt-1 font-ui text-sm text-ink-muted">
          Add a game, then play it. Everything stays on this device — games, saves and settings.
          There is no server.
        </p>
      </header>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-rule bg-raised p-6 text-center transition-colors',
          'hover:border-accent hover:bg-accent-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          over && 'border-accent bg-accent-wash',
        )}
      >
        <Upload className="size-6 text-ink-faint" />
        <strong className="font-ui">Drop a ChoiceScript game here</strong>
        <span className="font-ui text-sm text-ink-muted">
          .zip, .cszip, .tar or .tar.gz containing a <code className="font-mono">scenes</code>{' '}
          folder
        </span>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.cszip,.tar,.tgz,.gz"
          className="hidden"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>

      {busy && (
        <div className="mt-4 font-ui text-sm" role="status">
          <span>Unpacking {busy}…</span>
          {/* indeterminate: unpacking is CPU-bound, not a transfer */}
          <Progress className="mt-1.5 animate-pulse" value={65} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-cs border-l-[3px] border-accent bg-accent-wash px-4 py-3 font-ui text-sm text-accent"
        >
          {error}
        </p>
      )}

      <h2 className="mb-3 mt-8 font-ui text-base font-medium">Your games</h2>
      {games === null ? (
        <p className="font-ui text-sm text-ink-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="font-ui text-sm text-ink-muted">Nothing uploaded yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {games.map((g) => (
            <li key={g.id} className="mb-2 flex items-stretch gap-2">
              <button
                onClick={() => onPlay(g)}
                className="flex flex-1 items-center gap-3 rounded-cs border border-rule border-l-[3px] bg-raised px-4 py-3 text-left transition-colors hover:border-l-accent"
              >
                <GameIcon game={g} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-ui font-semibold">{g.title}</span>
                  {g.author && (
                    <span className="truncate font-ui text-sm text-ink-muted">{g.author}</span>
                  )}
                  <span className="truncate font-ui text-sm text-ink-faint">
                    {g.scenes.length} scenes · {g.assets.length} assets · {formatBytes(g.bytes)}
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${g.title}`}
                onClick={() => deleteGame(g.id).then(refresh)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {space && space.quota > 0 && (
        <p className="mt-8 flex items-center gap-2 font-ui text-sm text-ink-faint">
          <HardDrive className="size-4" aria-hidden="true" />
          {formatBytes(space.usage)} used of about {formatBytes(space.quota)} available on this
          device
        </p>
      )}
    </div>
  );
}
