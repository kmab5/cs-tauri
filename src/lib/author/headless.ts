/**
 * The headless harness the upstream test runners need.
 *
 * Both of upstream's tools work the same way: they take over
 * `Scene.prototype`, build scenes straight from scene *text*, and walk them
 * with no interface at all — no rendering, no clicking, no waiting. That is why
 * they are fast, and why they can be exhaustive.
 *
 * The previous version of the tests in this app drove the live game through the
 * public API instead: restart, read the pending choice, answer it, wait for the
 * screen. It was the wrong shape. It depended on render timing, it fought the
 * autosave, it could only ever take one path per run, and it visibly played the
 * story while it worked. Upstream's approach has none of those problems, and
 * this is what it needs to run in a browser:
 *
 *  - `Scene`, `SceneNavigator` and `stats` as globals. The engine bundle
 *    already defines the first two; `nav` and `stats` are built per run.
 *  - Scene text by name, which comes from disk rather than from `web/<game>/`.
 *  - Every `Scene.prototype` method the runners replace, restored afterwards,
 *    because the same page keeps playing games after a test finishes.
 *
 * Tests therefore run from the library, with no game open — nothing needs to be
 * playing for a scene to be walked.
 */
import { loadEngine } from '@/lib/library';
import { getScenes } from '@/lib/db';

interface SceneCtor {
  new (name: string, stats: unknown, nav: unknown, debugMode?: boolean): SceneInstance;
  prototype: Record<string, unknown>;
}

export interface SceneInstance {
  name: string;
  lines?: string[];
  labels?: Record<string, number>;
  lineNum: number;
  temps: Record<string, unknown>;
  stats: Record<string, unknown>;
  nav?: unknown;
  loadLines(text: string): void;
  execute(): void;
  [key: string]: unknown;
}

export interface Harness {
  Scene: SceneCtor;
  nav: unknown;
  stats: Record<string, unknown>;
  /** Scene name to its text, as it is on disk. */
  scenes: Record<string, string>;
  /** The order declared by *scene_list in startup.txt. */
  sceneList: string[];
  /** Anything the interpreter warned about rather than failed on. */
  warnings: string[];
  /** Puts every replaced prototype method back. */
  restore(): void;
}

/** The engine's globals, once the bundle has loaded. */
function globals() {
  return window as unknown as {
    Scene?: SceneCtor;
    SceneNavigator?: new (list: string[]) => unknown;
    stats?: Record<string, unknown>;
    nav?: unknown;
    printx?: unknown;
    printParagraph?: unknown;
    println?: unknown;
    print?: unknown;
  };
}

/** *scene_list from startup.txt — the same parse the manifest uses. */
function parseSceneList(startup: string): string[] {
  const lines = startup.split('\n');
  const start = lines.findIndex((l) => /^\s*\*scene_list\b/i.test(l));
  if (start < 0) return [];
  const base = lines[start].search(/\S/);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (lines[i].search(/\S/) <= base) break;
    out.push(lines[i].trim());
  }
  return out;
}

/**
 * Prepares the page to run upstream's tools and hands back a restore function.
 *
 * The prototype is snapshotted *before* anything replaces it. Upstream's files
 * assume a fresh process and never put anything back; this page keeps running
 * afterwards, so putting it back is this harness's job.
 */
export async function makeHarness(gameId: string): Promise<Harness> {
  await loadEngine();
  const g = globals();
  if (!g.Scene || !g.SceneNavigator) throw new Error('the engine bundle did not define Scene');

  const scenes = await getScenes(gameId);
  const startup = Object.entries(scenes).find(([name]) => /^startup$/i.test(name))?.[1] ?? '';
  const declared = parseSceneList(startup);
  const sceneList = declared.length ? declared : Object.keys(scenes);

  const proto = g.Scene.prototype;
  const snapshot = new Map(Object.entries(proto));
  const beforeKeys = new Set(Object.keys(proto));

  const stats: Record<string, unknown> = {};
  const nav = new g.SceneNavigator(sceneList.slice());

  /*
   * Globals, not locals. Upstream's `autotest.js` does exactly this —
   * `nav = new SceneNavigator([...]); stats = {}` at the top level — and the
   * autotester's cloned scenes reach for them by name rather than taking them
   * as arguments. Passing them in was not enough: every scene failed with
   * "stats is not defined", which is the harness's fault and not the game's.
   *
   * A game may be open in the same window, so whatever was there is put back.
   */
  const priorStats = g.stats;
  const priorNav = g.nav;
  g.stats = stats;
  g.nav = nav;

  /* Upstream reads scene text off disk through slurpFile; here it is already in
     memory, so the loader is a lookup. Names arrive in either case. */
  const lookup = (name: string): string => {
    const key = Object.keys(scenes).find((k) => k.toLowerCase() === name.toLowerCase());
    if (!key) throw new Error(`no scene file for "${name}"`);
    return scenes[key];
  };
  (window as unknown as { __csSceneText?: (n: string) => string }).__csSceneText = lookup;

  /*
   * Commands the autotester calls but upstream defines in `autotest.js`, not in
   * the embeddable file: `verifySceneFile` (autotest.js:126), `verifyImage`
   * (:138) and `warning` (:159). There they check the filesystem; here they
   * check the scene map and the asset list, which is the same question asked of
   * a different store.
   *
   * Without them `startup` aborted on its first *goto_scene with
   * "this.verifySceneFile is not a function" — which then made every later
   * scene fail for a second reason, because *create had never run and the stats
   * scene could not find its variables. One missing stub, two misleading
   * errors.
   */
  const warnings: string[] = [];
  proto.verifySceneFile = function (sceneName: string) {
    const known = Object.keys(scenes).some((k) => k.toLowerCase() === String(sceneName).toLowerCase());
    if (!known) throw new Error(`*goto_scene names "${sceneName}" but there is no such scene file`);
  };
  proto.verifyImage = function () {
    /* The archive's images are filtered at import, so anything named here was
       either kept or deliberately dropped; failing the test for a dropped
       decorative image would be a false alarm. */
  };
  proto.warning = function (message: string) {
    warnings.push(String(message));
  };

  /*
   * The runners print through these, and their output is collected from their
   * return values and logs rather than scraped off the page — so they are
   * silenced for the duration.
   *
   * Snapshotted first, because these are how the *engine* renders prose. The
   * first version of this did not restore them, and a game opened after a test
   * run in the same session drew a blank page: every printx call was going into
   * a no-op. Found by the harness playing a game after running the tests.
   */
  const priorPrint = {
    printx: g.printx,
    printParagraph: g.printParagraph,
    println: g.println,
    print: g.print,
  };
  g.printx = g.printParagraph = () => {};
  g.println = g.print = () => {};

  return {
    Scene: g.Scene,
    nav,
    stats,
    scenes,
    sceneList,
    warnings,
    restore() {
      for (const key of Object.keys(proto)) {
        if (!beforeKeys.has(key)) delete proto[key];
      }
      for (const [key, value] of snapshot) proto[key] = value;
      g.stats = priorStats;
      g.nav = priorNav;
      g.printx = priorPrint.printx;
      g.printParagraph = priorPrint.printParagraph;
      g.println = priorPrint.println;
      g.print = priorPrint.print;
      delete (window as unknown as { __csSceneText?: unknown }).__csSceneText;
    },
  };
}

/** A scene built from text, ready to execute. Upstream's own construction. */
export function buildScene(h: Harness, name: string, text: string): SceneInstance {
  const scene = new h.Scene(name, h.stats, h.nav, false);
  scene.loadLines(text);
  return scene;
}
