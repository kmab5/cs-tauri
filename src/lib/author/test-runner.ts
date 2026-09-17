/**
 * Quicktest and randomtest.
 *
 * The original ChoiceScript repository ships two testing tools and this engine
 * ships neither — `engine/scene.js` reads `this.quicktest` and
 * `this.randomtest` and sets `stats.choice_randomtest`, but the runners
 * themselves were never part of the bundle. So these are written here, keeping
 * the *idea* of each one from upstream:
 *
 *  - **Quicktest** is deterministic and about coverage of options. Upstream
 *    walks the game trying every option of every choice, reporting the first
 *    error it finds. Here the same goal is reached by one-deviation runs: a
 *    baseline that always takes the first option, then one run per option
 *    discovered, which follows the baseline to that choice, deviates, and
 *    carries on. Every option that the story can reach gets taken at least
 *    once, and a failure names the path that produced it.
 *
 *  - **Randomtest** is stochastic and about volume. Upstream plays the game
 *    many times with a seeded random number generator, and the seed is the
 *    point: a crash found on iteration 47 of seed 12345 can be replayed
 *    exactly. Same here, with the same options upstream exposes — iterations,
 *    seed, avoid used options, show text, show choices.
 *
 * Both drive the real interpreter through the public API rather than
 * re-implementing it, which is the only way the result means anything. That
 * also means they are as slow as the game is, and that the story visibly plays
 * itself while they run.
 *
 * What neither does, and upstream's do: line-level coverage. That needs the
 * interpreter to report which lines it executed, and the honest version of that
 * is a `localCoverage` read rather than a guess — noted as the next step rather
 * than faked with a number that looks like coverage and is not.
 */
import type { ChoiceOption, ChoiceScriptApi, Pending } from '@/lib/choicescript';

export interface TestOptions {
  /** Randomtest: how many playthroughs. */
  iterations: number;
  /** Randomtest: the seed. The same seed replays the same run exactly. */
  seed: number;
  /**
   * Randomtest: prefer options this run has not taken yet, which upstream calls
   * avoidUsedOptions. Finds more of the story per iteration; makes a run less
   * representative of a real reader.
   */
  avoidUsedOptions: boolean;
  /** Record the prose of every screen. Verbose, and the only way to read what happened. */
  showText: boolean;
  /** Record each choice and the option taken. */
  showChoices: boolean;
  /** Give up on a playthrough after this many screens, as a loop guard. */
  maxSteps: number;
  /** Stop the whole run at the first failure instead of collecting them. */
  stopOnError: boolean;
  /** What to type when the story asks for text. */
  inputText: string;
  /** What to enter when the story asks for a number, as a fraction of the range. */
  inputNumber: number;
}

export const DEFAULTS: TestOptions = {
  iterations: 20,
  seed: 1,
  avoidUsedOptions: true,
  showText: false,
  showChoices: true,
  maxSteps: 4000,
  stopOnError: true,
  inputText: 'Quicktest',
  inputNumber: 0.5,
};

export interface TestFailure {
  /** Which playthrough, or which deviation. */
  run: string;
  message: string;
  /** The choices taken to get here, so it can be reproduced by hand. */
  path: string[];
}

export interface TestReport {
  kind: 'quicktest' | 'randomtest';
  runs: number;
  screens: number;
  choicesTaken: number;
  /** Distinct choice sites the run reached, by scene and line. */
  sitesSeen: number;
  /** Options taken at least once, over options offered at those sites. */
  optionsTaken: number;
  optionsSeen: number;
  endings: number;
  failures: TestFailure[];
  log: string[];
  seed?: number;
  cancelled: boolean;
  ms: number;
}

export interface Progress {
  run: number;
  runs: number;
  label: string;
  screens: number;
  failures: number;
}

/** Deterministic PRNG. Upstream uses a seeded generator for the same reason. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The engine renders asynchronously; a driver has to wait for the screen. */
async function settle(cs: ChoiceScriptApi, was: number, ms = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const state = cs.getState();
    if (state.history !== was || state.pending || state.modal) return;
    await sleep(10);
  }
}

function flatten(options: ChoiceOption[], prefix: number[] = []): { path: number[]; option: ChoiceOption }[] {
  /* Nested choices: a path is the option index at each level. */
  return options.flatMap((option, i) => {
    const path = [...prefix, i];
    return option.suboptions?.length
      ? flatten(option.suboptions, path)
      : [{ path, option }];
  });
}

const plain = (html: string) => html.replace(/<[^>]*>/g, '').trim();

/**
 * Identifies a choice by where it is rather than by what it says.
 *
 * Read off the live Scene, so two choices with identical option text at
 * different points in the story are different sites — which is what coverage
 * has to mean.
 */
