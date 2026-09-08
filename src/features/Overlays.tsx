/**
 * Overlay screens.
 *
 * These are dialogs above the story, which stays mounted underneath — opening
 * stats mid-scene cannot lose the player's place, and closing is just "stop
 * showing it". The stats screen runs a real engine scene on its own channel
 * (`statsBlocks` / `statsPending`), so it can never overwrite the story.
 */
import { useEffect, useState } from 'react';
import type { ChoiceScriptApi, ChoiceScriptState, SaveRecord } from '@/lib/choicescript';
import { Blocks } from './Blocks';
import { PendingView } from './Pending';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogPanel } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ScreenProps {
  cs: ChoiceScriptApi;
  state: ChoiceScriptState;
  gameId: string;
}

function relativeTime(when?: number | string): string {
  const n = Number(when);
  if (!n || Number.isNaN(n)) return '';
  const secs = Math.round((Date.now() - n) / 1000);
  if (secs < 45) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.35, 'month'], [12, 'year'],
  ];
  let value = secs / 60;
  let label = 'minute';
  for (let i = 1; i < units.length; i++) {
    if (value < units[i][0]) break;
    value /= units[i][0];
    label = units[i][1];
  }
  const rounded = Math.round(value);
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
}

function chapterLabel(scene?: string): string {
  if (!scene) return 'Unknown chapter';
  return scene
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Saves({ cs }: { cs: ChoiceScriptApi }) {
  const [saves, setSaves] = useState<SaveRecord[] | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  /* listSaves returns the chainable api; useEffect would mistake that for a
   * cleanup function, so discard it explicitly */
  const refresh = () => {
    cs.listSaves(setSaves);
  };
  useEffect(refresh, [cs]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="save-name">
          Name this save
        </label>
        <Input
          id="save-name"
          className="flex-1"
          placeholder="Name this save"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          variant="default"
          onClick={() =>
            cs.save(name, (ok, reason) => {
              setMessage(ok ? 'Saved.' : reason ?? 'Could not save.');
              if (ok) setName('');
              refresh();
            })
          }
        >
          Save
        </Button>
      </div>
      {message && <p className="mb-3 font-ui text-sm text-ink-muted">{message}</p>}

      {saves === null ? (
        <p className="font-ui text-sm text-ink-muted">Loading…</p>
      ) : saves.length === 0 ? (
        <p className="font-ui text-sm text-ink-muted">No saves yet.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {saves.map((save, i) => (
            <li key={i} className="mb-2">
              <button
                onClick={() => cs.load(save)}
                className="flex w-full flex-col gap-0.5 rounded-cs border border-rule border-l-[3px] bg-raised px-4 py-3 text-left transition-colors hover:border-l-accent"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-ui font-medium">{save.name || 'Untitled save'}</span>
                  <span className="shrink-0 font-ui text-sm tabular-nums text-ink-faint">
                    {relativeTime(save.savedAt ?? save.timestamp)}
                  </span>
                </span>
                <span className="font-ui text-sm text-ink-muted">
                  <span className="text-accent">{chapterLabel(save.scene)}</span>
                  {save.line !== undefined && ` · line ${save.line + 1}`}
                  {save.savedAt && ` · ${new Date(Number(save.savedAt)).toLocaleString()}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
    <fieldset className="mb-5 border-0 border-t border-rule p-0 pt-4 first:border-t-0 first:pt-0">
      <legend className="font-ui text-sm uppercase tracking-wider text-ink-faint">
        {legend}
      </legend>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            className={cn(
              'flex min-h-touch flex-col items-start rounded-cs border border-rule px-3 py-2 text-left transition-colors hover:border-accent',
              current === item.id && 'border-accent bg-accent-wash',
            )}
          >
            <span className="font-ui text-[0.9375rem]">{item.label}</span>
            {item.hint && <span className="font-ui text-sm text-ink-muted">{item.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Settings({ cs, state }: { cs: ChoiceScriptApi; state: ChoiceScriptState }) {
  const { theme } = state;
  return (
    <div>
      <Chips legend="Theme" items={cs.themes()} current={theme.name} onPick={cs.setTheme} />
      <Chips
        legend="Brightness"
        items={[
          { id: 'sepia', label: 'Default' },
          { id: 'black', label: 'Dark' },
          { id: 'white', label: 'Light' },
        ]}
        current={theme.brightness}
        onPick={cs.setBrightness}
      />
      <Chips
        legend="Typeface"
        items={cs.typefaces()}
        current={theme.typeface}
        onPick={cs.setTypeface}
      />
      <Chips legend="Line width" items={cs.widths()} current={theme.width} onPick={cs.setWidth} />

      <fieldset className="mb-5 border-0 border-t border-rule p-0 pt-4">
        <legend className="font-ui text-sm uppercase tracking-wider text-ink-faint">
          Text size
        </legend>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" aria-label="Smaller text" onClick={() => cs.setZoom(Math.max(0.75, theme.zoom - 0.125))}>
            A−
          </Button>
          <span className="min-w-[4ch] text-center font-ui tabular-nums text-ink-muted">
            {Math.round(theme.zoom * 100)}%
          </span>
          <Button size="sm" aria-label="Larger text" onClick={() => cs.setZoom(Math.min(2, theme.zoom + 0.125))}>
            A+
          </Button>
        </div>
      </fieldset>

      <fieldset className="mb-5 border-0 border-t border-rule p-0 pt-4">
        <legend className="font-ui text-sm uppercase tracking-wider text-ink-faint">Motion</legend>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            id="cs-anim"
            checked={theme.animate}
            onChange={(e) => cs.setAnimation(e.target.checked)}
          />
          <label htmlFor="cs-anim" className="font-ui text-[0.9375rem]">
            Fade between screens
          </label>
        </div>
      </fieldset>

      <fieldset className="border-0 border-t border-rule p-0 pt-4">
        <legend className="font-ui text-sm uppercase tracking-wider text-ink-faint">Game</legend>
        <div className="mt-3">
          <Button variant="danger" onClick={() => cs.restart()}>
            Restart from the beginning
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function Achievements({ state }: { state: ChoiceScriptState }) {
  const a = state.achievements;
  if (!a) return <p className="font-ui text-sm text-ink-muted">None.</p>;
  const item = (x: { name: string; title: string; description: string; points: number }, locked: boolean) => (
    <li
      key={x.name}
      className={cn(
        'mb-3 border-l-[3px] py-3 pl-4',
        locked ? 'border-rule text-ink-muted' : 'border-accent',
      )}
    >
      <div className="font-ui font-medium">{x.title}</div>
      <div className="text-[0.9375rem]">{x.description}</div>
      <div className="mt-1 font-ui text-sm tabular-nums text-ink-faint">
        {x.points} {x.points === 1 ? 'point' : 'points'}
      </div>
    </li>
  );
  return (
    <div>
      <p className="mb-4 font-ui text-sm text-ink-muted">
        {a.score} of {a.totalScore} points · {a.earned.length} of {a.total} unlocked
        {a.hiddenCount ? ` · ${a.hiddenCount} hidden` : ''}
      </p>
      {a.earned.length === 0 ? (
        <p className="font-ui text-sm text-ink-muted">Nothing unlocked yet. Play on.</p>
      ) : (
        <ul className="m-0 list-none p-0">{a.earned.map((x) => item(x, false))}</ul>
      )}
      {a.locked.length > 0 && (
        <>
          <h3 className="mb-3 mt-6 border-b border-rule pb-2 font-ui text-[0.9375rem] font-medium text-ink-muted">
            Still locked
          </h3>
          <ul className="m-0 list-none p-0">{a.locked.map((x) => item(x, true))}</ul>
        </>
      )}
    </div>
  );
}

const TITLES: Record<string, string> = {
  stats: 'Stats',
  saves: 'Saved games',
  settings: 'Settings',
  achievements: 'Achievements',
  menu: 'Menu',
};

export function Overlays({ cs, state, gameId }: ScreenProps) {
  const open = state.overlay;
  return (
    <DialogPanel
      open={!!open}
      onOpenChange={(v) => !v && cs.closeOverlay()}
      title={open ? TITLES[open] ?? open : ''}
    >
        {open === 'stats' && (
          <>
            <Blocks blocks={state.statsBlocks} cs={cs} gameId={gameId} />
            <PendingView pending={state.statsPending} cs={cs} channel="stats" />
          </>
        )}
        {open === 'saves' && <Saves cs={cs} />}
        {open === 'settings' && <Settings cs={cs} state={state} />}
        {open === 'achievements' && <Achievements state={state} />}
        {open === 'menu' && (
          <nav className="flex flex-col gap-2">
            {[
              { label: 'Continue', hint: 'Back to the story', act: () => cs.closeOverlay() },
              { label: 'Saved games', hint: 'Load or create a save', act: () => cs.openSaves() },
              { label: 'Stats', hint: 'Your character', act: () => cs.openStats() },
              { label: 'Achievements', hint: 'What you have unlocked', act: () => cs.openAchievements() },
              { label: 'Settings', hint: 'Theme, type, motion', act: () => cs.openSettings() },
              { label: 'Restart', hint: 'Begin again', act: () => cs.restart() },
            ].map((it) => (
              <button
                key={it.label}
                onClick={it.act}
                className="flex min-h-touch flex-col rounded-cs border border-rule border-l-[3px] px-4 py-3 text-left transition-colors hover:border-l-accent hover:bg-raised"
              >
                <span className="font-ui font-medium">{it.label}</span>
                <span className="font-ui text-sm text-ink-muted">{it.hint}</span>
              </button>
            ))}
          </nav>
        )}
    </DialogPanel>
  );
}

export function ModalPrompt({ cs, state }: { cs: ChoiceScriptApi; state: ChoiceScriptState }) {
  const modal = state.modal;
  return (
    <DialogPanel
      open={!!modal}
      onOpenChange={(v) => !v && modal && cs.answerModal(false)}
      title="Message"
    >
      <p className="mb-4">{modal?.message}</p>
      <div className="flex justify-end gap-2">
        {modal?.kind === 'confirm' && (
          <Button onClick={() => cs.answerModal(false)}>Cancel</Button>
        )}
        <Button variant="default" onClick={() => cs.answerModal(true)}>
          OK
        </Button>
      </div>
    </DialogPanel>
  );
}
