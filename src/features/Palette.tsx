/**
 * The command palette. ⌘K / Ctrl+K.
 *
 * Everything the app can do right now, searchable, in one place. The
 * alternative — and what was here — is eight controls in a titlebar, a menu bar
 * and a set of accelerators a reader learns from a README. A palette is the
 * difference between an app that *has* shortcuts and one that is keyboard-first.
 *
 * Radix underneath, so the focus trap, Escape, scroll lock and `aria-modal`
 * come along rather than being reimplemented badly. Only the list behaviour is
 * ours: arrow keys move a selection that is independent of the pointer, Enter
 * runs it, and the filter is a plain substring match on the label — fuzzy
 * matching sounds clever and makes the ordering unpredictable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Shown right-aligned, e.g. `⌘S`. Display only; the binding lives elsewhere. */
  hint?: string;
  run: () => void;
}

const MOD = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

/** Renders a hint written as `mod+shift+f` into the platform's own notation. */
export function keyHint(combo: string): string {
  return combo
    .split('+')
    .map((part) =>
      part === 'mod' ? MOD : part === 'shift' ? '⇧' : part.length === 1 ? part.toUpperCase() : part,
    )
    .join(MOD === '⌘' ? '' : '+');
}

export function Palette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q));
  }, [commands, query]);

  /* A new query means a new list; keeping the old index would leave the
     selection somewhere the reader is not looking. */
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  /* Keep the selected row in view when it moves by keyboard. */
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="pal-scrim" />
        <DialogPrimitive.Content className="pal" aria-label="Command palette">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>

          <input
            className="pal-input"
            autoFocus
            placeholder="Search commands…"
            aria-label="Search commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(shown.length - 1, i + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                run(shown[active]);
              }
            }}
          />

          <div className="pal-list" ref={list}>
            {!shown.length && <p className="pal-empty">Nothing matches “{query}”.</p>}
            {shown.map((command, i) => {
              const first = i === 0 || shown[i - 1].group !== command.group;
              return (
                <div key={command.id}>
                  {first && <div className="pal-group">{command.group}</div>}
                  <button
                    className="pal-item"
                    data-active={i === active}
                    /* Hovering moves the selection so pointer and keyboard
                       never disagree about which row Enter would run. */
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(command)}
                  >
                    <span className="pal-item-label">{command.label}</span>
                    {command.hint && <kbd>{command.hint}</kbd>}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pal-foot">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>↵</kbd> run
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
