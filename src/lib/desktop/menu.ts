/**
 * Native menu events, delivered to whichever component owns the action.
 *
 * Rust emits one `menu` event carrying the item id; a single listener fans it
 * out here. Components register the ids they can handle, so the same actions
 * back both the menu bar and the on-screen controls with no second code path.
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

export type MenuId =
  | 'open-game'
  | 'library'
  | 'save'
  | 'restore'
  | 'restart'
  | 'achievements'
  | 'settings'
  | 'toggle-sidebar'
  | 'toggle-stats'
  | 'toggle-focus'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset';

type Handler = () => void;

const handlers = new Map<MenuId, Set<Handler>>();
let listening = false;

function start() {
  if (listening) return;
  listening = true;
  void listen<string>('menu', (event) => {
    for (const fn of handlers.get(event.payload as MenuId) ?? []) fn();
  });
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
