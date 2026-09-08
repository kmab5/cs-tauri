/**
 * The sidebar, while a game is open.
 *
 * Two panes with a draggable divider: what this game is on top, its saves
 * underneath. Either can be collapsed to just its header — which is why the
 * headers stay when collapsed, since that is what you click to bring one back.
 *
 * The list of *other* games is deliberately not here. The engine holds one game
 * at a time and cannot be re-pointed in place, so a list would only offer a
 * choice that costs a reload, and it would sit one stray click from a reader's
 * place in a ten-hour story. The way back to the shelf is explicit instead.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Share2 } from 'lucide-react';

import type { ChoiceScriptApi, SaveRecord } from '@/lib/choicescript';
import { exportGame, loadIcon, type StoredGame } from '@/lib/library';

const SPLIT_KEY = 'cs-sidebar-split';
type Collapsed = 'none' | 'top' | 'bottom';

function relative(at: unknown): string {
  const ms = Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toLocaleDateString();
}

function Pane({
  title,
  collapsed,
  onToggle,
  toggleLabel,
  grow,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleLabel: string;
  grow: number;
  children: React.ReactNode;
}) {
  return (
    <section className="app-pane" data-collapsed={collapsed} style={{ flexGrow: grow }}>
      <h2 className="app-pane-head">
        <span>{title}</span>
        <button className="app-btn" onClick={onToggle} aria-label={toggleLabel} title={toggleLabel}>
          {collapsed ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronUp className="size-3.5" aria-hidden />
          )}
        </button>
      </h2>
      {!collapsed && <div className="app-pane-body">{children}</div>}
    </section>
  );
}

export function GamePanel({
  game,
  cs,
  onExit,
  children,
}: {
  game: StoredGame;
  cs: ChoiceScriptApi | null;
  onExit: () => void;
  /** The width grip, which has to live inside the panel it resizes. */
  children?: React.ReactNode;
}) {
  const [cover, setCover] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Collapsed>('none');
  const [split, setSplit] = useState(() => {
    const stored = Number(localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(stored) && stored > 0.15 && stored < 0.85 ? stored : 0.5;
  });
  const [dragging, setDragging] = useState(false);
  const panes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadIcon(game).then((url) => live && setCover(url));
    return () => {
      live = false;
    };
  }, [game]);

  useEffect(() => {
    localStorage.setItem(SPLIT_KEY, String(split));
  }, [split]);

  /** Ratio of the pane stack, from the pointer's position within it. */
  const drag = useCallback((clientY: number) => {
    const box = panes.current?.getBoundingClientRect();
    if (!box || box.height < 80) return;
    setSplit(Math.min(0.85, Math.max(0.15, (clientY - box.top) / box.height)));
  }, []);

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    /* Dragging the divider means neither pane is collapsed any more. */
    setCollapsed('none');
    setDragging(true);
    const move = (e: PointerEvent) => drag(e.clientY);
    const stop = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

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

      <div className="app-panes" ref={panes} data-dragging={dragging}>
        <Pane
          title="This game"
          collapsed={collapsed === 'top'}
          onToggle={() => setCollapsed((c) => (c === 'top' ? 'none' : 'top'))}
          toggleLabel={collapsed === 'top' ? 'Show details' : 'Collapse details'}
          grow={collapsed === 'bottom' ? 1 : split}
        >
          {cover && <img className="app-detail-cover" src={cover} alt="" />}
          <h3 className="app-detail-title">{game.title}</h3>
          <p className="app-detail-by">{game.author || 'Unknown author'}</p>
          {cs ? <Facts cs={cs} game={game} /> : null}
          <Export game={game} />
        </Pane>

        {collapsed === 'none' && (
          <button
            className="app-vsplit"
            data-dragging={dragging}
            data-tauri-drag-region="false"
            aria-label="Resize the panels"
            onPointerDown={startDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') setSplit((v) => Math.max(0.15, v - 0.05));
              if (e.key === 'ArrowDown') setSplit((v) => Math.min(0.85, v + 0.05));
            }}
          />
        )}

        <Pane
          title="Saves"
          collapsed={collapsed === 'bottom'}
          onToggle={() => setCollapsed((c) => (c === 'bottom' ? 'none' : 'bottom'))}
          toggleLabel={collapsed === 'bottom' ? 'Show saves' : 'Collapse saves'}
          grow={collapsed === 'top' ? 1 : 1 - split}
        >
          {cs ? <Saves cs={cs} /> : <p className="app-note">Loading the game…</p>}
        </Pane>
      </div>

      {children}
    </aside>
  );
}

