/**
 * The window frame.
 *
 * Three panes: library on the left, the story in the middle, the character
 * sheet on the right when there is room for it. The titlebar is ours, so the
 * game's controls live in the window's own chrome rather than in a bar that
 * scrolls with the page.
 *
 * Everything here is desktop-only. The static site keeps the sticky in-page
 * title bar it has always had, which is the right answer for a page.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BarChart3, Bookmark, Maximize2, PanelLeft, Settings2, Trophy } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import type { StoredGame } from '@/lib/library';
import { useMenu } from '@/lib/desktop/menu';
import { Player } from './Player';
import { Sidebar } from './Sidebar';
import { StatsPanel } from './StatsPanel';
import { DropOverlay } from './DropOverlay';
import { readScroll, saveScroll, useReadingKeys } from './useReadingKeys';

/** Below this the inspector would squeeze the reading measure, so it stays a dialog. */
const WIDE = '(min-width: 1100px)';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

const ZOOM_STEP = 0.1;
const ZOOM_RANGE = [0.7, 2] as const;

/**
 * The controls, which need the live state for the achievement count. Split out
 * so the frame can render before a game is open, when there is no engine to
 * subscribe to.
 */
function GameControls({
  cs,
  statsDocked,
  onToggleStats,
}: {
  cs: ChoiceScriptApi;
  statsDocked: boolean;
  onToggleStats: () => void;
}) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const earned = state.achievements?.earned.length ?? 0;
  const total = state.achievements?.total ?? 0;

  const zoom = (delta: number) => {
    const next = Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], state.theme.zoom + delta));
    cs.setZoom(Number(next.toFixed(2)));
  };

  useMenu({
    save: () => cs.openSaves(),
    restore: () => cs.openSaves(),
    restart: () => cs.restart(),
    achievements: () => cs.openAchievements(),
    settings: () => cs.openSettings(),
    'zoom-in': () => zoom(ZOOM_STEP),
    'zoom-out': () => zoom(-ZOOM_STEP),
    'zoom-reset': () => cs.setZoom(1),
  });

  return (
    <>
      <button
        className="app-btn"
        aria-pressed={statsDocked}
        onClick={statsDocked ? onToggleStats : () => cs.openStats()}
        onAuxClick={onToggleStats}
      >
        <BarChart3 className="size-3.5" aria-hidden /> Stats
      </button>
      <button className="app-btn" onClick={() => cs.openSaves()}>
        <Bookmark className="size-3.5" aria-hidden /> Saves
      </button>
      <button className="app-btn" onClick={() => cs.openAchievements()}>
        <Trophy className="size-3.5" aria-hidden /> Achievements
        {total > 0 && (
          <span className="app-badge">
            {earned}/{total}
          </span>
        )}
      </button>
      <button className="app-btn" onClick={() => cs.openSettings()}>
        <Settings2 className="size-3.5" aria-hidden /> Settings
      </button>
    </>
  );
}

const pane = () => document.querySelector('.app-reading');

/**
 * Keyboard paging and scroll memory. Headless, because both need the live
 * engine state and the frame itself renders before there is any engine.
 */
function ReadingKeys({ cs, gameId }: { cs: ChoiceScriptApi; gameId: string }) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);

  useReadingKeys({
    pane,
    canContinue: state.pending?.kind === 'next',
    onContinue: () => cs.next(),
  });

  /* Restored once, at the start of the session. Player scrolls each new screen
     back to the top, so anything later would be fighting it. */
  useEffect(() => {
    const el = pane();
    const top = readScroll(gameId);
    if (el && top) requestAnimationFrame(() => el.scrollTo({ top }));
  }, [gameId]);

  useEffect(() => {
    const el = pane();
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveScroll(gameId, el.scrollTop), 400);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [gameId]);

  return null;
}

export function Shell({
  game,
  cs,
  onPlay,
  onExit,
}: {
  game: StoredGame | null;
  cs: ChoiceScriptApi | null;
  onPlay: (game: StoredGame) => void;
  onExit: () => void;
}) {
  const [sidebar, setSidebar] = useState(true);
  const [inspector, setInspector] = useState(false);
  /* Focus mode hides both side panes without forgetting whether they were
     open, so leaving it puts the window back the way the reader had it. */
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE);
  const docked = inspector && wide && !focus && !!cs && !!game;

  const refreshLibrary = useCallback(() => setError(null), []);

  useMenu({
    'toggle-sidebar': () => setSidebar((on) => !on),
    'toggle-stats': () => (wide ? setInspector((on) => !on) : cs?.openStats()),
    'toggle-focus': () => setFocus((on) => !on),
    library: onExit,
  });

  /* Escape is the way out of a mode; it should never be the only way in. */
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focus]);

  return (
    <div className="app-shell">
      <Sidebar
        hidden={!sidebar || focus}
        activeId={game?.id ?? null}
        onPlay={onPlay}
        onBusy={setBusy}
        onError={setError}
      />

      <div className="app-main">
        <header className="app-titlebar" data-tauri-drag-region>
          <button
            className="app-btn"
            data-tauri-drag-region="false"
            aria-pressed={sidebar}
            aria-label="Toggle sidebar"
            onClick={() => setSidebar((on) => !on)}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>

          <h1 className="app-title" data-tauri-drag-region>
            {game?.title ?? 'ChoiceScript'}
            {game?.author && <span> — {game.author}</span>}
          </h1>

          <div className="flex items-center gap-0.5" data-tauri-drag-region="false">
            {cs && game && (
              <button
                className="app-btn"
                aria-pressed={focus}
                aria-label="Focus mode"
                title="Focus mode"
                onClick={() => setFocus((on) => !on)}
              >
                <Maximize2 className="size-3.5" aria-hidden />
              </button>
            )}
            {cs && game && (
              <GameControls
                cs={cs}
                statsDocked={docked}
                onToggleStats={() => setInspector((on) => !on)}
              />
            )}
          </div>
        </header>

        <div className="app-reading">
          <div className="app-measure">
            {busy && (
              <p className="app-note" role="status">
                Unpacking {busy}…
              </p>
            )}
            {error && (
              <p className="app-note" role="alert">
                {error}
              </p>
            )}
            {game && cs ? (
              <>
                <ReadingKeys cs={cs} gameId={game.id} />
                <Player cs={cs} game={game} onExit={onExit} variant="shell" />
              </>
            ) : (
              <Welcome />
            )}
          </div>
        </div>
      </div>

      {docked && cs && game && (
        <StatsPanel cs={cs} gameId={game.id} onClose={() => setInspector(false)} />
      )}

      <DropOverlay onImported={refreshLibrary} onBusy={setBusy} onError={setError} />
    </div>
  );
}

function Welcome() {
  return (
    <div className="pt-16">
      <h2 className="m-0 font-ui text-lg font-medium text-ink">Pick a game</h2>
      <p className="mt-2 font-ui text-sm text-ink-muted">
        Choose one from the library, or drop a <code className="font-mono">.zip</code> or{' '}
        <code className="font-mono">.cszip</code> archive anywhere in this window.
      </p>
    </div>
  );
}
