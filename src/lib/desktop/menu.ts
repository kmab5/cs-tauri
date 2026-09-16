/**
 * Native menu events, delivered to whichever component owns the action.
 *
 * Rust emits one `menu` event carrying the item id; a single listener fans it
 * out here. Components register the ids they can handle, so the same actions
 * back both the menu bar and the on-screen controls with no second code path.
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export type MenuId =
  | 'open-game'
  | 'library'
  | 'save'
  | 'restore'
  | 'restart'
  | 'achievements'
  | 'settings'
  | 'toggle-sidebar'
  | 'toggle-panel'
  | 'palette'
  | 'stats'
  | 'toggle-focus'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset';

type Handler = () => void;

const handlers = new Map<MenuId, Set<Handler>>();
let listening = false;

/**
 * The same ids, from the keyboard.
 *
 * Native accelerators alone were not enough: a menu that fails to build takes
 * every one of its shortcuts with it silently, and a webview can swallow
 * combinations before the menu ever sees them. Handling the keys here as well
 * means the shortcuts work whether or not the native menu is behaving, and
 * both routes end at the same handler.
 */
const KEYS: Record<string, MenuId> = {
  'mod+o': 'open-game',
  'mod+shift+l': 'library',
  'mod+s': 'save',
  'mod+l': 'restore',
  'mod+shift+r': 'restart',
  'mod+shift+a': 'achievements',
  'mod+shift+s': 'stats',
  'mod+,': 'settings',
  'mod+\\': 'toggle-sidebar',
  'mod+i': 'toggle-panel',
  'mod+k': 'palette',
  'mod+shift+f': 'toggle-focus',
  'mod+=': 'zoom-in',
  'mod++': 'zoom-in',
  'mod+-': 'zoom-out',
  'mod+0': 'zoom-reset',
};

function fire(id: MenuId) {
  const bound = handlers.get(id);
  if (!bound?.size) return false;
  for (const fn of bound) fn();
  return true;
}

function combo(e: KeyboardEvent): string | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return `mod+${e.shiftKey ? 'shift+' : ''}${key}`;
}

function start() {
  if (listening) return;
  listening = true;

  void listen<string>('menu', (event) => {
    fire(event.payload as MenuId);
  });

  document.addEventListener(
    'keydown',
    (e) => {
      const key = combo(e);
      const id = key && KEYS[key];
      if (!id) return;
      /* Only swallow the key if something was actually listening for it —
         otherwise Ctrl+S on the library page would block nothing and do
         nothing, which reads as a broken shortcut. */
      if (fire(id)) e.preventDefault();
    },
    true,
  );
}

/**
 * Grey out the game-only items when no game is open.
 *
 * Leaving Save and Restart enabled on the library page offered actions that
 * could not work; the menu is the one place a reader looks to find out what is
 * possible right now.
 */
/**
 * Hide the whole menu bar for focus mode.
 *
 * It is part of the window rather than the page, so CSS cannot reach it. On
 * macOS the system menu bar hides itself in fullscreen and this is a no-op.
 */
export async function setMenuVisible(visible: boolean): Promise<void> {
  try {
    await invoke('set_menu_visible', { visible });
  } catch {
    /* nothing to do: the menu simply stays where it is */
  }
}

export async function setGameMenuEnabled(enabled: boolean): Promise<void> {
  try {
    await invoke('set_game_menu_enabled', { enabled });
  } catch {
    /* an older build without the command simply keeps them enabled */
  }
}

/**
 * Bind menu ids to actions for as long as the component is mounted.
 *
 * The map is read through a ref, so a component can pass a fresh object every
 * render — which it will, since these close over current state — without
 * resubscribing.
 */
export function useMenu(map: Partial<Record<MenuId, Handler>>) {
  const latest = useRef(map);
  latest.current = map;

  useEffect(() => {
    start();

    const ids = Object.keys(latest.current) as MenuId[];
    const bound = ids.map((id) => {
      const fn: Handler = () => latest.current[id]?.();
      if (!handlers.has(id)) handlers.set(id, new Set());
      handlers.get(id)!.add(fn);
      return [id, fn] as const;
    });

    return () => {
      for (const [id, fn] of bound) handlers.get(id)?.delete(fn);
    };
    // Ids are stable for a given component; the actions are read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(map).join(',')]);
}
