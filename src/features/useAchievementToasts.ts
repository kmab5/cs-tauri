/**
 * Surface achievements as they unlock.
 *
 * `*achieve` fires 330 times across the five sample games and previously
 * showed nothing at all in this front end: the player earned something and the
 * interface stayed silent. PRODUCT.md's sharpest anti-reference is "anything
 * that removes the interactivity of the game aspect", and an unacknowledged
 * unlock is exactly that.
 *
 * The API publishes the full achievement set on every state change, so the
 * newly earned ones are simply the difference from the previous render.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import { createElement } from 'react';
import type { ChoiceScriptState } from '@/lib/choicescript';

export function useAchievementToasts(state: ChoiceScriptState) {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const earned = state.achievements?.earned;
    if (!earned) return;

    /* the first pass records what was already unlocked; it must not announce
     * every achievement from a restored save all at once */
    if (seen.current === null) {
      seen.current = new Set(earned.map((a) => a.name));
      return;
    }

    for (const a of earned) {
      if (seen.current.has(a.name)) continue;
      seen.current.add(a.name);
      toast(a.title, {
        description: a.description,
        icon: createElement(Trophy, { className: 'size-4 text-accent shrink-0 mt-0.5' }),
        duration: 5000,
      });
    }
  }, [state.achievements]);
}
