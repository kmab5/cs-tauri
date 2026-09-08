/**
 * The library.
 *
 * A page, not a placeholder. It owns the whole window when no game is open,
 * themes with everything else, and is the only place a game can be started —
 * once one is running the sidebar shows *that* game, so there is no way to swap
 * a game out from under a live interpreter by accident.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Plus, Share2, Trash2 } from 'lucide-react';

import {
  deleteGame,
  exportGame,
  importGame,
  listGames,
  loadIcon,
  type StoredGame,
} from '@/lib/library';
import { useDesktopImports } from '@/lib/desktop/openWith';
import { useMenu } from '@/lib/desktop/menu';
import { DropOverlay } from './DropOverlay';

function Cover({ game }: { game: StoredGame }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadIcon(game).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [game]);
  if (src) return <img className="lib-cover" src={src} alt="" loading="lazy" />;
  /* No art: the initial at poster size, so a mixed shelf still lines up. */
  return <span className="lib-cover">{game.title.slice(0, 1).toUpperCase()}</span>;
}

/** A small pressable that is not a <button>, since the card itself is one. */
function CardAction({
  label,
  className,
  armed,
  onAct,
  children,
}: {
  label: string;
  className: string;
  armed?: boolean;
  onAct: () => void;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      data-armed={armed}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onAct();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onAct();
        }
      }}
    >
      {children}
    </span>
  );
}

function when(iso: string, verb = 'added'): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  if (days < 30) return `${verb} ${days} days ago`;
  return `${verb} ${new Date(iso).toLocaleDateString()}`;
}

/** The rail's thumbnail: the same art, at a size that fits a list. */
function RailArt({ game }: { game: StoredGame }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadIcon(game).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [game]);
  if (src) return <img src={src} alt="" loading="lazy" />;
  return <span className="lib-recent-art">{game.title.slice(0, 1).toUpperCase()}</span>;
}

export function LibraryPage({ onPlay }: { onPlay: (game: StoredGame) => void }) {
  const [games, setGames] = useState<StoredGame[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [exported, setExported] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listGames().then(setGames, (e: Error) => {
      setGames([]);
      setError(e.message);
    });
  }, []);

  useEffect(refresh, [refresh]);
  useDesktopImports({ onImported: refresh, onBusy: setBusy, onError: setError });
  useMenu({ 'open-game': () => fileInput.current?.click() });

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(zip|cszip|tar|tgz|gz)$/i.test(file.name)) {
      return setError('Please choose a .zip, .cszip, .tar or .tar.gz file.');
    }
    setError(null);
    setBusy(file.name);
    importGame(file)
      .then(refresh)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };

  const shown = (games ?? []).filter((game) =>
    `${game.title} ${game.author}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  /* Most recent first, and only games that have actually been opened. */
  const recent = (games ?? [])
    .filter((game) => !!game.lastPlayedAt)
    .sort((a, b) => (a.lastPlayedAt! < b.lastPlayedAt! ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="lib-shell">
      {/* Dropping is only offered here. Mid-game there is nothing sensible to
          do with an archive except queue it for a reload. */}
      <DropOverlay onImported={refresh} onBusy={setBusy} onError={setError} />

      {/* The shelf grows; the handful of games being read does not. */}
      {recent.length > 0 && (
        <aside className="lib-rail" aria-label="Recently played">
          <div className="lib-rail-head">
            <Clock className="mr-1 inline size-3" aria-hidden /> Recently played
          </div>
          <div className="lib-rail-list">
            {recent.map((game) => (
              <button key={game.id} className="lib-recent" onClick={() => onPlay(game)}>
                <RailArt game={game} />
                <span className="lib-recent-text">
                  <span className="lib-recent-name">{game.title}</span>
                  <span className="lib-recent-when">{when(game.lastPlayedAt!, 'played')}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className="lib">

      <header className="lib-head">
        <div>
          <h1>Library</h1>
          <p className="lib-count">
            {games === null
              ? 'Reading your games…'
              : games.length === 1
                ? '1 game on this machine'
                : `${games.length} games on this machine`}
          </p>
        </div>

        <span className="lib-head-spacer" />

        {/* Only once a shelf is big enough to need it. */}
        {(games?.length ?? 0) > 5 && (
          <input
            className="lib-search"
            type="search"
            placeholder="Filter"
            aria-label="Filter games"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        <button className="app-btn app-btn-primary" onClick={() => fileInput.current?.click()}>
          <Plus className="size-3.5" aria-hidden /> Add game
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.cszip,.tar,.tgz,.gz"
          className="hidden"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </header>

      {busy && (
        <p className="app-note mt-4" role="status">
          Unpacking {busy}…
        </p>
      )}
      {error && (
        <p className="app-note mt-4" role="alert">
          {error}
        </p>
      )}
      {exported && (
        <p className="app-note mt-4" role="status">
          Exported with its saves to <code className="font-mono">{exported}</code>
        </p>
      )}

      <div className="lib-grid">
        {games !== null && !games.length && (
          <div className="lib-empty">
            <p>
              Nothing on the shelf yet. Drop a ChoiceScript archive anywhere in this window, or
              pick one from disk — a <code className="font-mono">.zip</code> or{' '}
              <code className="font-mono">.cszip</code> with a{' '}
              <code className="font-mono">scenes</code> folder inside it.
            </p>
            <button className="app-btn app-btn-primary" onClick={() => fileInput.current?.click()}>
              <Plus className="size-3.5" aria-hidden /> Choose an archive
            </button>
          </div>
        )}

        {!!games?.length && !shown.length && (
          <div className="lib-empty">
            <p>Nothing matches “{filter}”.</p>
          </div>
        )}

        {shown.map((game) => (
          /* The whole card starts the game. A Play button inside a card that is
             itself clickable is two targets for one action. */
          <button key={game.id} className="lib-card" onClick={() => onPlay(game)}>
            <Cover game={game} />
            <span className="lib-card-body">
              <span className="lib-card-title">{game.title}</span>
              <span className="lib-card-meta">{game.author || 'Unknown author'}</span>
              <span className="lib-card-meta">
                {game.sceneList.length || game.scenes.length} scenes
                {game.achievements.length ? ` · ${game.achievements.length} achievements` : ''}
              </span>
              <span className="lib-card-meta">{when(game.uploadedAt)}</span>
            </span>

            <span className="lib-actions">
              {/* Exports the game *and* the reader's saves and achievements. */}
              <CardAction
                label={`Export ${game.title} with its saves`}
                className="app-btn lib-act"
                onAct={() => {
                  setExported(null);
                  setError(null);
                  exportGame(game.id)
                    .then((path) => setExported(path))
                    .catch((err: Error) => setError(err.message));
                }}
              >
                <Share2 className="size-3.5" aria-hidden />
              </CardAction>

              {/* Two steps rather than a confirm dialog: this removes files from
                  disk, and a misclick should not be one click away. */}
              <CardAction
                label={`Delete ${game.title}`}
                className="app-btn lib-act"
                armed={confirming === game.id}
                onAct={() => {
                  if (confirming !== game.id) return setConfirming(game.id);
                  deleteGame(game.id)
                    .then(() => {
                      setConfirming(null);
                      refresh();
                    })
                    .catch((err: Error) => setError(err.message));
                }}
              >
                {confirming === game.id ? 'Sure?' : <Trash2 className="size-3.5" aria-hidden />}
              </CardAction>
            </span>
          </button>
        ))}
        </div>
      </div>
    </div>
  );
}
