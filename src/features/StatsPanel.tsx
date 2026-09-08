/**
 * The character sheet, docked.
 *
 * The previous version ran the stats scene, copied the blocks out and then
 * closed the overlay immediately to lower the engine's stats flag. That was
 * wrong, and visibly so: `showStats()` sets `bus.statsMode`, every block the
 * engine emits routes to the stats channel while it is up (bus.js:74), and the
 * scene is still emitting when the close lands. The remainder arrived as
 * *story* blocks — which is why the character sheet appeared in the middle of
 * the page.
 *
 * So the overlay stays open and this renders the live channel. The engine is
 * left in exactly the state it puts itself in; nothing races it. The cost is
 * that the story cannot take input while the sheet is open, for the same
 * routing reason — so the reading pane is marked inert, which the stylesheet
 * shows by dimming the choices.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import { Blocks } from './Blocks';
import { PendingView } from './Pending';

export function StatsPanel({
  cs,
  gameId,
  onClose,
}: {
  cs: ChoiceScriptApi;
  gameId: string;
  onClose: () => void;
}) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const open = state.overlay === 'stats';

  /* Opening the panel runs the scene; closing it hands the story channel back.
     openStats() toggles, so it is only ever called when nothing is open. */
  useEffect(() => {
    if (!cs.getState().overlay) cs.openStats();
    return () => {
      if (cs.getState().overlay === 'stats') cs.closeOverlay();
    };
  }, [cs]);

  /* Re-read on each new screen, so the sheet keeps up with the story. Cheap to
     do often: the engine runs this scene with saveSlot 'temp' (shell.js:79),
     its own convention for exactly this, so the autosave is untouched. */
  useEffect(() => {
    if (!cs.getState().overlay) cs.openStats();
  }, [cs, state.history]);

  /* Set here rather than in Shell because this component is the one that knows
     whether the engine's stats mode is actually up. */
  useEffect(() => {
    const pane = document.querySelector('.app-reading');
    if (!pane) return;
    pane.setAttribute('data-inert', String(open));
    return () => pane.setAttribute('data-inert', 'false');
  }, [open]);

  return (
    <aside className="app-inspector" aria-label="Stats">
      <div className="app-inspector-head">
        <span>Stats</span>
        <button className="app-btn" onClick={onClose} aria-label="Close stats panel">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="app-inspector-body">
        {state.statsBlocks.length ? (
          <Blocks blocks={state.statsBlocks} cs={cs} gameId={gameId} className="prose-cs" />
        ) : (
          <p className="app-note">Reading the character sheet…</p>
        )}
        {state.statsPending && (
          <PendingView cs={cs} pending={state.statsPending} channel="stats" />
        )}
        {open && (
          <p className="app-note mt-4">
            The story is paused while the sheet is open. Close it to carry on.
          </p>
        )}
      </div>
    </aside>
  );
}
