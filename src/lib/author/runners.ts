/**
 * Quicktest and randomtest, as upstream runs them.
 *
 * **Quicktest** is upstream's file, vendored unmodified
 * (`vendor/autotester.js`). It is handed one scene's text at a time and walks
 * every branch of it by cloning the interpreter, returning line coverage and
 * the ranges it never reached. Upstream's `autotest.js` does exactly this, once
 * per scene file, and so does this.
 *
 * **Randomtest** has no embeddable form upstream, so its `Scene.prototype`
 * overrides are mirrored here from `randomtest.js` with the line numbers
 * recorded against each one. The behaviours that matter are upstream's: a
 * `*page_break` is not a stop, a `*finish` builds the next scene from `nav` and
 * keeps going, `*input_text` answers with a string and sometimes a blank one
 * where blanks are allowed, `*input_number` takes a random value in range, and
 * `*choice` picks an option and records it. Seeded, so a failing iteration can
 * be replayed.
 *
 * Both are headless. Neither needs a game to be open, which is why testing
 * lives in the library rather than in the story.
 */
import autotester from './vendor/autotester.js';
import { buildScene, makeHarness, type SceneInstance } from './headless';

export interface TestOptions {
  /** Randomtest: how many playthroughs. */
  iterations: number;
  /** The seed. The same seed replays the same run exactly. */
  seed: number;
  /** Prefer options not yet taken — upstream's avoidUsedOptions. */
  avoidUsedOptions: boolean;
  /** Record each choice and the option taken. */
  showChoices: boolean;
  /** Record the prose. Verbose. */
  showText: boolean;
  /** Report line coverage per scene. */
  showCoverage: boolean;
  /** Give up on a playthrough after this many commands, as a loop guard. */
  maxSteps: number;
  /** Stop the whole run at the first failure. */
  stopOnError: boolean;
  /** What to answer when the story asks for text. */
  inputText: string;
}

export const DEFAULTS: TestOptions = {
  iterations: 20,
  seed: 1,
  avoidUsedOptions: true,
  showChoices: true,
  showText: false,
  showCoverage: true,
  maxSteps: 20000,
  stopOnError: false,
  inputText: 'Quicktest',
};

export interface TestFailure {
  where: string;
  message: string;
  path: string[];
}

export interface SceneCoverage {
  scene: string;
  lines: number;
  covered: number;
  uncovered: string[];
}

export interface TestReport {
  kind: 'quicktest' | 'randomtest';
  runs: number;
  scenes: number;
  commands: number;
  choicesTaken: number;
  endings: number;
  failures: TestFailure[];
  coverage: SceneCoverage[];
  log: string[];
  seed?: number;
  cancelled: boolean;
  ms: number;
}

export interface Progress {
  run: number;
  runs: number;
  label: string;
  failures: number;
}

export interface Runner {
  cancel(): void;
  done: Promise<TestReport>;
}

/** Deterministic PRNG, so a seed means something. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/**
 * Quicktest: upstream's autotester, once per scene.
 *
 * `autotester` throws on the first problem it finds in a scene, which is
 * upstream's contract — the message carries the scene and line. Each scene is
 * independent, so one bad scene does not hide the rest unless asked.
 */
export function quicktest(gameId: string, options: TestOptions, onProgress: (p: Progress) => void): Runner {
  const log: string[] = [];
  const failures: TestFailure[] = [];
  const coverage: SceneCoverage[] = [];
  const started = Date.now();
  let cancelled = false;

  const done = (async (): Promise<TestReport> => {
    const h = await makeHarness(gameId);
    let scenes = 0;

    try {
      const names = [...new Set([...h.sceneList, ...Object.keys(h.scenes)])];
      for (const [index, name] of names.entries()) {
        if (cancelled) break;
        const text = Object.entries(h.scenes).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
        if (text === undefined) {
          failures.push({ where: name, message: `*scene_list names "${name}" but there is no such scene file`, path: [] });
          continue;
        }

        onProgress({ run: index + 1, runs: names.length, label: name, failures: failures.length });
        log.push(`— ${name}`);

        try {
          /* Upstream's own signature and semantics. */
          const result = autotester(text, h.nav, name) as [number[], string[]?];
          const lines = result?.[0] ?? [];
          const uncovered = result?.[1] ?? [];
          const counted = lines.filter((n) => n !== undefined).length;
          coverage.push({
            scene: name,
            lines: text.split('\n').length,
            covered: counted,
            uncovered,
          });
          if (uncovered.length) log.push(`  uncovered: ${uncovered.join(', ')}`);
          scenes++;
        } catch (e) {
          const message = (e as Error).message || String(e);
          failures.push({ where: name, message, path: [] });
          log.push(`✗ ${message}`);
          if (options.stopOnError) break;
        }

        /* The interface is on the same thread as the interpreter. */
        await yieldToUi();
      }
      for (const warning of h.warnings) log.push(`! ${warning}`);
    } finally {
      h.restore();
    }

    return {
      kind: 'quicktest',
      runs: scenes,
      scenes,
      commands: 0,
      choicesTaken: 0,
      endings: 0,
      failures,
      coverage,
      log,
      cancelled,
      ms: Date.now() - started,
    };
  })();

  return { cancel: () => (cancelled = true), done };
}

/**
 * Randomtest: upstream's overrides, mirrored.
 *
 * Line references are to `randomtest.js` in dfabulich/choicescript so the two
 * can be compared when upstream changes.
 */
