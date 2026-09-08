/**
 * Types for the ChoiceScript backend contract.
 *
 * Two surfaces, and nothing else:
 *   1. the backend HTTP API   — game files and the engine bundle
 *   2. window.ChoiceScript    — the in-browser game API
 *
 * A front end that type-checks against this file is talking to the documented
 * contract. It should never reach for `Scene`, `printOptions` or the bus.
 */

/* ------------------------------------------------------------------ backend */

/**
 * `[name, visible, points, title, earnedDescription, preEarnedDescription]`
 * — the shape `SceneNavigator.loadAchievements` expects.
 */
export type AchievementTuple = [string, boolean, number, string, string, string];

export interface GameManifest {
  id: string;
  title: string;
  author: string;
  scenes: string[];
  assets: string[];
  skipped: string[];
  source: string;
  uploadedAt: string;
  /**
   * Parsed out of `startup.txt` by the backend.
   *
   * Everything declared in startup.txt is invisible to a restored save, which
   * jumps straight into a later scene. Without the scene list the first
   * `*finish` finds no next scene and ends the game; without achievements
   * `*achieve` throws. Pass both to {@link ChoiceScriptApi.start}.
   */
  sceneList: string[];
  achievements: AchievementTuple[];
}

/* ------------------------------------------------------------------ blocks */

export interface StatRow {
  type: 'text' | 'percent' | 'opposed_pair';
  label: string;
  /** a string for `text` rows, a 0–100 number otherwise */
  value: string | number;
  /** the opposing label on an `opposed_pair` row */
  label2?: string;
  definition?: string;
}

export type Block =
  | { kind: 'text'; html: string; inline?: boolean }
  | { kind: 'linebreak' }
  | { kind: 'image'; source: string; alignment: string; alt: string; invert: boolean }
  | { kind: 'youtube'; slug: string }
  | { kind: 'link'; href: string; anchorText: string }
  | { kind: 'statchart'; rows: StatRow[] }
  | { kind: 'error'; message: string }
  /**
   * An authored `*script` block appended a real DOM node. Mount
   * {@link ChoiceScriptApi.getLegacyNode} at this position — it is not
   * optional; games that draw their own stat bars lose them otherwise.
   */
  | { kind: 'legacyNode'; id: string };

/* ----------------------------------------------------------------- pending */

export interface ChoiceOption {
  /** HTML — bbcode such as `[i]` is already expanded */
  name: string;
  unselectable: boolean;
  suboptions?: ChoiceOption[];
}

export type Pending =
  | { kind: 'choice'; groups: string[]; options: ChoiceOption[] }
  | { kind: 'next'; name: string }
  | {
      kind: 'input';
      long: boolean;
      numeric: boolean;
      allowBlank: boolean;
      minimum?: number;
      maximum?: number;
      step?: number | string;
    }
  | { kind: 'checkboxes'; options: ChoiceOption[]; submitName: string };

/* ------------------------------------------------------------------- state */

export type OverlayName = 'stats' | 'saves' | 'settings' | 'achievements' | 'menu';

export interface ThemeState {
  name: string;
  brightness: 'sepia' | 'black' | 'white' | string;
  typeface: string;
  zoom: number;
  width: string;
  animate: boolean;
  nightMode: boolean;
}

export interface AchievementView {
  name: string;
  title: string;
  description: string;
  points: number;
}

export interface AchievementsState {
  earned: AchievementView[];
  locked: AchievementView[];
  hiddenCount: number;
  score: number;
  totalScore: number;
  total: number;
}

/** Frozen and JSON-serialisable: it never contains functions. */
export interface ChoiceScriptState {
  started: boolean;
  loading: boolean;
  title: string;
  author: string;
  blocks: Block[];
  pending: Pending | null;
  modal: { kind: 'alert' | 'confirm'; message: string } | null;
  overlay: OverlayName | null;
  /** number of screens seen this session; useful as a React key */
  history: number;
  /** the stats screen runs on its own channel and cannot disturb the story */
  statsBlocks: Block[];
  statsPending: Pending | null;
  theme: ThemeState;
  canSave: boolean;
  achievements?: AchievementsState;
}

export interface SaveRecord {
  name?: string;
  scene?: string;
  line?: number;
  savedAt?: number;
  /** derived by the engine from the slot id; arrives as a string */
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface CatalogueEntry {
  id: string;
  label: string;
  hint?: string;
}

export interface StartOptions {
  sceneList?: string[];
  achievements?: AchievementTuple[];
  title?: string;
  author?: string;
}

/** Pass `'stats'` to answer something pending on the stats screen. */
export type Channel = 'stats' | undefined;

export interface ChoiceScriptApi {
  version: string;

  start(options?: StartOptions): ChoiceScriptApi;
  restart(): ChoiceScriptApi;

  getState(): ChoiceScriptState;
  subscribe(fn: (state: ChoiceScriptState) => void): () => void;

  choose(index: number, channel?: Channel): ChoiceScriptApi;
  chooseGroups(path: number[], channel?: Channel): ChoiceScriptApi;
  next(channel?: Channel): ChoiceScriptApi;
  submitInput(value: string, channel?: Channel): ChoiceScriptApi;
  submitCheckboxes(indices: number[], channel?: Channel): ChoiceScriptApi;
  answerModal(ok: boolean): ChoiceScriptApi;

  getLegacyNode(id: string): HTMLElement | null;

  openStats(): ChoiceScriptApi;
  openSaves(): ChoiceScriptApi;
  openSettings(): ChoiceScriptApi;
  openAchievements(): ChoiceScriptApi;
  openMenu(): ChoiceScriptApi;
  closeOverlay(): ChoiceScriptApi;

  listSaves(cb: (saves: SaveRecord[]) => void): ChoiceScriptApi;
  save(name: string, cb?: (ok: boolean, reason?: string) => void): ChoiceScriptApi;
  load(save: SaveRecord): ChoiceScriptApi;

  setTheme(id: string): ChoiceScriptApi;
  setBrightness(v: string): ChoiceScriptApi;
  setTypeface(id: string): ChoiceScriptApi;
  setZoom(z: number): ChoiceScriptApi;
  setWidth(id: string): ChoiceScriptApi;
  setAnimation(on: boolean): ChoiceScriptApi;

  themes(): CatalogueEntry[];
  typefaces(): CatalogueEntry[];
  widths(): CatalogueEntry[];
}

declare global {
  interface Window {
    ChoiceScript?: ChoiceScriptApi;
    /** set before `start()` so the interpreter fetches scenes from the backend */
    Scene?: { baseUrl: string };
    /** namespaces saved games in localStorage */
    storeName?: string;
  }
}
