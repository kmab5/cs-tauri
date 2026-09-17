/**
 * Quicktest and randomtest, from the app.
 *
 * Every option upstream's command-line tools take is a control here, because
 * the point of a test you can run from the app is that you can change it and
 * run it again in ten seconds.
 *
 * Both drive the live interpreter, so the story plays itself in the window
 * while a run is going. That is not a side effect to hide — it is the clearest
 * possible indication of what is being tested, and it is why the log records
 * the path to every failure: so it can be replayed by hand afterwards.
 */
import { useEffect, useRef, useState } from 'react';
import { Dices, FlaskConical, Square, X } from 'lucide-react';

import { DialogPanel } from '@/components/ui/dialog';
import type { ChoiceScriptApi } from '@/lib/choicescript';
import {
  DEFAULTS,
  quicktest,
  randomtest,
  type Progress,
  type Runner,
  type TestOptions,
  type TestReport,
} from '@/lib/author/test-runner';

function Num({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="build-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="build-field">
        <input
          className="app-input"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
    </label>
  );
}

export function TestRunner({ cs, onClose }: { cs: ChoiceScriptApi; onClose: () => void }) {
  const [options, setOptions] = useState<TestOptions>(DEFAULTS);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const runner = useRef<Runner | null>(null);
  const tail = useRef<HTMLPreElement>(null);
  const [lines, setLines] = useState<string[]>([]);

  const running = !!progress && !report;
  const set = <K extends keyof TestOptions>(key: K, value: TestOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  useEffect(() => {
    tail.current?.scrollTo({ top: tail.current.scrollHeight });
  }, [lines]);

  /* A run left going after the dialog closes would keep driving the story with
     nobody watching. */
  useEffect(() => () => runner.current?.cancel(), []);

  const start = (kind: 'quicktest' | 'randomtest') => {
    setReport(null);
    setLines([]);
    setProgress({ run: 0, runs: options.iterations, label: 'starting', screens: 0, failures: 0 });
    const active = (kind === 'quicktest' ? quicktest : randomtest)(cs, options, (p) => {
      setProgress(p);
      setLines((l) => [...l.slice(-400), `${p.label} · ${p.screens} screens · ${p.failures} failures`]);
    });
    runner.current = active;
    void active.done.then((result) => {
      setReport(result);
      setLines(result.log.slice(-400));
      runner.current = null;
    });
  };

  return (
    <DialogPanel open title="Test this game" onOpenChange={(v) => !v && onClose()}>
      <p className="app-note">
        Both tools drive the real interpreter, so the story will play itself in the window while
        they run. Quicktest takes every option once and is deterministic; randomtest plays whole
        games at random from a seed you can replay.
      </p>

      <div className="build-form">
        <Num
          label="Iterations"
          hint="randomtest: playthroughs"
          min={1}
          max={2000}
          value={options.iterations}
          onChange={(n) => set('iterations', n)}
        />
        <Num
          label="Seed"
          hint="the same seed replays the same run"
          min={0}
          max={999999}
          value={options.seed}
          onChange={(n) => set('seed', n)}
        />
        <Num
          label="Max screens"
          hint="loop guard, per playthrough"
          min={50}
          max={100000}
          value={options.maxSteps}
          onChange={(n) => set('maxSteps', n)}
        />
        <label className="build-row">
          <span>
            Text input
            <small>what to type when the story asks</small>
          </span>
          <span className="build-field">
            <input
              className="app-input"
              value={options.inputText}
              onChange={(e) => set('inputText', e.target.value)}
            />
          </span>
        </label>
      </div>

      <fieldset className="build-checks">
        <legend>Options</legend>
        <label>
          <input
            type="checkbox"
            checked={options.avoidUsedOptions}
            onChange={(e) => set('avoidUsedOptions', e.target.checked)}
          />
          Avoid used options
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.showChoices}
            onChange={(e) => set('showChoices', e.target.checked)}
          />
          Log each choice
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.showText}
            onChange={(e) => set('showText', e.target.checked)}
          />
          Log the prose
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.stopOnError}
            onChange={(e) => set('stopOnError', e.target.checked)}
          />
          Stop at the first failure
        </label>
      </fieldset>

      {progress && (
        <div className="build-progress">
          <div
            className="app-meter"
            role="progressbar"
            aria-valuenow={progress.run}
            aria-valuemin={0}
            aria-valuemax={Math.max(progress.runs, 1)}
            aria-label="Test progress"
          >
            <span
              style={{
                transform: `scaleX(${Math.min(1, progress.run / Math.max(progress.runs, 1))})`,
                width: '100%',
              }}
            />
          </div>
          <p className="app-note">
            {report ? 'Finished' : `Run ${progress.run} of ${progress.runs}`} — {progress.label} ·{' '}
            {progress.screens} screens
          </p>
        </div>
      )}

      {!!lines.length && (
        <pre className="build-log" ref={tail} aria-live="polite" aria-label="Test output">
          {lines.join('\n')}
        </pre>
      )}

      {report && (
        <div className="test-report">
          <dl>
            <dt>Runs</dt>
            <dd>{report.runs}</dd>
            <dt>Screens</dt>
            <dd>{report.screens}</dd>
            <dt>Endings reached</dt>
            <dd>{report.endings}</dd>
            <dt>Choices found</dt>
            <dd>{report.sitesSeen}</dd>
            <dt>Options taken</dt>
            <dd>
              {report.optionsTaken} / {report.optionsSeen}
            </dd>
            <dt>Time</dt>
            <dd>{(report.ms / 1000).toFixed(1)}s</dd>
          </dl>

          {report.failures.length ? (
            <div role="alert">
              <p className="app-note">
                {report.failures.length} failure{report.failures.length === 1 ? '' : 's'}
                {report.seed !== undefined ? ` · seed ${report.seed}` : ''}
              </p>
              {report.failures.map((failure, i) => (
                <div className="test-failure" key={i}>
                  <b>{failure.run}</b>
                  <span>{failure.message}</span>
                  {/* The path is the point: a failure you cannot reach again is
                      a rumour. */}
                  {!!failure.path.length && <code>{failure.path.slice(-12).join('  →  ')}</code>}
                </div>
              ))}
            </div>
          ) : (
            <p className="app-note" role="status">
              No failures. {report.optionsTaken === report.optionsSeen
                ? 'Every option found was taken at least once.'
                : `${report.optionsSeen - report.optionsTaken} options were found but never taken — raise the iterations, or use quicktest.`}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button className="app-btn app-btn-primary" disabled={running} onClick={() => start('quicktest')}>
          <FlaskConical className="size-3.5" aria-hidden /> Quicktest
        </button>
        <button className="app-btn app-btn-primary" disabled={running} onClick={() => start('randomtest')}>
          <Dices className="size-3.5" aria-hidden /> Randomtest
        </button>
        {running && (
          <button className="app-btn" onClick={() => runner.current?.cancel()}>
            <Square className="size-3.5" aria-hidden /> Stop
          </button>
        )}
        <button className="app-btn" onClick={onClose}>
          <X className="size-3.5" aria-hidden /> Close
        </button>
      </div>

      {running && (
        <p className="app-note mt-1">
          Closing this stops the run. Your place in the story is lost either way — a test restarts
          the game, so save first if you were reading.
        </p>
      )}
    </DialogPanel>
  );
}
