/**
 * Achievements, docked.
 *
 * This panel exists because the stats screen could not. A stats screen is a
 * ChoiceScript *scene* — `*stat_chart`, `*if`, and in games like Sordwin a
 * `*choice` the reader answers — and the engine runs it by raising
 * `bus.statsMode`, after which every block it emits routes to the stats channel
 * (bus.js:74). Answering a stats choice needs that flag up; advancing the story
 * needs it down. One flag, two mutually exclusive requirements: a live sheet
 * beside a usable story is not something the engine can be asked for, and the
 * previous attempt at one is exactly why the sheet ended up printed in the
 * middle of the page. So the stats screen is a dialog again.
 *
 * Achievements have no such problem. They are plain state — `state.achievements`
 * is derived, not rendered through a channel — so they can sit here and update
 * live without touching the interpreter at all.
 */
import { useSyncExternalStore } from 'react';
import { Lock, Trophy, X } from 'lucide-react';

import type { ChoiceScriptApi } from '@/lib/choicescript';

export function AchievementsPanel({
  cs,
  onClose,
  children,
}: {
  cs: ChoiceScriptApi;
  onClose: () => void;
  /** The width grip, which has to live inside the panel it resizes. */
  children?: React.ReactNode;
}) {
  const state = useSyncExternalStore(cs.subscribe, cs.getState, cs.getState);
  const list = state.achievements;
  const earned = list?.earned ?? [];
  const locked = list?.locked ?? [];
  const pct = list?.total ? Math.round((earned.length / list.total) * 100) : 0;

  return (
    <aside className="app-inspector" aria-label="Achievements">
      <div className="app-inspector-head">
        <span>Achievements</span>
        <button className="app-btn" onClick={onClose} aria-label="Close achievements panel">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="app-inspector-body">
        {!list || !list.total ? (
          <p className="app-note">This game declares no achievements.</p>
        ) : (
          <>
            <p className="app-note">
              {earned.length} of {list.total} · {pct}%
              {list.totalScore ? ` · ${list.score}/${list.totalScore} points` : ''}
              {list.hiddenCount ? ` · ${list.hiddenCount} hidden` : ''}
            </p>

            {/* role=meter matches the stat bars, so a screen reader gets the
                same treatment here as it does in the story. */}
            <div
              className="app-meter"
              role="meter"
              aria-valuenow={earned.length}
              aria-valuemin={0}
              aria-valuemax={list.total}
              aria-label="Achievements earned"
            >
              <span style={{ transform: `scaleX(${pct / 100})`, width: '100%' }} />
            </div>

            <ul className="app-achievements">
              {earned.map((a) => (
                <li key={a.name} data-earned="true">
                  <Trophy className="size-3.5 shrink-0" aria-hidden />
                  <span>
                    <b>{a.title}</b>
                    {a.description ? <span>{a.description}</span> : null}
                    {a.points ? <span>{a.points} points</span> : null}
                  </span>
                </li>
              ))}
              {locked.map((a) => (
                <li key={a.name} data-earned="false">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  <span>
                    <b>{a.title}</b>
                    {a.description ? <span>{a.description}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {children}
    </aside>
  );
}
