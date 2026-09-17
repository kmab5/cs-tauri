/**
 * Settings, once.
 *
 * There were two: one in the library with theme, text size and mode, one inside
 * a game with the engine's own catalogues. They drifted — the weight slider
 * went into one and not the other, and the in-game one had never been touched
 * since the fonts were packaged. So this is the only settings surface, hosted in
 * two places: a dialog on the library, and the engine's settings overlay while
 * a game is open.
 *
 * **The central store is the single source of truth for theme, typeface, weight
 * and text size.** Every control writes there first, then tells the engine if a
 * game is running. Nothing reads the answer back out of the engine. That is
 * what finally fixes the theme wandering between the library and a game: the
 * engine persists its own `preferredTheme` in each game's save store and
 * applies it while booting, and any code that mirrored the engine's report back
 * into the central store would adopt that per-game value. So none does.
 *
 * Rows that only make sense with a game running — brightness, line width,
 * animation — appear only then, because they are the engine's own settings
 * rather than the app's.
 */
import { useState } from 'react';

import type { ChoiceScriptApi, ChoiceScriptState } from '@/lib/choicescript';
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

const FACES = [
  { id: 'serif', label: 'Serif', hint: 'Fraunces' },
  { id: 'sans', label: 'Sans', hint: 'Google Sans' },
  { id: 'humanist', label: 'Humanist', hint: 'Kanit' },
  { id: 'slab', label: 'Slab', hint: 'Sanchez' },
  { id: 'mono', label: 'Mono', hint: 'JetBrains Mono' },
  { id: 'dyslexia', label: 'OpenDyslexic', hint: 'weighted baselines' },
];

const ZOOMS = [
  { id: '0.875', label: 'Small' },
  { id: '1', label: 'Normal' },
  { id: '1.125', label: 'Large' },
  { id: '1.25', label: 'Larger' },
  { id: '1.5', label: 'Largest' },
];

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
              'min-h-touch rounded-cs border px-3 py-1 text-left font-ui text-sm',
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

export function SettingsForm({ cs, state }: { cs?: ChoiceScriptApi; state?: ChoiceScriptState }) {
  const [theme, setThemeState] = useState(getTheme);
  const [face, setFaceState] = useState(getFace);
  const [weight, setWeightState] = useState(() => getWeight());
  const [zoom, setZoomState] = useState(() => String(getZoom()));
  const [author, setAuthorState] = useState(isAuthorMode);
  const range = FACE_WEIGHTS[face];

  /* Central first, engine second. Never the other way round. */
  const pickTheme = (id: string) => {
    setTheme(id);
    applyTheme();
    setThemeState(id);
    cs?.setTheme(id);
  };
  const pickFace = (id: string) => {
    setFace(id);
    applyTheme();
    setFaceState(id);
    setWeightState(getWeight(id));
    cs?.setTypeface(id);
  };
  const pickZoom = (value: string) => {
    setZoom(Number(value));
    applyTheme();
    setZoomState(value);
    cs?.setZoom(Number(value));
  };
  const pickWeight = (value: number) => {
    setWeight(value, face);
    applyTheme();
    setWeightState(value);
  };

  return (
    <div>
      <Chips
        legend="Theme"
        items={THEMES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
        current={theme}
        onPick={pickTheme}
      />

      <Chips legend="Typeface" items={FACES} current={face} onPick={pickFace} />

      {/* Only the six faces with a real axis. The static families get their two
          actual weights rather than a slider synthesising the rest. */}
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
              onChange={(e) => pickWeight(Number(e.target.value))}
            />
            <span className="min-w-[4ch] font-mono text-sm tabular-nums text-ink-muted">
              {weight}
            </span>
          </div>
        </fieldset>
      )}

      <Chips legend="Text size" items={ZOOMS} current={zoom} onPick={pickZoom} />

      {/* The engine's own settings, which only exist while it is running. */}
      {cs && state && (
        <>
          <Chips
            legend="Brightness"
            items={[
              { id: 'sepia', label: 'Default' },
              { id: 'black', label: 'Dark' },
              { id: 'white', label: 'Light' },
            ]}
            current={state.theme.brightness}
            onPick={(id) => cs.setBrightness(id)}
          />
          <Chips
            legend="Line width"
            items={cs.widths()}
            current={state.theme.width}
            onPick={(id) => cs.setWidth(id)}
          />
          <fieldset className="mb-5 border-0 p-0">
            <legend className="mb-2 font-ui text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Motion
            </legend>
            <label className="flex items-center gap-2 font-ui text-sm">
              <input
                type="checkbox"
                checked={state.theme.animate}
                onChange={(e) => cs.setAnimation(e.target.checked)}
              />
              Animate transitions
            </label>
          </fieldset>
        </>
      )}

      {/* Absent in an exported story built without --author. */}
      {canToggleAuthorMode() && (
        <Chips
          legend="Mode"
          items={[
            { id: 'reader', label: 'Reader' },
            { id: 'author', label: 'Author', hint: 'god mode, trace, testing' },
          ]}
          current={author ? 'author' : 'reader'}
          onPick={(id) => {
            setAuthorMode(id === 'author');
            setAuthorState(id === 'author');
          }}
        />
      )}

      <p className="app-note">
        Theme, typeface, weight and text size are the app&rsquo;s, not a game&rsquo;s — one
        setting, everywhere, carried between the library and whatever you are reading.
      </p>
    </div>
  );
}
