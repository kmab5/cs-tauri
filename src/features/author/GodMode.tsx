/**
 * God mode: the game's variables, edited like a diff.
 *
 * Nothing is written to the interpreter as you type. Edits collect as a draft,
 * the changed rows are marked, and **Apply** commits them — which is the
 * difference between inspecting a game and accidentally rewriting one. The
 * marking follows the convention everyone already knows from a diff:
 *
 *   amber  — altered, not yet applied
 *   green  — applied just now
 *   none   — unchanged
 *
 * One level of undo, because that is the mistake people actually make: apply,
 * see the story react, want it back. The snapshot is taken at apply time from
 * the values the interpreter held, so undo restores what *was* rather than what
 * the draft thought was there.
 *
 * Two views: **Sheet** is everything `choicescript_stats` uses, in the order it
 * uses it, labelled where the author labelled it. **All** is every variable and
 * temp in the game.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Check, Eye, EyeOff, Undo2, X } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import { getScenes } from '@/lib/db';
import {
  parseStatsScene,
  readSheet,
  readVars,
  writeVar,
  type GameVar,
  type StatsScene,
} from '@/lib/author/vars';
import { trace } from '@/lib/author/instrument';

type Status = 'none' | 'altered' | 'applied';
type VarType = 'any' | 'number' | 'boolean' | 'text';

const EMPTY: StatsScene = { labels: new Map(), referenced: [] };

const show = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : String(value);

/** Numbers the engine holds as strings count as numbers — most of them are. */
function typeOf(value: unknown): VarType {
  if (typeof value === 'boolean' || /^(true|false)$/i.test(String(value))) return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return 'number';
  }
  return 'text';
}

