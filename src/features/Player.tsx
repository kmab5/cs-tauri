/**
 * The player.
 *
 * Split register in practice: the reading column is quiet and unadorned so the
 * author's prose has the floor, while the chrome — the HUD, the sheets, the
 * choice rail — carries the identity.
 */
import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import type { ChoiceScriptApi } from '@/lib/choicescript';
import type { StoredGame } from '@/lib/library';
import { Blocks } from './Blocks';
import { PendingView } from './Pending';
import { Overlays, ModalPrompt } from './Overlays';
import { TitleBar } from './Toolbar';
import { useAchievementToasts } from './useAchievementToasts';


/** `subscribe` + `getState` is exactly the external-store contract React wants. */
function useChoiceScript(cs: ChoiceScriptApi) {
  return useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
}

export function Player({
  cs,
  game,
  onExit,
}: {
  cs: ChoiceScriptApi;
  game: StoredGame;
  onExit: () => void;
}) {
  const state = useChoiceScript(cs);
  useAchievementToasts(state);

  /* a new screen starts at the top; a reader should never land mid-page */
  const screen = useRef(state.history);
  useEffect(() => {
    if (screen.current !== state.history) {
      screen.current = state.history;
      window.scrollTo({ top: 0, behavior: state.theme.animate ? 'smooth' : 'auto' });
    }
  }, [state.history, state.theme.animate]);

  return (
    <div className="mx-auto max-w-[var(--cs-measure,66ch)] px-5 pb-24">
      <TitleBar cs={cs} state={state} fallbackTitle={game.title} onExit={onExit} />

      {state.loading && (
        <p className="font-ui text-sm text-ink-faint" role="status">
          Loading…
        </p>
      )}

      <motion.main
        key={state.history}
        initial={state.theme.animate ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ viewTransitionName: 'story' }}
      >
        <Blocks blocks={state.blocks} cs={cs} gameId={game.id} className="prose-cs" />
        <PendingView pending={state.pending} cs={cs} />
      </motion.main>

      <Overlays cs={cs} state={state} gameId={game.id} />
      <ModalPrompt cs={cs} state={state} />
    </div>
  );
}
