/**
 * The stats screen, docked.
 *
 * A window has room to keep the character sheet beside the story instead of
 * behind a dialog, so on a wide window it lives here.
 *
 * It is a snapshot, not a live view, and that is forced by the engine rather
 * than chosen. `showStats()` sets `bus.statsMode`, and while that flag is up
 * *every* block the engine emits is routed to the stats channel (bus.js:74)
 * — so a panel that simply stayed open would swallow the story's own output
 * the moment the player made a choice. Instead the scene is run, its blocks
 * are copied out, and the overlay is closed again immediately, which lowers
 * the flag and hands the story channel back.
 *
 * Refreshing is safe to do often: the engine runs the stats scene with
 * `saveSlot: 'temp'` (shell.js:79), its own convention for exactly this, so
 * none of it touches the player's autosave.
 *
 * Interactive stats screens keep their dialog. A game whose stats page asks a
 * question cannot be answered from a snapshot, so the panel says so and sends
 * the player to the full screen.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw, X } from 'lucide-react';

import type { Block, ChoiceScriptApi } from '@/lib/choicescript';
import { Blocks } from './Blocks';

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
  const [snapshot, setSnapshot] = useState<Block[]>([]);
  const [interactive, setInteractive] = useState(false);
  const capturing = useRef(false);

  const refresh = useCallback(() => {
    /* Never while a dialog is up: openStats() toggles, so calling it with an
       overlay already open would close the player's own window. */
    if (cs.getState().overlay) return;
    capturing.current = true;
    cs.openStats();
  }, [cs]);

  useEffect(() => {
    if (!capturing.current || state.overlay !== 'stats') return;
    capturing.current = false;
    setSnapshot(state.statsBlocks);
    setInteractive(state.statsPending !== null);
    cs.closeOverlay();
  }, [state.overlay, state.statsBlocks, state.statsPending, cs]);

  /* Re-read on every screen the player reaches, so the sheet keeps up. */
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    latest.current();
  }, [state.history]);

  return (
    <aside className="app-inspector" aria-label="Stats">
      <div className="app-inspector-head">
        <span>Stats</span>
        <span className="flex items-center gap-0.5">
          <button className="app-btn" onClick={refresh} aria-label="Refresh stats">
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
          <button className="app-btn" onClick={onClose} aria-label="Close stats panel">
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      </div>

      <div className="app-inspector-body">
        {snapshot.length ? (
          <Blocks blocks={snapshot} cs={cs} gameId={gameId} className="prose-cs" />
        ) : (
          <p className="app-note">Reading the character sheet…</p>
        )}

        {interactive && (
          <p className="app-note mt-4">
            This game&rsquo;s stats screen asks for input.{' '}
            <button className="app-btn px-0 underline" onClick={() => cs.openStats()}>
              Open the full screen
            </button>{' '}
            to answer it.
          </p>
        )}
      </div>
    </aside>
  );
}