function siteOf(): string {
  const scene = (window as unknown as { stats?: { scene?: { name?: string; lineNum?: number } } })
    .stats?.scene;
  return `${scene?.name ?? '?'}:${scene?.lineNum ?? '?'}`;
}

interface RunResult {
  screens: number;
  path: string[];
  ended: boolean;
  failure?: string;
}

class Driver {
  /** Choice sites seen, to the option indexes taken there. */
  readonly taken = new Map<string, Set<string>>();
  readonly offered = new Map<string, number>();
  screens = 0;
  cancelled = false;

  constructor(
    private cs: ChoiceScriptApi,
    private options: TestOptions,
    private log: (line: string) => void,
  ) {}

  /**
   * Plays one game to an ending, choosing with `pick`.
   *
   * Errors are collected from two places: the engine's own error blocks, and a
   * thrown exception out of the API. Both are failures; neither should stop the
   * next iteration unless asked.
   */
  async play(pick: (site: string, choices: ReturnType<typeof flatten>, depth: number) => number[]):
    Promise<RunResult> {
    const path: string[] = [];
    let screens = 0;

    try {
      this.cs.restart();
    } catch (e) {
      return { screens, path, ended: false, failure: `restart failed: ${(e as Error).message}` };
    }
    await settle(this.cs, -1);

    for (let step = 0; step < this.options.maxSteps; step++) {
      if (this.cancelled) return { screens, path, ended: false };

      const state = this.cs.getState();

      const error = state.blocks.find((b) => b.kind === 'error');
      if (error) {
        return { screens, path, ended: false, failure: (error as { message: string }).message };
      }

      if (this.options.showText) {
        const text = state.blocks
          .filter((b) => b.kind === 'text')
          .map((b) => plain((b as { html: string }).html))
          .join(' ');
        if (text) this.log(text);
      }

      if (state.modal) {
        /* An *alert or a *confirm: answer it and carry on, the way a reader
           would, rather than treating it as a wall. */
        this.cs.answerModal(true);
        await sleep(20);
        continue;
      }

      const pending: Pending | null = state.pending;
      if (!pending) return { screens, path, ended: true };

      const was = state.history;

      try {
        if (pending.kind === 'next') {
          this.cs.next();
        } else if (pending.kind === 'choice') {
          const choices = flatten(pending.options);
          const site = siteOf();
          this.offered.set(site, Math.max(this.offered.get(site) ?? 0, choices.length));
          const chosen = pick(site, choices, path.length);
          const label = plain(choices.find((c) => String(c.path) === String(chosen))?.option.name ?? '');

          if (!this.taken.has(site)) this.taken.set(site, new Set());
          this.taken.get(site)!.add(String(chosen));
          path.push(`${site} #${chosen.map((n) => n + 1).join('.')}`);
          if (this.options.showChoices) this.log(`→ ${label || `option ${chosen[0] + 1}`}  [${site}]`);

          this.cs.chooseGroups(chosen);
        } else if (pending.kind === 'input') {
          /* The engine flags a numeric input explicitly and carries its own
             bounds — `numeric`, `minimum`, `maximum` — so there is nothing to
             infer. Upstream's randomtest picks the midpoint for the same
             reason: it is inside the range whatever the range is. */
          if (pending.numeric) {
            const min = Number(pending.minimum ?? 0);
            const max = Number(pending.maximum ?? min + 10);
            const value = Math.round(min + (max - min) * this.options.inputNumber);
            this.cs.submitInput(String(value));
            path.push(`input ${value}`);
          } else {
            this.cs.submitInput(this.options.inputText);
            path.push(`input "${this.options.inputText}"`);
          }
        } else if (pending.kind === 'checkboxes') {
          /* Nothing ticked is a legal answer and the cheapest one. */
          this.cs.submitCheckboxes([]);
        } else {
          return { screens, path, ended: true };
        }
      } catch (e) {
        return { screens, path, ended: false, failure: (e as Error).message };
      }

      screens++;
      this.screens++;
      await settle(this.cs, was);
    }

    return {
      screens,
      path,
      ended: false,
      failure: `still going after ${this.options.maxSteps} screens — a loop, or maxSteps is too low`,
    };
  }
}

function summarise(
  kind: TestReport['kind'],
  driver: Driver,
  runs: number,
  endings: number,
  failures: TestFailure[],
  log: string[],
  started: number,
  seed?: number,
): TestReport {
  let optionsTaken = 0;
  let optionsSeen = 0;
  for (const [site, count] of driver.offered) {
    optionsSeen += count;
    optionsTaken += driver.taken.get(site)?.size ?? 0;
  }
  return {
    kind,
    runs,
    screens: driver.screens,
    choicesTaken: [...driver.taken.values()].reduce((n, s) => n + s.size, 0),
    sitesSeen: driver.offered.size,
    optionsTaken,
    optionsSeen,
    endings,
    failures,
    log,
    seed,
    cancelled: driver.cancelled,
    ms: Date.now() - started,
  };
}

