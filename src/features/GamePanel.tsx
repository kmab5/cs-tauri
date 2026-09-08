/**
 * The sidebar, while a game is open.
 *
 * The list of other games is deliberately not here. The engine holds one game
 * at a time and cannot be re-pointed in place, so a list would only offer a
 * choice that costs a reload — and it would sit one stray click away from a
 * reader's place in a 3–10 hour story. So this shows the game they are in, and
 * a way back to the shelf.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronLeft } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import { loadIcon, type StoredGame } from '@/lib/library';

export function GamePanel({
  game,
  cs,
  onExit,
  children,
}: {
  game: StoredGame;
  cs: ChoiceScriptApi | null;
  onExit: () => void;
  /** The resize grip, which has to live inside the panel it resizes. */
  children?: React.ReactNode;
}) {
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadIcon(game).then((url) => live && setCover(url));
    return () => {
      live = false;
    };
  }, [game]);

  return (
    <aside className="app-sidebar" aria-label="This game">
      <div className="app-sidebar-head" data-tauri-drag-region>
        <button
          className="app-btn"
          data-tauri-drag-region="false"
          onClick={onExit}
          title="Back to the library (Ctrl+Shift+L)"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          <span className="app-btn-label">Library</span>
        </button>
      </div>

      <div className="app-detail">
        {cover && <img className="app-detail-cover" src={cover} alt="" />}
        <h2>{game.title}</h2>
        <p>{game.author || 'Unknown author'}</p>
        {cs ? <Progress cs={cs} game={game} /> : null}
      </div>
      {children}
    </aside>
  );
}

/** Split out so the panel can render before the engine has loaded. */
function Progress({ cs, game }: { cs: ChoiceScriptApi; game: StoredGame }) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const earned = state.achievements?.earned.length ?? 0;
  const total = state.achievements?.total ?? game.achievements.length;
  const score = state.achievements?.score ?? 0;
  const totalScore = state.achievements?.totalScore ?? 0;

  return (
    <dl>
      <dt>Screens read</dt>
      <dd>{state.history}</dd>
      <dt>Scenes</dt>
      <dd>{game.sceneList.length || game.scenes.length}</dd>
      {total > 0 && (
        <>
          <dt>Achievements</dt>
          <dd>
            {earned} / {total}
          </dd>
        </>
      )}
      {totalScore > 0 && (
        <>
          <dt>Points</dt>
          <dd>
            {score} / {totalScore}
          </dd>
        </>
      )}
      <dt>Added</dt>
      <dd>{new Date(game.uploadedAt).toLocaleDateString()}</dd>
    </dl>
  );
}
