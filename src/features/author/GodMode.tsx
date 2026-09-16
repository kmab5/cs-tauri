/**
 * God mode: the game's variables, editable.
 *
 * Two views, because "the stats the author put on the sheet" and "every
 * variable in the game" are different questions and both get asked:
 *
 *  - **Sheet** — the rows of `*stat_chart` in `choicescript_stats.txt`, with
 *    the author's display label beside the variable name, in the author's own
 *    order. This is the character sheet as designed.
 *  - **All** — every permanent variable and every temp, with the engine's own
 *    bookkeeping behind a toggle: a list with `choice_reuse` and `_looplimit`
 *    in it buries the ten variables that matter.
 *
 * Writes go straight into the interpreter's own objects and keep the variable's
 * existing type, so `*if strength > 50` still means what the author wrote.
 * Values refresh on every screen, because the story is also writing to them.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';
import { getScenes } from '@/lib/db';
import { parseStatChart, readSheet, readVars, writeVar, type GameVar } from '@/lib/author/vars';
import { trace } from '@/lib/author/instrument';

function Value({ variable, onEdit }: { variable: GameVar; onEdit: (raw: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof variable.value === 'string' ? variable.value : String(variable.value));

  if (typeof variable.value === 'boolean' || /^(true|false)$/i.test(String(variable.value))) {
    return (
      <button
        className="app-btn god-bool"
        aria-pressed={String(variable.value) === 'true'}
        onClick={() => onEdit(String(String(variable.value) !== 'true'))}
      >
        {String(variable.value)}
      </button>
    );
  }

  return (
    <input
      className="app-input god-value"
      /* Numeric whether the engine is holding it as a number or as a numeric
         string, which it usually is. */
      inputMode={
        typeof variable.value === 'number' ||
        (typeof variable.value === 'string' && Number.isFinite(Number(variable.value)))
          ? 'decimal'
          : 'text'
      }
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== String(variable.value)) onEdit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
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
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [view, setView] = useState<'sheet' | 'all'>('sheet');
  const [showInternal, setShowInternal] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  /* The labels come from the stats scene on disk rather than from the engine:
     *stat_chart rows are parsed by the interpreter as it renders them, and this
     panel has to know them before the reader has opened the sheet. */
  useEffect(() => {
    void getScenes(gameId)
      .then((scenes) => {
        const stats = Object.entries(scenes).find(([name]) =>
          /^choicescript_stats$/i.test(name),
        )?.[1];
        setLabels(stats ? parseStatChart(stats) : new Map());
      })
      .catch(() => setLabels(new Map()));
  }, [gameId]);

  const vars = useMemo(
    () => (view === 'sheet' ? readSheet(labels) : readVars(labels)),
    /* state.history and tick are the refresh triggers: the story writes to
       these objects too, and a stale sheet is worse than none. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, view, state.history, tick],
  );

  const shown = vars.filter(
    (v) =>
      (showInternal || !v.internal) &&
      `${v.name} ${v.label ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const edit = useCallback((variable: GameVar, raw: string) => {
    try {
      const value = writeVar(variable.name, variable.scope, raw);
      trace('note', `god mode: ${variable.name} = ${JSON.stringify(value)}`);
      setError(null);
      setTick((t) => t + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

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
          placeholder="Filter"
          aria-label="Filter variables"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="app-inspector-body">
        {error && (
          <p className="app-note mb-2" role="alert">
            {error}
          </p>
        )}

        {!shown.length ? (
          <p className="app-note">
            {view === 'sheet'
              ? 'This game declares no *stat_chart, so there is no sheet to show. Try All.'
              : 'No variables match.'}
          </p>
        ) : (
          <table className="god-table">
            <tbody>
              {shown.map((variable) => (
                <tr key={`${variable.scope}:${variable.name}`}>
                  <th scope="row">
                    <span className="god-name">{variable.label ?? variable.name}</span>
                    {/* Both names, always: the author's label is what the sheet
                        shows, the variable name is what *if reads. */}
                    <code className="god-var">
                      {variable.name}
                      {variable.scope === 'temp' && <em> temp</em>}
                    </code>
                  </th>
                  <td>
                    <Value variable={variable} onEdit={(raw) => edit(variable, raw)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="app-note mt-3">
          Changes apply immediately and show on the next screen the story draws.
        </p>
      </div>
      {children}
    </aside>
  );
}
