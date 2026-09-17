/**
 * The app's own context menus.
 *
 * Rewritten after the first version did nothing in the real app while passing
 * in the harness. That version hung a React `onContextMenu` on each region and
 * relied on it running before a document-level fallback — synthetic event
 * ordering, `stopPropagation`, and a closure per render, three things that can
 * each break it silently and two of which a jsdom test will not notice.
 *
 * So there is no per-region handler now. One capture-phase listener on the
 * document handles every right-click, finds the nearest ancestor carrying a
 * `data-menu` name, and looks that name up in a registry components write to
 * with `useMenuRegion`. Nothing depends on event order, nothing captures stale
 * state, and a region that has not registered still gets a sensible menu rather
 * than the webview's.
 *
 * Editable fields keep cut, copy, paste and select all, because suppressing the
 * native menu takes those with it and a text field without them is broken in a
 * way people notice immediately.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  /** Shown right-aligned, e.g. `⌘S`. Display only. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

export const DIVIDER = null;
export type MenuEntry = MenuItem | null;

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/**
 * Region name to the items it offers, as a live registry.
 *
 * Module scope rather than context state on purpose: the listener reads it at
 * the moment of the click, so it always sees the current builders, and
 * registering one does not re-render anything.
 */
const regions = new Map<string, () => MenuEntry[]>();

/** Fallback, so a right-click anywhere does something rather than nothing. */
let appFallback: () => MenuEntry[] = () => [];

export function setAppMenu(build: () => MenuEntry[]) {
  appFallback = build;
}

/**
 * Registers a region's menu and hands back the prop that names it.
 *
 * `{...useMenuRegion('shelf', build)}` puts `data-menu="shelf"` on the element;
 * the document listener does the rest.
 */
export function useMenuRegion(name: string, build: () => MenuEntry[]) {
  const latest = useRef(build);
  latest.current = build;

  useEffect(() => {
    regions.set(name, () => latest.current());
    return () => {
      regions.delete(name);
    };
  }, [name]);

  return { 'data-menu': name } as const;
}

const OpenCtx = createContext<(x: number, y: number, entries: MenuEntry[]) => void>(() => {});

/** For a menu whose items depend on which item was clicked. */
export function useContextMenuOpener() {
  return useContext(OpenCtx);
}

function editEntries(target: HTMLInputElement | HTMLTextAreaElement): MenuEntry[] {
  const selection = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
  const write = (text: string) => void navigator.clipboard?.writeText(text).catch(() => {});
  const fire = () => target.dispatchEvent(new Event('input', { bubbles: true }));
  return [
    {
      label: 'Cut',
      hint: '⌘X',
      disabled: !selection || target.readOnly,
      run: () => {
        write(selection);
        target.setRangeText('', target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end');
        fire();
      },
    },
    { label: 'Copy', hint: '⌘C', disabled: !selection, run: () => write(selection) },
    {
      label: 'Paste',
      hint: '⌘V',
      disabled: target.readOnly,
      run: () =>
        void navigator.clipboard?.readText().then((text) => {
          target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end');
          fire();
        }),
    },
    DIVIDER,
    { label: 'Select all', hint: '⌘A', run: () => target.select() },
  ];
}

const live = (entries: MenuEntry[]) => entries.filter((e) => e !== null).length > 0;

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const open = (x: number, y: number, entries: MenuEntry[]) => {
    setMenu({ x, y, entries });
    setActive(entries.findIndex((e) => e && !e.disabled));
  };

  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      /* Always: the webview's own menu is never the right answer here. */
      event.preventDefault();

      const target = event.target as HTMLElement | null;

      /* A field's own menu comes first — losing paste is worse than any
         region menu is worth. */
      const field = target?.closest('input, textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (field && !/^(checkbox|radio|range|file|button|submit|search)$/.test(field.type ?? '')) {
        open(event.clientX, event.clientY, editEntries(field));
        return;
      }

      /* Then the nearest registered region, walking outwards. */
      let node: HTMLElement | null = target?.closest('[data-menu]') ?? null;
      while (node) {
        const build = regions.get(node.dataset.menu ?? '');
        const entries = build?.() ?? [];
        if (live(entries)) {
          open(event.clientX, event.clientY, entries);
          return;
        }
        node = node.parentElement?.closest('[data-menu]') ?? null;
      }

      /* Then a selection, then the app's own menu. Never nothing. */
      const selected = window.getSelection()?.toString().trim();
      const entries: MenuEntry[] = [];
      if (selected) {
        entries.push({
          label: 'Copy',
          hint: '⌘C',
          run: () => void navigator.clipboard?.writeText(selected).catch(() => {}),
        });
        entries.push(DIVIDER);
      }
      entries.push(...appFallback());
      if (live(entries)) open(event.clientX, event.clientY, entries);
    };

    /* Capture, so nothing downstream can swallow it first. */
    document.addEventListener('contextmenu', onContext, true);
    return () => document.removeEventListener('contextmenu', onContext, true);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      const items = menu.entries;
      if (e.key === 'Escape') {
        e.preventDefault();
        return close();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        let next = active;
        for (let i = 0; i < items.length; i++) {
          next = (next + step + items.length) % items.length;
          if (items[next] && !items[next]!.disabled) break;
        }
        setActive(next);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[active];
        if (item && !item.disabled) {
          close();
          item.run();
        }
      }
    };
    /* pointerdown would fire for the same right-click that opened it in some
       webviews, so dismissal waits for the next click instead. */
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu, active]);

  /* Opened near an edge, it opens inwards rather than overflowing. */
  useEffect(() => {
    const el = box.current;
    if (!el || !menu) return;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
  }, [menu]);

  return (
    <OpenCtx.Provider value={open}>
      {children}
      {menu && (
        <div
          className="ctx"
          ref={box}
          role="menu"
          aria-label="Context menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.entries.map((entry, i) =>
            entry ? (
              <button
                key={i}
                role="menuitem"
                className="ctx-item"
                data-active={i === active}
                data-danger={!!entry.danger}
                disabled={entry.disabled}
                onMouseMove={() => setActive(i)}
                onClick={() => {
                  setMenu(null);
                  entry.run();
                }}
              >
                <span>{entry.label}</span>
                {entry.hint && <kbd>{entry.hint}</kbd>}
              </button>
            ) : (
              <hr key={i} className="ctx-divider" />
            ),
          )}
        </div>
      )}
    </OpenCtx.Provider>
  );
}
