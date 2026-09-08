/**
 * The library, as a sidebar.
 *
 * On the web the library is a destination you leave to play and come back to.
 * In a window there is room for it to stay, so switching games is one click
 * and the shelf is always visible — which is what a desktop application with
 * a document list does.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { deleteGame, importGame, listGames, loadIcon, type StoredGame } from '@/lib/library';
import { useDesktopImports } from '@/lib/desktop/openWith';
import { useMenu } from '@/lib/desktop/menu';

function Cover({ game }: { game: StoredGame }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadIcon(game).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [game]);

  if (src) return <img className="app-game-art" src={src} alt="" />;
  return <span className="app-game-art">{game.title.slice(0, 1).toUpperCase()}</span>;
}

export function Sidebar({
  hidden,
  activeId,
  onPlay,
  onBusy,
  onError,
}: {
  hidden: boolean;
  activeId: string | null;
  onPlay: (game: StoredGame) => void;
  onBusy: (label: string | null) => void;
  onError: (message: string) => void;
}) {
  const [games, setGames] = useState<StoredGame[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listGames().then(setGames, (e: Error) => onError(e.message));
  }, [onError]);

  useEffect(refresh, [refresh]);

  useDesktopImports({ onImported: refresh, onBusy, onError });
  useMenu({ 'open-game': () => fileInput.current?.click() });

  const take = (file: File | undefined) => {
    if (!file) return;
    onBusy(file.name);
    importGame(file)
      .then(() => refresh())
      .catch((e: Error) => onError(e.message))
      .finally(() => onBusy(null));
  };

  const remove = (game: StoredGame) => {
    deleteGame(game.id)
      .then(() => {
        setConfirming(null);
        refresh();
      })
      .catch((e: Error) => onError(e.message));
  };

  return (
    <aside className="app-sidebar" hidden={hidden} aria-label="Library">
      {/* The macOS traffic lights sit over this corner, so the inset lives
          here rather than on the titlebar beside it. */}
      <div className="app-sidebar-head" data-tauri-drag-region>
        Library
      </div>

      <ul className="app-sidebar-list">
        {games.map((game) => (
          <li key={game.id} className="group flex items-center gap-1">
            <button
              className="app-game"
              aria-current={game.id === activeId}
              onClick={() => onPlay(game)}
            >
              <Cover game={game} />
              <span className="app-game-text">
                <span className="app-game-name">{game.title}</span>
                <span className="app-game-sub">{game.author || 'Unknown author'}</span>
              </span>
            </button>
            {/* Two steps rather than a confirm dialog: deleting now removes
                files, and a misclick should not be one keystroke from that. */}
            <button
              className="app-btn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => (confirming === game.id ? remove(game) : setConfirming(game.id))}
              onBlur={() => setConfirming(null)}
              aria-label={confirming === game.id ? `Delete ${game.title}?` : `Delete ${game.title}`}
              title={confirming === game.id ? 'Click again to delete' : 'Delete'}
            >
              {confirming === game.id ? 'Sure?' : <Trash2 className="size-3.5" aria-hidden />}
            </button>
          </li>
        ))}
        {!games.length && (
          <li className="px-2 py-3">
            <p className="app-note">No games yet. Add one below, or drop an archive anywhere.</p>
          </li>
        )}
      </ul>

      <div className="app-sidebar-foot">
        <button className="app-btn app-btn-primary w-full" onClick={() => fileInput.current?.click()}>
          <Plus className="size-3.5" aria-hidden /> Add game
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.cszip,.tar,.tgz,.gz"
          className="hidden"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>
    </aside>
  );
}