/**
 * The facts, as tiles.
 *
 * Six labelled rows of small grey text all read at the same weight, so nothing
 * stood out and the numbers — the part a reader actually glances at — were the
 * least visible thing in the panel. Number first, at size, label under it.
 * Split out from the panel so the panel can render before the engine loads.
 */
function Facts({ cs, game }: { cs: ChoiceScriptApi; game: StoredGame }) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const total = state.achievements?.total ?? game.achievements.length;
  const earned = state.achievements?.earned.length ?? 0;
  const score = state.achievements?.score ?? 0;
  const totalScore = state.achievements?.totalScore ?? 0;

  return (
    <div className="app-facts">
      <span className="app-fact">
        <b>{state.history}</b>
        <span>Screens</span>
      </span>
      <span className="app-fact">
        <b>{game.sceneList.length || game.scenes.length}</b>
        <span>Scenes</span>
      </span>
      {total > 0 && (
        <span className="app-fact">
          <b>
            {earned}
            <small>/{total}</small>
          </b>
          <span>Awards</span>
        </span>
      )}
      {totalScore > 0 && (
        <span className="app-fact">
          <b>
            {score}
            <small>/{totalScore}</small>
          </b>
          <span>Points</span>
        </span>
      )}
      <span className="app-fact app-fact-wide">
        <b>{new Date(game.uploadedAt).toLocaleDateString()}</b>
        <span>Added to library</span>
      </span>
    </div>
  );
}

/** Exports the game together with this reader's saves and achievements. */
function Export({ game }: { game: StoredGame }) {
  const [where, setWhere] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        className="app-btn w-full"
        onClick={() => {
          setError(null);
          exportGame(game.id).then(setWhere, (e: Error) => setError(e.message));
        }}
      >
        <Share2 className="size-3.5" aria-hidden />
        <span className="app-btn-label">Export with saves</span>
      </button>
      {where && <p className="app-note mt-1">Written to {where}</p>}
      {error && <p className="app-note mt-1">{error}</p>}
    </div>
  );
}

/**
 * Save and load, in the sidebar.
 *
 * Loading takes two clicks. It discards everything since that save, and one
 * stray click is not an acceptable price for that in a story measured in hours.
 * Autosaves are marked, because they arrive without anybody asking.
 */
function Saves({ cs }: { cs: ChoiceScriptApi }) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const [saves, setSaves] = useState<SaveRecord[] | null>(null);
  const [name, setName] = useState('');
  const [armed, setArmed] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /* listSaves returns the chainable api, which useEffect would mistake for a
     cleanup function, so it is discarded explicitly. */
  const refresh = useCallback(() => {
    cs.listSaves(setSaves);
  }, [cs]);

  /* Re-read as the story moves: the rolling autosave writes behind the scenes
     and a stale list would hide it. */
  useEffect(refresh, [refresh, state.history]);

  return (
    <div>
      <div className="app-save-form">
        <label className="sr-only" htmlFor="sidebar-save-name">
          Name this save
        </label>
        <input
          id="sidebar-save-name"
          className="app-input"
          placeholder="Name this save"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="app-btn app-btn-primary"
          disabled={!state.canSave}
          onClick={() =>
            cs.save(name.trim() || 'Save', (ok, reason) => {
              setMessage(ok ? 'Saved.' : (reason ?? 'Could not save.'));
              if (ok) setName('');
              refresh();
            })
          }
        >
          Save
        </button>
      </div>

      {message && <p className="app-note mb-2">{message}</p>}

      {saves === null ? (
        <div aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="app-skeleton mb-1.5 h-8" />
          ))}
        </div>
      ) : !saves.length ? (
        <p className="app-note">No saves yet. The story autosaves as you read.</p>
      ) : (
        saves.map((save, i) => {
          const auto = /^Autosave/.test(String(save.name ?? ''));
          return (
            <button
              key={i}
              className="app-save"
              data-armed={armed === i}
              onClick={() => (armed === i ? cs.load(save) : setArmed(i))}
              onBlur={() => setArmed(null)}
            >
              <span className="app-save-name">
                {armed === i ? 'Load this save?' : save.name || 'Untitled save'}
              </span>
              <span className={auto ? 'app-save-meta app-save-auto' : 'app-save-meta'}>
                {auto ? 'autosave · ' : ''}
                {relative(save.savedAt ?? save.timestamp)}
                {save.line !== undefined ? ` · line ${Number(save.line) + 1}` : ''}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
