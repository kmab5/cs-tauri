/**
 * The window frame.
 *
 * No game open: the library has the whole window. A game open: the sidebar
 * shows that game, the story takes the middle, and the character sheet docks on
 * the right when there is room for it.
 *
 * Everything the titlebar can do, the menu and the keyboard can do too — they
 * share one handler registry (lib/desktop/menu.ts) rather than three code paths
 * that drift apart.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BarChart3, Bookmark, Maximize2, Minimize2, PanelLeft, Settings2, Trophy } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import type { StoredGame } from '@/lib/library';
import { useMenu } from '@/lib/desktop/menu';
import { setGameMenuEnabled, setMenuVisible } from '@/lib/desktop/menu';
import { Player } from './Player';
import { GamePanel } from './GamePanel';
import { LibraryPage } from './LibraryPage';
import { AchievementsPanel } from './AchievementsPanel';
import { AppSettings } from './AppSettings';
import { readScroll, saveScroll, useReadingKeys } from './useReadingKeys';
import { useAutosave } from './useAutosave';
import { setFace, setTheme, setZoom } from '@/lib/theme';

/** Below this the side panel would squeeze the reading measure, so it is hidden. */
const WIDE = '(min-width: 1100px)';
const SIDEBAR = { min: 180, max: 460, key: 'cs-sidebar-w' };
const INSPECTOR = { min: 220, max: 520, key: 'cs-inspector-w' };

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
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

const pane = () => document.querySelector('.app-reading');

/**
 * Keyboard paging, scroll memory and the rolling autosave. Headless, because
 * all three need the live engine state and the frame renders before there is
 * any engine.
 */
function ReadingKeys({ cs, gameId }: { cs: ChoiceScriptApi; gameId: string }) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);

  useReadingKeys({
    pane,
    canContinue: state.pending?.kind === 'next' && !state.overlay,
    onContinue: () => cs.next(),
  });

  useAutosave(cs, state.history, state.canSave);

  /* The engine's settings dialog is the other way these change. Mirroring them
     back is what lets the library page match the game the reader just left. */
  useEffect(() => {
    setTheme(state.theme.name);
    setZoom(state.theme.zoom);
    setFace(state.theme.typeface);
  }, [state.theme.name, state.theme.zoom, state.theme.typeface]);

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

function GameControls({
  cs,
  wide,
  panelOpen,
  onTogglePanel,
}: {
  cs: ChoiceScriptApi;
  /** Wide enough to dock the achievements panel beside the story. */
  wide: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
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
      {/* Always a dialog. The stats screen is a scene the reader may have to
          answer, and the engine cannot run one beside a live story. */}
      <button className="app-btn" onClick={() => cs.openStats()}>
        <BarChart3 className="size-3.5" aria-hidden />
        <span className="app-btn-label">Stats</span>
      </button>
      <button className="app-btn" onClick={() => cs.openSaves()}>
        <Bookmark className="size-3.5" aria-hidden />
        <span className="app-btn-label">Saves</span>
      </button>
      {/* Achievements are plain state, so they can dock. */}
      <button
        className="app-btn"
        aria-pressed={panelOpen}
        onClick={wide ? onTogglePanel : () => cs.openAchievements()}
      >
        <Trophy className="size-3.5" aria-hidden />
        <span className="app-btn-label">Achievements</span>
        {total > 0 && (
          <span className="app-badge">
            {earned}/{total}
          </span>
        )}
      </button>
      <button className="app-btn" onClick={() => cs.openSettings()}>
        <Settings2 className="size-3.5" aria-hidden />
        <span className="app-btn-label">Settings</span>
      </button>
    </>
  );
}

/**
 * A vertical grip, for either edge.
 *
 * `edge` decides which side it sits on and which direction widens the pane, so
 * the right-hand panel gets the same affordance as the left instead of being
 * fixed at 320px.
 */
