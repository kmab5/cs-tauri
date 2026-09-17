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
import {
  FACE_WEIGHTS,
  THEMES,
  applyTheme,
  getFace,
  getTheme,
  getWeight,
  getZoom,
  setFace,
  setTheme,
  setWeight,
  setZoom,
} from '@/lib/theme';
import { canToggleAuthorMode, isAuthorMode, setAuthorMode } from '@/lib/author/mode';
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
  const [author, setAuthorState] = useState(isAuthorMode);
  const [face, setFaceState] = useState(getFace);
  const [weight, setWeightState] = useState(() => getWeight());
  const range = FACE_WEIGHTS[face];

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
        legend="Typeface"
        items={[
          { id: 'serif', label: 'Serif', hint: 'Fraunces' },
          { id: 'sans', label: 'Sans', hint: 'Google Sans' },
          { id: 'humanist', label: 'Humanist', hint: 'Kanit' },
          { id: 'slab', label: 'Slab', hint: 'Sanchez' },
          { id: 'mono', label: 'Mono', hint: 'JetBrains Mono' },
          { id: 'dyslexia', label: 'OpenDyslexic', hint: 'weighted baselines' },
        ]}
        current={face}
        onPick={(id) => {
          setFace(id);
          setFaceState(id);
          setWeightState(getWeight(id));
          applyTheme();
        }}
      />

      {/* Only where the family can actually take a range. The four static
          families get their two real weights rather than a slider that
          synthesises the rest. */}
      {range && (
        <fieldset className="mb-5 border-0 p-0">
          <legend className="mb-2 font-ui text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Weight
          </legend>
          <div className="flex items-center gap-3">
            <input
              className="flex-1"
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={weight}
              aria-label="Reading weight"
              onChange={(e) => {
                const value = Number(e.target.value);
                setWeight(value, face);
                setWeightState(value);
                applyTheme();
              }}
            />
            <span className="font-mono text-sm tabular-nums text-ink-muted">{weight}</span>
          </div>
        </fieldset>
      )}

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
      {/* Absent in an exported story built without --author: which kind of
          build it is was decided when it was built, and a published story
          should not be switchable into god mode from a settings panel. */}
      {canToggleAuthorMode() && (
        <Chips
          legend="Mode"
          items={[
            { id: 'reader', label: 'Reader' },
            { id: 'author', label: 'Author', hint: 'god mode, trace console' },
          ]}
          current={author ? 'author' : 'reader'}
          onPick={(id) => {
            setAuthorMode(id === 'author');
            setAuthorState(id === 'author');
          }}
        />
      )}

      <p className="app-note">
        A running game has its own settings, with everything else in it. These two are the ones
        that make sense with no story open, and they carry over when you start one.
      </p>
      {canToggleAuthorMode() && author && (
        <p className="app-note mt-2">
          Author mode adds god mode and the trace console to a running game, and
          instruments the interpreter to record every <code className="font-mono">*if</code>,{' '}
          <code className="font-mono">*goto</code> and <code className="font-mono">*set</code>.
          Open a game to use them.
        </p>
      )}
    </DialogPanel>
  );
}
