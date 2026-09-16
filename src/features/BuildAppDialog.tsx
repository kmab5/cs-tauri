/**
 * Build a standalone app for one game, from the library.
 *
 * The same CLI the terminal runs — `scripts/cs-export.mjs` — with its flags as
 * controls and its output streamed into the panel. Nothing is reimplemented
 * here, which is the point: there is one builder, and this is a front end for
 * it.
 *
 * Development builds only. The whole module is behind `import.meta.env.DEV`, so
 * a production bundle does not contain it.
 */
import { useEffect, useRef, useState } from 'react';
import { Hammer, X } from 'lucide-react';

import { DialogPanel } from '@/components/ui/dialog';
import type { StoredGame } from '@/lib/library';
import { buildStandalone, devInfo, onBuildOutput, type DevInfo } from '@/lib/desktop/devtools';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'game';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="build-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

export function BuildAppDialog({
  game,
  playerVersion,
  onClose,
}: {
  game: StoredGame;
  playerVersion: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<DevInfo | null>(null);
  const [out, setOut] = useState(`dist-apps/${slugify(game.title)}`);
  const [name, setName] = useState(game.title);
  const [version, setVersion] = useState(playerVersion);
  const [identifier, setIdentifier] = useState(
    `com.kmab.cs-tauri.${slugify(game.title).replace(/-/g, '')}`,
  );
  const [portable, setPortable] = useState(true);
  const [nsis, setNsis] = useState(false);
  const [msi, setMsi] = useState(false);
  const [icon, setIcon] = useState(true);
  const [skipTests, setSkipTests] = useState(false);

  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'ok' | 'failed' | null>(null);
  const tail = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void devInfo().then((i) => {
      setInfo(i);
      /* Installers are the sensible default where they can be built. */
      if (i.installers) setNsis(true);
    });
  }, []);

  /* Subscribed once, for the life of the dialog: a build outlives any single
     render and its output must not be dropped between them. */
  useEffect(() => {
    return onBuildOutput(
      (line) => setLog((lines) => [...lines, line]),
      (ok) => {
        setRunning(false);
        setResult(ok ? 'ok' : 'failed');
      },
    );
  }, []);

  useEffect(() => {
    tail.current?.scrollTo({ top: tail.current.scrollHeight });
  }, [log]);

  const start = () => {
    setLog([]);
    setResult(null);
    setRunning(true);
    buildStandalone({
      id: game.id,
      out,
      portable,
      nsis,
      msi,
      icon,
      skipTests,
      name: name === game.title ? '' : name,
      version: version === playerVersion ? '' : version,
      identifier,
    }).catch((e: Error) => {
      setLog((lines) => [...lines, e.message]);
      setRunning(false);
      setResult('failed');
    });
  };

  const nothingChosen = !portable && !nsis && !msi;

  return (
    <DialogPanel open title={`Build an app for ${game.title}`} onOpenChange={(v) => !v && onClose()}>
      {info && !info.available && (
        <p className="app-note mb-3">
          The builder needs the repository it was started from. This window was not launched from a
          checkout, so there is nothing to build in.
        </p>
      )}

      <div className="build-form">
        <Row label="Output folder" hint="relative to the checkout, or absolute">
          <input className="app-input" value={out} onChange={(e) => setOut(e.target.value)} />
        </Row>
        <Row label="App name" hint="on the window and the installer">
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Row>
        <Row label="Version">
          <input className="app-input" value={version} onChange={(e) => setVersion(e.target.value)} />
        </Row>
        <Row label="Identifier" hint="reverse-DNS, unique per app">
          <input
            className="app-input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </Row>
      </div>

      <fieldset className="build-checks">
        <legend>Build</legend>
        <label>
          <input type="checkbox" checked={portable} onChange={(e) => setPortable(e.target.checked)} />
          Portable folder
        </label>
        <label title={info?.installers ? undefined : 'Windows only'}>
          <input
            type="checkbox"
            checked={nsis}
            disabled={!info?.installers}
            onChange={(e) => setNsis(e.target.checked)}
          />
          NSIS installer
        </label>
        <label title={info?.installers ? undefined : 'Windows only'}>
          <input
            type="checkbox"
            checked={msi}
            disabled={!info?.installers}
            onChange={(e) => setMsi(e.target.checked)}
          />
          MSI installer
        </label>
        <label>
          <input type="checkbox" checked={icon} onChange={(e) => setIcon(e.target.checked)} />
          Icon from the game&rsquo;s cover
        </label>
        <label>
          <input
            type="checkbox"
            checked={skipTests}
            onChange={(e) => setSkipTests(e.target.checked)}
          />
          Skip the test pass
        </label>
      </fieldset>

      {!info?.installers && (
        <p className="app-note">
          NSIS and MSI are Windows formats and Tauri cannot cross-compile them. This machine is{' '}
          {info?.platform ?? 'not Windows'}.
        </p>
      )}

      {/* The reader's saves are deliberately left out of a build: they belong to
          this machine, not to every copy that ships. */}
      <p className="app-note">
        The game is staged as an archive without your saves, then built by{' '}
        <code className="font-mono">scripts/cs-export.mjs</code> — the same command as the terminal.
        A full build with tests takes a few minutes.
      </p>

      {(log.length > 0 || running) && (
        <pre className="build-log" ref={tail} aria-live="polite" aria-label="Build output">
          {log.join('\n') || 'Starting…'}
        </pre>
      )}

      {result && (
        <p className="app-note" role="status">
          {result === 'ok' ? `Built into ${out}.` : 'The build failed. The log above says where.'}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          className="app-btn app-btn-primary"
          disabled={running || nothingChosen || info?.available === false}
          onClick={start}
        >
          <Hammer className="size-3.5" aria-hidden />
          {running ? 'Building…' : 'Build'}
        </button>
        <button className="app-btn" onClick={onClose}>
          <X className="size-3.5" aria-hidden /> {running ? 'Hide' : 'Close'}
        </button>
      </div>
      {running && (
        <p className="app-note mt-1">
          Closing this leaves the build running; its output goes to the terminal.
        </p>
      )}
    </DialogPanel>
  );
}