export function GodMode({
  cs,
  gameId,
  onClose,
  children,
}: {
  cs: ChoiceScriptApi;
  gameId: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const [scene, setScene] = useState<StatsScene>(EMPTY);
  const [view, setView] = useState<'sheet' | 'all'>('sheet');
  const [showInternal, setShowInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /* Plain search, then the advanced pane. */
  const [filter, setFilter] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [type, setType] = useState<VarType>('any');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState<'any' | 'stat' | 'temp'>('any');

  /* The draft, the last applied set, and the snapshot undo restores. */
  const [draft, setDraft] = useState<Map<string, string>>(new Map());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [undoable, setUndoable] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    void getScenes(gameId)
      .then((scenes) => {
        const stats = Object.entries(scenes).find(([name]) =>
          /^choicescript_stats$/i.test(name),
        )?.[1];
        setScene(stats ? parseStatsScene(stats) : EMPTY);
      })
      .catch(() => setScene(EMPTY));
  }, [gameId]);

  const vars = useMemo(
    () => (view === 'sheet' ? readSheet(scene) : readVars(scene.labels)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, view, state.history, tick],
  );

  const match = useCallback(
    (variable: GameVar) => {
      const haystack = `${variable.name} ${variable.label ?? ''}`;
      const needle = filter.trim();
      if (!needle) return true;
      if (!useRegex) {
        return caseSensitive
          ? haystack.includes(needle)
          : haystack.toLowerCase().includes(needle.toLowerCase());
      }
      try {
        return new RegExp(needle, caseSensitive ? '' : 'i').test(haystack);
      } catch {
        /* An unfinished regex matches nothing rather than throwing on a
           keystroke; the error line says so. */
        return false;
      }
    },
    [filter, useRegex, caseSensitive],
  );

  const regexError = useMemo(() => {
    if (!useRegex || !filter.trim()) return null;
    try {
      new RegExp(filter);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [useRegex, filter]);

  const shown = vars.filter(
    (v) =>
      (showInternal || !v.internal) &&
      (scope === 'any' || v.scope === scope) &&
      (type === 'any' || typeOf(v.value) === type) &&
      match(v),
  );

  const key = (v: GameVar) => `${v.scope}:${v.name}`;

  const statusOf = (v: GameVar): Status => {
    if (draft.has(key(v))) return 'altered';
    if (applied.has(key(v))) return 'applied';
    return 'none';
  };

  const edit = (v: GameVar, raw: string) => {
    setError(null);
    setDraft((current) => {
      const next = new Map(current);
      if (raw === show(v.value)) next.delete(key(v));
      else next.set(key(v), raw);
      return next;
    });
  };

  const apply = () => {
    const before = new Map<string, string>();
    const done = new Set<string>();
    try {
      for (const [id, raw] of draft) {
        const [varScope, name] = id.split(/:(.+)/) as ['stat' | 'temp', string];
        const existing = vars.find((v) => key(v) === id);
        before.set(id, show(existing?.value));
        const value = writeVar(name, varScope, raw);
        trace('note', `god mode: ${name} = ${JSON.stringify(value)}`);
        done.add(id);
      }
      setUndoable(before);
      setApplied(done);
      setDraft(new Map());
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
      /* Partial application is still application: what went in stays in, and
         the rest is left in the draft to fix. */
      setDraft((current) => new Map([...current].filter(([id]) => !done.has(id))));
      setApplied(done);
      setTick((t) => t + 1);
    }
  };

  const undo = () => {
    if (!undoable) return;
    setError(null);
    try {
      for (const [id, raw] of undoable) {
        const [varScope, name] = id.split(/:(.+)/) as ['stat' | 'temp', string];
        if (raw === '') continue;
        writeVar(name, varScope, raw);
      }
      trace('note', `god mode: undid ${undoable.size} change${undoable.size === 1 ? '' : 's'}`);
      setUndoable(null);
      setApplied(new Set());
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <aside className="app-inspector" aria-label="God mode">
      <div className="app-inspector-head">
        <span>God mode</span>
        <button className="app-btn" onClick={onClose} aria-label="Close god mode">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="god-controls">
        <div className="god-tabs" role="tablist" aria-label="Which variables">
          <button
            className="app-btn"
            role="tab"
            aria-selected={view === 'sheet'}
            aria-pressed={view === 'sheet'}
            onClick={() => setView('sheet')}
          >
            Sheet
          </button>
          <button
            className="app-btn"
            role="tab"
            aria-selected={view === 'all'}
            aria-pressed={view === 'all'}
            onClick={() => setView('all')}
          >
            All
          </button>
          {view === 'all' && (
            <button
              className="app-btn"
              aria-pressed={showInternal}
              title={showInternal ? 'Hide engine variables' : 'Show engine variables'}
              onClick={() => setShowInternal((v) => !v)}
            >
              {showInternal ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
            </button>
          )}
        </div>
        <input
          className="app-input"
          type="search"
          placeholder={useRegex ? 'Pattern' : 'Filter'}
          aria-label="Filter variables"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Collapsed by default: the plain filter answers most questions, and a
          row of switches above the list would cost more than it earns. */}
      <details className="god-advanced" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary>Advanced search</summary>
        <label>
          <span>Type</span>
          <select className="app-input" value={type} onChange={(e) => setType(e.target.value as VarType)}>
            <option value="any">Any</option>
            <option value="number">Number</option>
            <option value="boolean">True / false</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label>
          <span>Scope</span>
          <select
            className="app-input"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'any' | 'stat' | 'temp')}
          >
            <option value="any">Any</option>
            <option value="stat">Permanent</option>
            <option value="temp">Temporary</option>
          </select>
        </label>
        <label className="god-switch">
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          Regular expression
        </label>
        <label className="god-switch">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Case sensitive
        </label>
        {regexError && <p className="app-note">{regexError}</p>}
      </details>

      <div className="app-inspector-body">
        {error && (
          <p className="app-note mb-2" role="alert">
            {error}
          </p>
        )}

        {!shown.length ? (
          <p className="app-note">
            {view === 'sheet' && !scene.referenced.length
              ? 'This game has no choicescript_stats scene. Try All.'
              : 'Nothing matches.'}
          </p>
        ) : (
          <table className="god-table">
            <tbody>
              {shown.map((variable) => {
                const id = key(variable);
                const status = statusOf(variable);
                return (
                  <tr key={id} data-status={status} data-missing={!!variable.missing}>
                    <th scope="row">
                      <span className="god-name">{variable.label ?? variable.name}</span>
                      <code className="god-var">
                        {variable.name}
                        {variable.scope === 'temp' && <em> temp</em>}
                        {variable.missing && <em> not created</em>}
                      </code>
                    </th>
                    <td>
                      {variable.missing ? (
                        <span className="god-absent">—</span>
                      ) : typeOf(variable.value) === 'boolean' ? (
                        <button
                          className="app-btn god-bool"
                          aria-pressed={(draft.get(id) ?? show(variable.value)) === 'true'}
                          onClick={() =>
                            edit(
                              variable,
                              (draft.get(id) ?? show(variable.value)) === 'true' ? 'false' : 'true',
                            )
                          }
                        >
                          {draft.get(id) ?? show(variable.value)}
                        </button>
                      ) : (
                        <input
                          className="app-input god-value"
                          inputMode={typeOf(variable.value) === 'number' ? 'decimal' : 'text'}
                          value={draft.get(id) ?? show(variable.value)}
                          onChange={(e) => edit(variable, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') apply();
                            if (e.key === 'Escape') edit(variable, show(variable.value));
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* The commit bar. Present always, so the model is visible before anything
          has been typed: edits here are a draft until applied. */}
      <div className="god-commit">
        <span className="god-count">
          {draft.size
            ? `${draft.size} change${draft.size === 1 ? '' : 's'} pending`
            : applied.size
              ? `${applied.size} applied`
              : 'No changes'}
        </span>
        {undoable && !draft.size && (
          <button className="app-btn" onClick={undo} title="Undo the last apply">
            <Undo2 className="size-3.5" aria-hidden /> Undo
          </button>
        )}
        <button className="app-btn" disabled={!draft.size} onClick={() => setDraft(new Map())}>
          <X className="size-3.5" aria-hidden /> Cancel
        </button>
        <button className="app-btn app-btn-primary" disabled={!draft.size} onClick={apply}>
          <Check className="size-3.5" aria-hidden /> Apply
        </button>
      </div>
      {children}
    </aside>
  );
}
