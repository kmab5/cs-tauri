/**
 * Reading from the keyboard.
 *
 * A 3–10 hour game read at a desk should not need the mouse. Most of what is
 * needed already exists: the engine's number shortcuts select an option
 * (Pending.tsx), Enter submits the form, and because the options are real
 * radio inputs the arrow keys move between them natively once one has focus.
 * Nothing here duplicates any of that.
 *
 * What is missing is paging. Space is the universal "next screenful", and at
 * the bottom of a passage whose only remaining action is *page_break it should
 * simply continue — which is what a reader means by pressing it again.
 *
 * Arrow keys are deliberately left alone. A ChoiceScript screen is often a
 * page of prose above its choices, and hijacking Down to move the selection
 * would take scrolling away from someone in the middle of reading.
 */
import { useEffect } from 'react';

const PAGE_FRACTION = 0.85;

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName ?? '';
  return /^(INPUT|TEXTAREA|BUTTON|A|SELECT)$/.test(tag) || el?.isContentEditable === true;
}

export function useReadingKeys({
  pane,
  canContinue,
  onContinue,
}: {
  /** Returns the scrolling element, or null to use the window. */
  pane: () => Element | null;
  canContinue: boolean;
  onContinue: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /* Space on a focused button or link is that control's own activation,
         and taking it would break every choice on the screen. */
      if (typing(e.target)) return;

      const el = pane();
      const height = el ? el.clientHeight : window.innerHeight;
      const top = el ? el.scrollTop : window.scrollY;
      const max = (el ? el.scrollHeight : document.body.scrollHeight) - height;
      const step = Math.round(height * PAGE_FRACTION);
      const scrollTo = (y: number) => {
        if (el) el.scrollTo({ top: y, behavior: 'smooth' });
        else window.scrollTo({ top: y, behavior: 'smooth' });
      };

      const forward = e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);

      if (forward) {
        e.preventDefault();
        /* Within 4px of the bottom counts as the bottom: fractional device
           pixel ratios mean scrollTop rarely reaches max exactly. */
        if (top >= max - 4 && canContinue) onContinue();
        else scrollTo(Math.min(max, top + step));
        return;
      }
      if (back) {
        e.preventDefault();
        scrollTo(Math.max(0, top - step));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        scrollTo(0);
      }
      if (e.key === 'End') {
        e.preventDefault();
        scrollTo(max);
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pane, canContinue, onContinue]);
}

/**
 * Where the reader had got to, per game.
 *
 * Kept in localStorage rather than the engine's save store: it describes the
 * window, not the story, and it must not travel with a save file into a
 * different window size.
 */
const KEY = (id: string) => `cs-scroll-${id}`;

export function saveScroll(id: string, top: number) {
  try {
    localStorage.setItem(KEY(id), String(Math.round(top)));
  } catch {
    /* a full or disabled store is not worth interrupting reading for */
  }
}

export function readScroll(id: string): number {
  const raw = Number(localStorage.getItem(KEY(id)));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
