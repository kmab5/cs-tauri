/**
 * The app's own context menus.
 *
 * WebView2 and WKWebView bring a browser's right-click menu — reload, save as,
 * print, view source, inspect — which is the same category of nonsense as the
 * browser keyboard shortcuts, and more visible. It is suppressed everywhere and
 * replaced with menus that belong to whatever was clicked.
 *
 * One exception, deliberately: **editable fields keep an edit menu.** Killing
 * the native menu takes cut, copy and paste with it, and a text field without
 * those is broken in a way people notice immediately. Those items go through
 * the clipboard API rather than `execCommand`.
 *
 * Regions register their own items through `useContextMenu`. An item can be
 * disabled or omitted; omitted is better, for the same reason a standalone
 * build has no "Back to Library" — a menu full of greyed-out entries describes
 * an app that cannot do what it is showing you.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  /** Shown right-aligned, e.g. `⌘S`. Display only. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

/** A separator between groups. */
export const DIVIDER = null;
export type MenuEntry = MenuItem | null;

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

const Ctx = createContext<(e: React.MouseEvent | MouseEvent, entries: MenuEntry[]) => void>(
  () => {},
);

/** Hands back an onContextMenu handler for a region. */
export function useContextMenu(entries: () => MenuEntry[]) {
  const open = useContext(Ctx);
  return useCallback(
    (event: React.MouseEvent) => {
      const items = entries().filter(Boolean).length ? entries() : [];
      if (!items.length) return;
      event.preventDefault();
      event.stopPropagation();
      open(event, items);
    },
    [entries, open],
  );
}

function editEntries(target: HTMLInputElement | HTMLTextAreaElement): MenuEntry[] {
  const selection = target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
  const write = (text: string) => void navigator.clipboard?.writeText(text).catch(() => {});
  return [
    {
      label: 'Cut',
      hint: '⌘X',
      disabled: !selection || target.readOnly,
      run: () => {
        write(selection);
        const start = target.selectionStart ?? 0;
        target.setRangeText('', start, target.selectionEnd ?? 0, 'end');
        target.dispatchEvent(new Event('input', { bubbles: true }));
      },
    },
    { label: 'Copy', hint: '⌘C', disabled: !selection, run: () => write(selection) },
    {
      label: 'Paste',
      hint: '⌘V',
      disabled: target.readOnly,
      run: () => {
        void navigator.clipboard?.readText().then((text) => {
          target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        });
      },
    },
    DIVIDER,
    { label: 'Select all', hint: '⌘A', run: () => target.select() },
  ];
}

/** For a menu whose items depend on what was clicked, not just where. */
export function useContextMenuOpener() {
  return useContext(Ctx);
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const open = useCallback((event: React.MouseEvent | MouseEvent, entries: MenuEntry[]) => {
    setMenu({ x: event.clientX, y: event.clientY, entries });
    setActive(entries.findIndex((e) => e && !e.disabled));
  }, []);

  /*
   * The catch-all. Anything that did not handle its own right-click gets either
   * the edit menu, if it is a field, or nothing — and nothing still means the
   * browser's menu is suppressed.
   */
  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      const field = target?.closest('input, textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (field && !/^(checkbox|radio|range|file|button|submit)$/.test((field as HTMLInputElement).type ?? '')) {
        open(event, editEntries(field));
        return;
      }
      /* A text selection anywhere else can at least be copied. */
      const selected = window.getSelection()?.toString();
      if (selected) {
        open(event, [
          {
            label: 'Copy',
            hint: '⌘C',
            run: () => void navigator.clipboard?.writeText(selected).catch(() => {}),
          },
        ]);
      }
    };
    document.addEventListener('contextmenu', onContext);
    return () => document.removeEventListener('contextmenu', onContext);
  }, [open]);

  /* Dismissal: anywhere else, Escape, scroll, or the window losing focus. */
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      const items = menu.entries;
      if (e.key === 'Escape') return close();
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
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu, active]);

  /* Flip rather than overflow: a menu opened near an edge opens inwards. */
  useEffect(() => {
    const el = box.current;
    if (!el || !menu) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const y = Math.min(menu.y, window.innerHeight - rect.height - 8);
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }, [menu]);

  return (
    <Ctx.Provider value={open}>
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
    </Ctx.Provider>
  );
}