function Resizer({
  edge,
  label,
  onWidth,
}: {
  edge: 'left' | 'right';
  label: string;
  onWidth: (px: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(true);
    const move = (e: PointerEvent) => onWidth(e.clientX);
    const stop = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <button
      className={edge === 'left' ? 'app-resizer' : 'app-resizer-right'}
      data-dragging={dragging}
      data-tauri-drag-region="false"
      aria-label={label}
      onPointerDown={start}
      /* Keyboard-reachable too: a mouse-only resize is not a resize for
         everyone. */
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onWidth(edge === 'left' ? -1 : -2);
        if (e.key === 'ArrowRight') onWidth(edge === 'left' ? -2 : -1);
      }}
    />
  );
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
  const [focus, setFocus] = useState(false);
  const [appSettings, setAppSettings] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR.key));
    return Number.isFinite(stored) && stored >= SIDEBAR.min ? stored : 260;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    const stored = Number(localStorage.getItem(INSPECTOR.key));
    return Number.isFinite(stored) && stored >= INSPECTOR.min ? stored : 320;
  });
  const wide = useMediaQuery(WIDE);
  const docked = inspector && wide && !focus && !!cs && !!game;

  /* Written to the DOM rather than passed down, so the resize costs one style
     recalculation instead of a React render per pointer move. */
  useEffect(() => {
    document.body.style.setProperty('--app-sidebar-w', `${width}px`);
    localStorage.setItem(SIDEBAR.key, String(width));
  }, [width]);

  useEffect(() => {
    document.body.style.setProperty('--app-inspector-w', `${rightWidth}px`);
    localStorage.setItem(INSPECTOR.key, String(rightWidth));
  }, [rightWidth]);

  /* The right pane grows leftwards, so the pointer's distance from the window's
     right edge is the width. */
  const resizeRight = useCallback((clientX: number) => {
    setRightWidth((current) => {
      const next =
        clientX === -1 ? current - 16 : clientX === -2 ? current + 16 : window.innerWidth - clientX;
      return Math.round(Math.min(INSPECTOR.max, Math.max(INSPECTOR.min, next)));
    });
  }, []);

  const resize = useCallback((clientX: number) => {
    setWidth((current) => {
      /* -1 and -2 are the keyboard nudges from the grip. */
      const next = clientX === -1 ? current - 16 : clientX === -2 ? current + 16 : clientX;
      return Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, next)));
    });
  }, []);

  /*
   * Focus mode takes the window fullscreen as well as hiding the panes. Hiding
   * them alone left the app the same size with the reading column stranded in
   * the middle of it, which is where the empty band came from.
   */
  useEffect(() => {
    void getCurrentWindow()
      .setFullscreen(focus)
      .catch(() => {
        /* a window manager that refuses still gets the panes hidden */
      });
    /* The menu bar is drawn by the window, not the page, so hiding it has to
       happen in Rust. On macOS the system menu hides itself in fullscreen. */
    void setMenuVisible(!focus);
  }, [focus]);

  /* Game-only menu items are disabled on the library page rather than left
     enabled and inert. */
  useEffect(() => {
    void setGameMenuEnabled(!!game && !!cs);
  }, [game, cs]);

  useMenu({
    'toggle-sidebar': () => setSidebar((on) => !on),
    'toggle-panel': () =>
      game && cs ? (wide ? setInspector((on) => !on) : cs.openAchievements()) : undefined,
    'toggle-focus': () => game && setFocus((on) => !on),
    library: () => (game ? onExit() : undefined),
    /* On the library page Settings means the app's settings, not a running
       game's — there is no game to restart or save. */
    settings: () => (game && cs ? undefined : setAppSettings(true)),
  });

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focus]);

  return (
    <div className="app-shell" data-focus={focus}>
      {game && !focus && sidebar && (
        <GamePanel game={game} cs={cs} onExit={onExit}>
          <Resizer edge="left" label="Resize the sidebar" onWidth={resize} />
        </GamePanel>
      )}

      <div className="app-main">
        <header className="app-titlebar" data-tauri-drag-region>
          {game && (
            <button
              className="app-btn"
              data-tauri-drag-region="false"
              aria-pressed={sidebar}
              aria-label="Toggle sidebar"
              onClick={() => setSidebar((on) => !on)}
            >
              <PanelLeft className="size-4" aria-hidden />
            </button>
          )}

          <h1 className="app-title" data-tauri-drag-region>
            <b>{game?.title ?? 'ChoiceScript Player'}</b>
            {game?.author && <span>{game.author}</span>}
          </h1>

          <div className="flex items-center gap-0.5" data-tauri-drag-region="false">
            {game && cs ? (
              <>
                <button
                  className="app-btn"
                  aria-pressed={focus}
                  aria-label="Focus mode"
                  title="Focus mode (Ctrl+Shift+F)"
                  onClick={() => setFocus((on) => !on)}
                >
                  <Maximize2 className="size-3.5" aria-hidden />
                </button>
                <GameControls
                  cs={cs}
                  wide={wide && !focus}
                  panelOpen={docked}
                  onTogglePanel={() => setInspector((on) => !on)}
                />
              </>
            ) : (
              <button className="app-btn" onClick={() => setAppSettings(true)}>
                <Settings2 className="size-3.5" aria-hidden />
                <span className="app-btn-label">Settings</span>
              </button>
            )}
          </div>
        </header>

        <div className="app-reading">
          {game && cs ? (
            <div className="app-measure">
              <ReadingKeys cs={cs} gameId={game.id} />
              <Player cs={cs} game={game} />
            </div>
          ) : (
            <LibraryPage onPlay={onPlay} />
          )}
        </div>
      </div>

      {docked && cs && (
        <AchievementsPanel cs={cs} onClose={() => setInspector(false)}>
          <Resizer edge="right" label="Resize the achievements panel" onWidth={resizeRight} />
        </AchievementsPanel>
      )}

      {/* Focus mode hides the titlebar, so this is the way out that does not
          require knowing about Escape. Faint until it is wanted. */}
      {focus && (
        <button
          className="app-btn app-focus-exit"
          onClick={() => setFocus(false)}
          aria-label="Leave focus mode"
          title="Leave focus mode (Escape)"
        >
          <Minimize2 className="size-4" aria-hidden />
        </button>
      )}

      {appSettings && <AppSettings onClose={() => setAppSettings(false)} />}
    </div>
  );
}
