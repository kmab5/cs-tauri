/**
 * The debug console.
 *
 * Every decision the interpreter made, in order: which way each `*if` went,
 * which label a `*goto` jumped to, which scene was entered or returned from,
 * which option the reader picked out of what, and what each `*set` left the
 * variable holding.
 *
 * Colour carries the kind, so a trace can be skimmed rather than read — and
 * because that is the whole point, the palette is drawn from the reading
 * theme's own tokens rather than hardcoded, so it stays legible in all six.
 *
 * Filters are subtractive and remembered: a `*if`-heavy game emits hundreds of
 * lines a screen, and the useful view is usually "everything except the `*if`s".
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Pause, Play, Trash2, X } from 'lucide-react';

import { clearTrace, getTrace, onTrace, type EventKind, type TraceEvent } from '@/lib/author/instrument';

const GROUPS: { id: EventKind[]; label: string }[] = [
  { id: ['if'], label: 'if' },
  { id: ['goto', 'gosub', 'return', 'scene'], label: 'flow' },
  { id: ['choice', 'pick'], label: 'choices' },
  { id: ['set', 'create', 'temp'], label: 'vars' },
  { id: ['achieve', 'note', 'error'], label: 'other' },
];

const FILTER_KEY = 'cs-console-filters';
const HEIGHT_KEY = 'cs-console-height';
const HEIGHT = { min: 90, max: 640 };

export function DebugConsole({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<TraceEvent[]>(getTrace);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const tail = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(() => {
    const stored = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= HEIGHT.min ? stored : 220;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(HEIGHT_KEY, String(height));
  }, [height]);

  /* The drawer grows upwards, so the pointer's distance from the bottom of the
     window is the height. */
  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    setCollapsed(false);
    setDragging(true);
    const move = (e: PointerEvent) =>
      setHeight(Math.round(Math.min(HEIGHT.max, Math.max(HEIGHT.min, window.innerHeight - e.clientY))));
    const stop = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  /**
   * Writes the trace to a file, because a trace that cannot leave the window is
   * no use in a bug report. Tab-separated: the fields are exactly the columns
   * on screen, and a spreadsheet or a grep both read it.
   */
  const exportLog = () => {
    const header = ['at', 'kind', 'where', 'text', 'detail'].join('\t');
    const rows = events.map((e) =>
      [new Date(e.at).toISOString(), e.kind, e.where ?? '', e.text, e.detail ?? '']
        .map((f) => String(f).replace(/[\t\n]/g, ' '))
        .join('\t'),
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trace-${new Date().toISOString().replace(/[:.]/g, '-')}.tsv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => onTrace((next) => !paused && setEvents(next)), [paused]);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify([...hidden]));
  }, [hidden]);

  /* Follow the tail, but only while it is already at the bottom: yanking the
     view down while someone is reading back through a trace is hostile. */
  useEffect(() => {
    const el = tail.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) el.scrollTo({ top: el.scrollHeight });
  }, [events]);

  const shown = events.filter((e) => !hidden.has(kindGroup(e.kind)));

  return (
    <section
      className="console"
      aria-label="Debug console"
      data-collapsed={collapsed}
      style={{ height: collapsed ? undefined : height }}
    >
      {/* The grip sits on the top edge, where the drawer grows from. */}
      {!collapsed && (
        <button
          className="console-grip"
          data-dragging={dragging}
          aria-label="Resize the console"
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') setHeight((h) => Math.min(HEIGHT.max, h + 24));
            if (e.key === 'ArrowDown') setHeight((h) => Math.max(HEIGHT.min, h - 24));
          }}
        />
      )}

      <header className="console-head">
        <button
          className="app-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand the console' : 'Collapse the console'}
        >
          {collapsed ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </button>
        <span className="console-title">Trace</span>

        {GROUPS.map((group) => {
          const off = hidden.has(group.label);
          return (
            <button
              key={group.label}
              className="app-btn console-filter"
              aria-pressed={!off}
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (off) next.delete(group.label);
                  else next.add(group.label);
                  return next;
                })
              }
            >
              {group.label}
            </button>
          );
        })}

        <span className="console-count">{shown.length}</span>

        <button
          className="app-btn"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        </button>
        <button className="app-btn" onClick={exportLog} title="Export the trace as TSV">
          <Download className="size-3.5" aria-hidden />
        </button>
        <button
          className="app-btn"
          onClick={() => {
            clearTrace();
            setEvents([]);
          }}
          title="Clear"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
        <button className="app-btn" onClick={onClose} aria-label="Close the console">
          <X className="size-3.5" aria-hidden />
        </button>
      </header>

      {!collapsed && (
      <div className="console-body" ref={tail} role="log" aria-live="off">
        {!shown.length ? (
          <p className="console-empty">
            Nothing traced yet. Play a screen — every <code>*if</code>, <code>*goto</code> and{' '}
            <code>*set</code> the interpreter runs appears here.
          </p>
        ) : (
          shown.map((event) => (
            <div className="console-line" key={event.id} data-kind={event.kind}>
              <span className="console-kind">{event.kind}</span>
              {event.where && <span className="console-where">{event.where}</span>}
              <span className="console-text">{event.text}</span>
              {event.detail && <span className="console-detail">{event.detail}</span>}
            </div>
          ))
        )}
      </div>
      )}
    </section>
  );
}

function kindGroup(kind: EventKind): string {
  return GROUPS.find((g) => g.id.includes(kind))?.label ?? 'other';
}