export interface Runner {
  cancel(): void;
  done: Promise<TestReport>;
}

/**
 * Randomtest: many playthroughs, seeded.
 *
 * The seed is what makes a failure useful. "Crashed on iteration 47" is a bug
 * report only if iteration 47 can be played again.
 */
export function randomtest(
  cs: ChoiceScriptApi,
  options: TestOptions,
  onProgress: (p: Progress) => void,
): Runner {
  const log: string[] = [];
  const failures: TestFailure[] = [];
  const started = Date.now();
  const driver = new Driver(cs, options, (line) => log.push(line));

  const done = (async () => {
    let endings = 0;
    for (let run = 1; run <= options.iterations; run++) {
      if (driver.cancelled) break;
      /* Seeded per iteration, so iteration 47 is reproducible on its own. */
      const random = mulberry32(options.seed + run * 7919);
      log.push(`— run ${run} (seed ${options.seed}+${run})`);
      onProgress({ run, runs: options.iterations, label: `run ${run}`, screens: driver.screens, failures: failures.length });

      const result = await driver.play((site, choices) => {
        const usable = choices.filter((c) => !c.option.unselectable);
        const pool = usable.length ? usable : choices;
        if (options.avoidUsedOptions) {
          const seen = driver.taken.get(site) ?? new Set();
          const fresh = pool.filter((c) => !seen.has(String(c.path)));
          if (fresh.length) return fresh[Math.floor(random() * fresh.length)].path;
        }
        return pool[Math.floor(random() * pool.length)].path;
      });

      if (result.ended) endings++;
      if (result.failure) {
        failures.push({ run: `run ${run}`, message: result.failure, path: result.path });
        log.push(`✗ ${result.failure}`);
        if (options.stopOnError) break;
      }
    }
    return summarise('randomtest', driver, Math.min(options.iterations, options.iterations), endings, failures, log, started, options.seed);
  })();

  return { cancel: () => (driver.cancelled = true), done };
}

/**
 * Quicktest: deterministic, one deviation per option.
 *
 * Run one baseline taking the first option everywhere, collecting every choice
 * site it meets. Then, for each option not yet taken, replay the baseline's
 * decisions up to that site, take the untaken option there, and continue on the
 * first-option policy — which discovers further sites, which are queued in
 * turn. It ends when there is nothing left untaken, which is upstream's goal
 * stated as a stopping condition.
 */
export function quicktest(
  cs: ChoiceScriptApi,
  options: TestOptions,
  onProgress: (p: Progress) => void,
): Runner {
  const log: string[] = [];
  const failures: TestFailure[] = [];
  const started = Date.now();
  const driver = new Driver(cs, options, (line) => log.push(line));

  const done = (async () => {
    let endings = 0;
    let run = 0;
    /* Each job is "follow these decisions, then deviate here". */
    const queue: { at?: string; take?: number[]; decisions: Map<string, number[]> }[] = [
      { decisions: new Map() },
    ];

    while (queue.length) {
      if (driver.cancelled) break;
      const job = queue.shift()!;
      run++;
      const label = job.at ? `deviate at ${job.at} #${(job.take ?? []).map((n) => n + 1).join('.')}` : 'baseline';
      log.push(`— run ${run}: ${label}`);
      onProgress({ run, runs: run + queue.length, label, screens: driver.screens, failures: failures.length });

      const decisions = new Map(job.decisions);
      const result = await driver.play((site, choices) => {
        if (job.at === site && job.take) {
          decisions.set(site, job.take);
          return job.take;
        }
        const planned = decisions.get(site);
        if (planned) return planned;
        const usable = choices.filter((c) => !c.option.unselectable);
        const first = (usable.length ? usable : choices)[0].path;
        decisions.set(site, first);
        return first;
      });

      if (result.ended) endings++;
      if (result.failure) {
        failures.push({ run: label, message: result.failure, path: result.path });
        log.push(`✗ ${result.failure}`);
        if (options.stopOnError) break;
      }

      /* Anything offered but not yet taken becomes a job, with this run's
         decisions as the route to it. */
      for (const [site, count] of driver.offered) {
        const taken = driver.taken.get(site) ?? new Set();
        for (let i = 0; i < count; i++) {
          if (taken.has(String([i]))) continue;
          if (queue.some((q) => q.at === site && String(q.take) === String([i]))) continue;
          queue.push({ at: site, take: [i], decisions: new Map(decisions) });
        }
      }

      /* The same guard maxSteps is for: a game with combinatorial nesting can
         queue faster than it drains. */
      if (run >= options.maxSteps) {
        log.push(`stopped after ${run} runs — raise maxSteps to go further`);
        break;
      }
    }

    return summarise('quicktest', driver, run, endings, failures, log, started);
  })();

  return { cancel: () => (driver.cancelled = true), done };
}