export function randomtest(gameId: string, options: TestOptions, onProgress: (p: Progress) => void): Runner {
  const log: string[] = [];
  const failures: TestFailure[] = [];
  const started = Date.now();
  let cancelled = false;

  const done = (async (): Promise<TestReport> => {
    const h = await makeHarness(gameId);
    let commands = 0;
    let choicesTaken = 0;
    let endings = 0;
    const usedOptions = new Set<string>();

    try {
      for (let run = 1; run <= options.iterations; run++) {
        if (cancelled) break;
        const random = mulberry32(options.seed + run * 7919);
        const path: string[] = [];
        onProgress({ run, runs: options.iterations, label: `run ${run}`, failures: failures.length });
        if (options.showChoices || options.showText) log.push(`— run ${run} (seed ${options.seed}+${run})`);

        /* Fresh stats and a fresh navigator per playthrough, the way upstream
           starts each iteration. */
        const stats: Record<string, unknown> = {};
        h.stats = stats;
        const proto = h.Scene.prototype as Record<string, unknown>;
        let steps = 0;
        let ended = false;
        let failure: string | null = null;

        /* randomtest.js:374 — a page break is not a stop. */
        proto.page_break = function (this: SceneInstance) {
          (this.paragraph as () => void)();
          this.finished = false;
          (this.resetCheckedPurchases as (() => void) | undefined)?.();
        };
        proto.page_break_advertisement = proto.page_break;

        /* randomtest.js:602 — a string, and sometimes an empty one where the
           story allows it, because allow_blank is a branch worth taking. */
        proto.input_text = function (this: SceneInstance, line: string) {
          const parsed = (this.parseInputText as (l: string) => { variable: string; inputOptions: Record<string, unknown> })(line);
          let input = options.inputText;
          if (parsed.inputOptions.allow_blank && random() < 0.25) input = '';
          (this.set as (s: string) => void)(`${parsed.variable} "${input}"`);
        };

        /* randomtest.js:616 — a number inside the declared range. */
        proto.input_number = function (this: SceneInstance, data: string) {
          (this.rand as (d: string) => void)(data);
        };

        /* randomtest.js:618 — *finish moves to the next scene and carries on. */
        proto.finish = proto.autofinish = function (this: SceneInstance) {
          const nextName = (h.nav as { nextSceneName(n: string): string | null }).nextSceneName(this.name);
          this.finished = true;
          (this.paragraph as () => void)();
          if (!nextName) {
            ended = true;
            return;
          }
          const next = buildScene(h, nextName, (window as unknown as { __csSceneText(n: string): string }).__csSceneText(nextName));
          next.stats = stats;
          (next.execute as () => void)();
        };

        /* randomtest.js:654 — choose, record, continue. */
        proto.choice = function (this: SceneInstance, data: string, isFakeChoice?: boolean) {
          const groups = data ? data.split(/ /) : ['choice'];
          const choiceLine = this.lineNum;
          const allowFallthrough = isFakeChoice === true || !!(this.getVar as (n: string) => unknown)('implicit_control_flow');
          const options_ = (this.parseOptions as (i: unknown, g: string[], a: boolean) => unknown[])(this.indent, groups, allowFallthrough);
          const flat: Record<string, unknown>[] = [];
          (window as unknown as { flattenOptions?(out: unknown[], o: unknown[]): void }).flattenOptions?.(flat, options_);
          const pool = (flat.length ? flat : (options_ as Record<string, unknown>[])).filter((o) => !o.unselectable);
          const usable = pool.length ? pool : (options_ as Record<string, unknown>[]);

          let index = Math.floor(random() * usable.length);
          if (options.avoidUsedOptions) {
            const fresh = usable
              .map((_, i) => i)
              .filter((i) => !usedOptions.has(`${this.name}:${choiceLine}:${i}`));
            if (fresh.length) index = fresh[Math.floor(random() * fresh.length)];
          }
          usedOptions.add(`${this.name}:${choiceLine}:${index}`);
          choicesTaken++;

          const item = usable[index] as Record<string, unknown> & { name?: string };
          if (options.showChoices) {
            log.push(`→ ${String(item.name ?? `option ${index + 1}`).replace(/<[^>]*>/g, '')}  [${this.name}:${choiceLine + 1}]`);
          }
          path.push(`${this.name}:${choiceLine + 1} #${index + 1}`);

          if (!this.temps._choiceEnds) this.temps._choiceEnds = {};
          for (const option of options_ as { line: number }[]) {
            (this.temps._choiceEnds as Record<number, number>)[option.line - 1] = allowFallthrough ? this.lineNum : 0;
          }
          (this.paragraph as () => void)();
          (this.standardResolution as (i: unknown) => void)(item);
        };

        /* The loop guard upstream gets from the process exiting. */
        const originalExecute = proto.execute as (this: SceneInstance) => void;
        proto.execute = function (this: SceneInstance) {
          if (++steps > options.maxSteps) throw new Error(`still running after ${options.maxSteps} commands — a loop, or maxSteps is too low`);
          commands++;
          return originalExecute.call(this);
        };

        try {
          const first = h.sceneList[0] ?? 'startup';
          const scene = buildScene(h, first, (window as unknown as { __csSceneText(n: string): string }).__csSceneText(first));
          scene.stats = stats;
          (scene.execute as () => void)();
          if (ended) endings++;
        } catch (e) {
          failure = (e as Error).message || String(e);
        } finally {
          proto.execute = originalExecute;
        }

        if (failure) {
          failures.push({ where: `run ${run}`, message: failure, path });
          log.push(`✗ ${failure}`);
          if (options.stopOnError) break;
        }
        await yieldToUi();
      }
    } finally {
      h.restore();
    }

    return {
      kind: 'randomtest',
      runs: Math.min(options.iterations, options.iterations),
      scenes: h.sceneList.length,
      commands,
      choicesTaken,
      endings,
      failures,
      coverage: [],
      log,
      seed: options.seed,
      cancelled,
      ms: Date.now() - started,
    };
  })();

  return { cancel: () => (cancelled = true), done };
}
