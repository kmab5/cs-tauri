/**
 * Testing, from the library.
 *
 * Not from inside a game, which is where it was and where it did not belong:
 * upstream's runners are headless, they build scenes from text and never render
 * anything, so nothing has to be playing. Running them from the shelf also
 * means a test cannot lose the reader's place in a story.
 *
 * Every option upstream's command line takes is a control, because the point of
 * a test you can run from the app is changing it and running it again.
 */
import { useEffect, useRef, useState } from 'react';
import { Dices, FlaskConical, Square, X } from 'lucide-react';

import type { StoredGame } from '@/lib/library';
import {
  DEFAULTS,
  quicktest,
  randomtest,
  type Progress,
  type Runner,
  type TestOptions,
  type TestReport,
} from '@/lib/author/runners';

export function TestingPanel({
  games,
  onClose,
  children,
}: {
  games: StoredGame[];
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [options, setOptions] = useState<TestOptions>(DEFAULTS);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const runner = useRef<Runner | null>(null);
  const tail = useRef<HTMLPreElement>(null);

  const running = !!progress && !report;
  const set = <K extends keyof TestOptions>(key: K, value: TestOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  useEffect(() => {
    if (!gameId && games[0]) setGameId(games[0].id);
  }, [games, gameId]);

  useEffect(() => {
    tail.current?.scrollTo({ top: tail.current.scrollHeight });
  }, [lines]);

  /* A run left going with the panel closed would keep the interpreter busy
     with nobody watching. */
  useEffect(() => () => runner.current?.cancel(), []);

  const start = (kind: 'quicktest' | 'randomtest') => {
    if (!gameId) return;
    setReport(null);
    setLines([]);
    setProgress({ run: 0, runs: options.iterations, label: 'starting', failures: 0 });
    const active = (kind === 'quicktest' ? quicktest : randomtest)(gameId, options, (p) => {
      setProgress(p);
    });
    runner.current = active;
    void active.done
      .then((result) => {
        setReport(result);
        setLines(result.log.slice(-500));
      })
      .catch((e: Error) => {
        setLines([`the runner could not start: ${e.message}`]);
        setProgress(null);
      })
      .finally(() => (runner.current = null));
  };

  const coveredLines = report?.coverage.reduce((n, c) => n + c.covered, 0) ?? 0;
  const uncoveredScenes = report?.coverage.filter((c) => c.uncovered.length) ?? [];

  return (
    <aside className="app-inspector" aria-label="Testing">
      <div className="app-inspector-head">
        <span>Testing</span>
        <button className="app-btn" onClick={onClose} aria-label="Close testing">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="app-inspector-body">
        <p className="app-note mb-3">
          Upstream&rsquo;s own quicktest and randomtest, running headless — no game is opened and
          nothing is rendered.
        </p>

        <label className="test-field">
          <span>Game</span>
          <select className="app-input" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </label>

        <label className="test-field">
          <span>Iterations</span>
          <input
            className="app-input"
            type="number"
            min={1}
            max={5000}
            value={options.iterations}
            onChange={(e) => set('iterations', Number(e.target.value))}
          />
        </label>
        <label className="test-field">
          <span>Seed</span>
          <input
            className="app-input"
            type="number"
            min={0}
            value={options.seed}
            onChange={(e) => set('seed', Number(e.target.value))}
          />
        </label>
        <label className="test-field">
          <span>Max commands</span>
          <input
            className="app-input"
            type="number"
            min={100}
            max={1000000}
            value={options.maxSteps}
            onChange={(e) => set('maxSteps', Number(e.target.value))}
          />
        </label>
        <label className="test-field">
          <span>Text input</span>
          <input
            className="app-input"
            value={options.inputText}
            onChange={(e) => set('inputText', e.target.value)}
          />
        </label>

        <fieldset className="test-checks">
          <legend>Options</legend>
          {(
            [
              ['avoidUsedOptions', 'Avoid used options'],
              ['showChoices', 'Log each choice'],
              ['showText', 'Log the prose'],
              ['showCoverage', 'Report line coverage'],
              ['stopOnError', 'Stop at the first failure'],
            ] as [keyof TestOptions, string][]
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={!!options[key]}
                onChange={(e) => set(key, e.target.checked as never)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-1">
          <button
            className="app-btn app-btn-primary"
            disabled={running || !gameId}
            onClick={() => start('quicktest')}
          >
            <FlaskConical className="size-3.5" aria-hidden /> Quicktest
          </button>
          <button
            className="app-btn app-btn-primary"
            disabled={running || !gameId}
            onClick={() => start('randomtest')}
          >
            <Dices className="size-3.5" aria-hidden /> Randomtest
          </button>
          {running && (
            <button className="app-btn" onClick={() => runner.current?.cancel()}>
              <Square className="size-3.5" aria-hidden /> Stop
            </button>
          )}
        </div>

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
              {report ? 'Finished' : `${progress.run} of ${progress.runs}`} — {progress.label}
            </p>
          </div>
        )}

        {report && (
          <div className="test-report">
            <dl>
              <dt>{report.kind === 'quicktest' ? 'Scenes walked' : 'Playthroughs'}</dt>
              <dd>{report.runs}</dd>
              {report.kind === 'randomtest' && (
                <>
                  <dt>Commands</dt>
                  <dd>{report.commands}</dd>
                  <dt>Choices</dt>
                  <dd>{report.choicesTaken}</dd>
                  <dt>Endings</dt>
                  <dd>{report.endings}</dd>
                </>
              )}
              {report.kind === 'quicktest' && (
                <>
                  <dt>Lines covered</dt>
                  <dd>{coveredLines}</dd>
                  <dt>Scenes with gaps</dt>
                  <dd>{uncoveredScenes.length}</dd>
                </>
              )}
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
                    <b>{failure.where}</b>
                    <span>{failure.message}</span>
                    {!!failure.path.length && <code>{failure.path.slice(-10).join('  →  ')}</code>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="app-note" role="status">
                No failures.
              </p>
            )}

            {options.showCoverage && !!uncoveredScenes.length && (
              <details className="test-coverage">
                <summary>Uncovered lines</summary>
                {uncoveredScenes.map((c) => (
                  <p key={c.scene}>
                    <b>{c.scene}</b> {c.uncovered.join(', ')}
                  </p>
                ))}
              </details>
            )}
          </div>
        )}

        {!!lines.length && (
          <pre className="build-log" ref={tail} aria-live="polite" aria-label="Test output">
            {lines.join('\n')}
          </pre>
        )}
      </div>
      {children}
    </aside>
  );
}
