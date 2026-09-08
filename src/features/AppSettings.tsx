/**
 * Settings, with no game open.
 *
 * The engine owns the settings dialog, and the engine only exists once a game
 * is running — so on the library page the reader had no way to change the
 * theme at all. This is the subset that makes sense without a story loaded:
 * appearance and text size. Deliberately *not* here are restart, save, restore
 * and anything else that acts on a game, because there is no game to act on.
 *
 * Both settings are stored by lib/theme.ts and handed to the engine when a game
 * opens, so a choice made here survives into play.
 */
import { useState } from 'react';

import { DialogPanel } from '@/components/ui/dialog';
import { THEMES, applyTheme, getTheme, getZoom, setTheme, setZoom } from '@/lib/theme';
import { cn } from '@/lib/utils';

function Chips({
  legend,
  items,
  current,
  onPick,
}: {
  legend: string;
  items: { id: string; label: string; hint?: string }[];
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="mb-5 border-0 p-0">
      <legend className="mb-2 font-ui text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            aria-pressed={item.id === current}
            className={cn(
              'min-h-touch rounded-cs border px-3 font-ui text-sm',
              item.id === current
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-rule bg-raised text-ink hover:border-accent',
            )}
          >
            {item.label}
            {item.hint && <span className="app-chip-hint">{item.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const ZOOMS = [
  { id: '0.9', label: 'Small' },
  { id: '1', label: 'Normal' },
  { id: '1.15', label: 'Large' },
  { id: '1.35', label: 'Larger' },
];

export function AppSettings({ onClose }: { onClose: () => void }) {
  const [theme, setThemeState] = useState(getTheme);
  const [zoom, setZoomState] = useState(() => String(getZoom()));

  return (
    <DialogPanel open title="Settings" onOpenChange={(v) => !v && onClose()}>
      <Chips
        legend="Theme"
        items={THEMES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
        current={theme}
        onPick={(id) => {
          setTheme(id);
          applyTheme();
          setThemeState(id);
        }}
      />
      <Chips
        legend="Text size"
        items={ZOOMS}
        current={zoom}
        onPick={(id) => {
          setZoom(Number(id));
          applyTheme();
          setZoomState(id);
        }}
      />
      <p className="app-note">
        A running game has its own settings, with everything else in it. These two are the ones
        that make sense with no story open, and they carry over when you start one.
      </p>
    </DialogPanel>
  );
}
