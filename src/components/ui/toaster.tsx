/**
 * Toasts, styled from the engine's tokens so they re-theme with everything else.
 *
 * Their real job is achievements. `*achieve` fires 330 times across the sample
 * corpus and previously surfaced nowhere in this front end: the player earned
 * something and the interface said nothing. For a product whose stated
 * anti-reference is "anything that removes the game feel", that was the gap
 * worth closing.
 */
import { Toaster as Sonner } from 'sonner';

import { isDesktop } from '@/lib/desktop';

export function Toaster() {
  /*
   * Top-centre is a phone idiom: it is where a thumb is not, and where the
   * notch already trains people to look. On a desktop the corner is where
   * notifications live, and it keeps the reading column clear.
   *
   * Three at a time, because Choice of Magics alone calls *achieve 325 times.
   */
  const desktop = isDesktop();
  return (
    <Sonner
      position={desktop ? 'bottom-right' : 'top-center'}
      visibleToasts={desktop ? 3 : 3}
      offset={desktop ? 16 : 12}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-3 rounded-cs border border-rule border-l-[3px] border-l-accent bg-raised px-4 py-3 shadow-lg',
          title: 'font-ui text-[0.9375rem] font-semibold text-ink',
          description: 'font-ui text-sm text-ink-muted',
        },
      }}
    />
  );
}
