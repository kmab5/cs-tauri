/**
 * The title bar.
 *
 * It has two jobs that pull against each other: identify the story, and give
 * you the controls. PRODUCT.md resolves the tension — the reading surface
 * recedes, the chrome has presence — so the title is set quietly and the
 * controls are named, deliberate, and always in the same place.
 *
 * It is sticky, because in a 3–10 hour game you should never scroll back to
 * find the stats button. The separating hairline only appears once you have
 * scrolled, so the bar is weightless at the top of a screen and grounded once
 * there is text behind it.
 */
import { useEffect, useState } from 'react';
import { BarChart3, Bookmark, ChevronLeft, Settings2, Trophy } from 'lucide-react';
import type { ChoiceScriptApi, ChoiceScriptState } from '@/lib/choicescript';
import { cn } from '@/lib/utils';

function Action({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: typeof BarChart3;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-full px-3',
        'font-ui text-[0.875rem] text-ink-muted transition-colors',
        'hover:bg-accent-wash hover:text-accent',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{label}</span>
      {badge && (
        <span className="rounded-full bg-accent-wash px-1.5 py-px font-ui text-[11px] tabular-nums text-accent">
          {badge}
        </span>
      )}
    </button>
  );
}

export function TitleBar({
  cs,
  state,
  fallbackTitle,
  onExit,
}: {
  cs: ChoiceScriptApi;
  state: ChoiceScriptState;
  fallbackTitle: string;
  onExit: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const earned = state.achievements?.earned.length ?? 0;
  const total = state.achievements?.total ?? 0;

  return (
    <header
      className={cn(
        'sticky top-0 z-20 -mx-5 mb-8 px-5',
        'bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70',
        'pt-[calc(0.5rem+env(safe-area-inset-top))]',
        'transition-shadow duration-300',
        scrolled && 'shadow-[0_1px_0_0_var(--cs-rule)]',
      )}
    >
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={onExit}
          aria-label="Back to library"
          className="grid size-touch shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-accent-wash hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>

        {/* the title identifies, it does not advertise */}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate font-ui text-[0.9375rem] font-medium leading-tight tracking-tight text-ink">
            {state.title || fallbackTitle}
          </h1>
          {state.author && (
            <p className="m-0 truncate font-ui text-[0.8125rem] leading-tight text-ink-faint">
              {state.author}
            </p>
          )}
        </div>
      </div>

      <nav
        aria-label="Game controls"
        className="-mx-1 flex gap-0.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Action icon={BarChart3} label="Stats" onClick={() => cs.openStats()} />
        <Action icon={Bookmark} label="Saves" onClick={() => cs.openSaves()} />
        <Action
          icon={Trophy}
          label="Achievements"
          badge={total > 0 ? `${earned}/${total}` : undefined}
          onClick={() => cs.openAchievements()}
        />
        <Action icon={Settings2} label="Settings" onClick={() => cs.openSettings()} />
      </nav>
    </header>
  );
}
