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
import { Pause, Play, Trash2, X } from 'lucide-react';

import { clearTrace, getTrace, onTrace, type EventKind, type TraceEvent } from '@/lib/author/instrument';

const GROUPS: { id: EventKind[]; label: string }[] = [
  { id: ['if'], label: 'if' },
  { id: ['goto', 'gosub', 'return', 'scene'], label: 'flow' },
  { id: ['choice', 'pick'], label: 'choices' },
  { id: ['set', 'create', 'temp'], label: 'vars' },
  { id: ['achieve', 'note', 'error'], label: 'other' },
];

const FILTER_KEY = 'cs-console-filters';

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
    <section className="console" aria-label="Debug console">
      <header className="console-head">
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
    </section>
  );
}

function kindGroup(kind: EventKind): string {
  return GROUPS.find((g) => g.id.includes(kind))?.label ?? 'other';
}
