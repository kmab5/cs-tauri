/**
 * Autosaves, three deep, oldest evicted.
 *
 * The engine has one restore point and it is overwritten constantly — the stats
 * screen alone rewrites it every time it runs (shell.js:79 uses the 'temp'
 * slot for exactly that reason). So a reader who walks into a bad ending has
 * nothing to step back to.
 *
 * This writes a real save slot at each screen instead, through the engine's own
 * `save()` so the entry appears in the saves list with proper metadata, and
 * then prunes its own slots back to three. The queue is a queue: the fourth
 * autosave evicts the first.
 *
 * Pruning reaches into `save_list` directly because the API has no delete —
 * `listSaves`, `save` and `load` are the whole of it. That is safe to do here
 * and nowhere else: this app owns the store implementation
 * (lib/desktop/store.ts), the format is one JSON array of slot ids
 * (util.js:361), and only slots this module created are ever touched.
 */
import { useEffect, useRef } from 'react';

import type { ChoiceScriptApi } from '@/lib/choicescript';

const KEEP = 3;
const PREFIX = 'Autosave';
/** Long enough that a reader clicking through fast writes one save, not five. */
const SETTLE = 900;

interface EngineStore {
  get(key: string, fn: (ok: boolean, value: string | null) => void): void;
  set(key: string, value: string, fn?: (ok: boolean) => void): void;
  remove(key: string, fn?: (ok: boolean) => void): void;
}

function store(): EngineStore | null {
  return (window as unknown as { store?: EngineStore }).store ?? null;
}

function read(key: string): Promise<string | null> {
  const s = store();
  if (!s) return Promise.resolve(null);
  return new Promise((resolve) => s.get(key, (_ok, value) => resolve(value)));
}

async function prune() {
  const s = store();
  if (!s) return;

  const raw = await read('save_list');
  if (!raw) return;
  let slots: string[];
  try {
    slots = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(slots)) return;

  /* Which of these are ours: read each slot's metadata and match the name we
     wrote. Nothing the player saved by hand is ever considered. */
  const mine: string[] = [];
  for (const slot of slots) {
    const meta = await read(`savemeta_${slot}`);
    if (meta && meta.includes(`"${PREFIX}`)) mine.push(slot);
  }
  if (mine.length <= KEEP) return;

  /* Slot ids are 'save' + a timestamp (saves.js:60), so lexical order is
     chronological order. */
  const evict = mine.sort().slice(0, mine.length - KEEP);
  const kept = slots.filter((slot) => !evict.includes(slot));

  s.set('save_list', JSON.stringify(kept));
  for (const slot of evict) {
    s.remove(`state${slot}`);
    s.remove(`savemeta_${slot}`);
  }
}

export function useAutosave(cs: ChoiceScriptApi, history: number, canSave: boolean) {
  const first = useRef(true);

  useEffect(() => {
    /* Not on the opening screen: there is nothing to come back to yet, and it
       would land in the list before the reader has done anything. */
    if (first.current) {
      first.current = false;
      return;
    }
    if (!canSave) return;

    const timer = setTimeout(() => {
      cs.save(`${PREFIX} — screen ${history}`, (ok) => {
        if (ok) void prune();
      });
    }, SETTLE);

    return () => clearTimeout(timer);
  }, [cs, history, canSave]);
}
