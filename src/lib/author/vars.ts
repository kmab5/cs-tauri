/**
 * The game's variables, for god mode.
 *
 * ChoiceScript keeps permanent variables in a global `stats` object and the
 * current scene's temporaries in `stats.scene.temps` (`engine/scene.js:29`,
 * `:72`). Both are plain objects, so reading and writing them is the whole of
 * it — there is no API to add, and no engine change.
 *
 * Two views, because "all the variables" and "the stats the author chose to
 * show" are different questions:
 *
 *  - **Sheet**: the rows of `*stat_chart` in `choicescript_stats.txt`, with the
 *    author's display label beside the variable name. This is the character
 *    sheet as the author designed it.
 *  - **All**: every key in `stats` and every temp, including the engine's own
 *    bookkeeping, which is hidden behind a toggle because a list with
 *    `choice_reuse` and `_looplimit` in it buries the ten variables that matter.
 */

export type VarScope = 'stat' | 'temp';

export interface GameVar {
  name: string;
  value: unknown;
  scope: VarScope;
  /** The author's label from *stat_chart, when the variable appears in one. */
  label?: string;
  /** Engine bookkeeping rather than the author's own variable. */
  internal: boolean;
  /** Named by the stats scene but never created by the game. */
  missing?: boolean;
}

/** Keys the engine keeps in `stats` for itself. */
const INTERNAL = new Set([
  'scene',
  'choice_reuse',
  'choice_user_restored',
  'choice_randomtest',
  'choice_quicktest',
  'choice_purchased',
  'choice_purchase_supported',
  'choice_release_date',
  'choice_prerelease',
  'choice_title',
  'choice_author',
  'choice_subscribe_allowed',
  'choice_save_allowed',
  'choice_time_stamp',
  'choice_restore_purchases_allowed',
  'choice_registered',
  'choice_registered_email',
  'implicit_control_flow',
  'sceneName',
  'testEntryPoint',
]);

const isInternal = (name: string) => INTERNAL.has(name) || name.startsWith('_');

interface SceneLike {
  temps?: Record<string, unknown>;
  stats?: Record<string, unknown>;
}

function statsObject(): Record<string, unknown> | null {
  const global = window as unknown as { stats?: Record<string, unknown> };
  return global.stats ?? null;
}

function sceneObject(): SceneLike | null {
  const stats = statsObject();
  return (stats?.scene as SceneLike | undefined) ?? null;
}

/**
 * Variable name to display label, parsed from the stats scene's *stat_chart
 * blocks. Indented rows under the command, one variable per row, with an
 * optional label after it.
 */
export interface StatsScene {
  /** Variable name to the author's display label, from *stat_chart rows. */
  labels: Map<string, string>;
  /** Every variable the stats scene mentions anywhere, in first-seen order. */
  referenced: string[];
}

/** Reserved words that appear in conditions but are not variables. */
const KEYWORDS = new Set([
  'and', 'or', 'not', 'true', 'false', 'modulo', 'round', 'length', 'auto',
  'if', 'elseif', 'elsif', 'else', 'selectable_if', 'set', 'temp', 'create',
  'hide_reuse', 'disable_reuse', 'allow_reuse', 'fairmath', 'timestamp',
]);

/**
 * Everything the stats scene touches, not just its chart.
 *
 * Reading only `*stat_chart` was the bug: a stats screen is a scene, and most
 * of them do far more than draw a chart. They branch on variables with `*if`,
 * interpolate them with `${}` and `@{}`, compute intermediates with `*temp`,
 * and describe them in prose. None of that appeared in god mode's sheet, which
 * is why variables the author was plainly using were missing from it.
 *
 * Order matters and is preserved: chart rows first, in the author's own order,
 * then everything else as the scene mentions it. The sheet then reads the way
 * the author wrote it.
 */
export function parseStatsScene(text: string): StatsScene {
  const labels = parseStatChart(text);
  const referenced: string[] = [...labels.keys()];
  const add = (name: string) => {
    const key = name.toLowerCase();
    if (!key || KEYWORDS.has(key) || /^\d/.test(key)) return;
    if (!referenced.includes(key)) referenced.push(key);
  };

  for (const line of text.split('\n')) {
    /* ${var} and @{var …} interpolations, including ${var[i]}. */
    for (const m of line.matchAll(/[$@]!*!*\{\s*([A-Za-z_][A-Za-z0-9_]*)/g)) add(m[1]);

    const command = /^\s*\*([a-z_]+)\s*(.*)$/i.exec(line);
    if (!command) continue;
    const [, verb, rest] = command;

    /* Expressions: every identifier in them is a variable or a keyword. */
    if (/^(if|elseif|elsif|selectable_if|set|temp|create|rand|input_text|input_number|print|stat_chart|goto_random_scene)$/i.test(verb)) {
      for (const m of rest.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) add(m[1]);
    }
  }

  return { labels, referenced };
}

export function parseStatChart(statsScene: string): Map<string, string> {
  const labels = new Map<string, string>();
  const lines = statsScene.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\*stat_chart\b/i.test(lines[i])) continue;
    const base = lines[i].search(/\S/);

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const indent = line.search(/\S/);
      if (indent <= base) break;
      /* `percent strength Strength` · `text name Name` · `opposed_pair x`
         — the type, the variable, then whatever label the author wrote. */
      const match = /^\s*(percent|text|opposed_pair|graphic)\s+(\S+)(?:\s+(.*))?$/i.exec(line);
      if (!match) continue;
      const [, , variable, label] = match;
      labels.set(variable.toLowerCase(), (label ?? variable).trim());
    }
  }
  return labels;
}

export function readVars(labels: Map<string, string>): GameVar[] {
  const stats = statsObject();
  const scene = sceneObject();
  const out: GameVar[] = [];

  for (const [name, value] of Object.entries(stats ?? {})) {
    if (name === 'scene') continue;
    out.push({
      name,
      value,
      scope: 'stat',
      label: labels.get(name.toLowerCase()),
      internal: isInternal(name),
    });
  }
  for (const [name, value] of Object.entries(scene?.temps ?? {})) {
    out.push({
      name,
      value,
      scope: 'temp',
      label: labels.get(name.toLowerCase()),
      internal: isInternal(name),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The variables the stats scene uses, in the order it uses them.
 *
 * A name the scene mentions but the game has not created yet is listed too,
 * with no value — that is information, not noise: a stats screen referring to a
 * variable that does not exist is a bug the author wants to see.
 */
export function readSheet(scene: StatsScene): GameVar[] {
  const all = readVars(scene.labels);
  const byName = new Map(all.map((v) => [v.name.toLowerCase(), v]));

  return scene.referenced.map(
    (name) =>
      byName.get(name) ?? {
        name,
        value: undefined,
        scope: 'stat' as VarScope,
        label: scene.labels.get(name),
        internal: false,
        missing: true,
      },
  );
}

/** A string the engine is using as a number — `*create warmth 40` gives "40". */
const numericString = (v: unknown): boolean =>
  typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v));

/**
 * Writes a value back in the representation the engine is already using.
 *
 * ChoiceScript is loosely typed and *stores numbers as strings*: `*create
 * warmth 40` leaves `stats.warmth === "40"`, because `tokenizeExpr` hands back
 * the literal and the comparison operators coerce. Writing a real `40` there
 * would be a different shape from everything the interpreter itself writes, so
 * the existing representation is preserved — a numeric string stays a numeric
 * string.
 *
 * What is *not* preserved is nonsense: a stat the engine holds as a number, in
 * either representation, refuses a non-numeric input rather than quietly
 * turning `*if warmth > 50` into a string comparison. Found by a test
 * asserting the wrong thing, which turned out to be the more useful outcome.
 */
export function writeVar(name: string, scope: VarScope, input: string): unknown {
  const stats = statsObject();
  const scene = sceneObject();
  const bag = scope === 'temp' ? scene?.temps : stats;
  if (!bag) throw new Error('the game is not running');

  const current = bag[name];
  const raw = input.trim();
  let value: unknown = input;

  if (typeof current === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${name} holds a number`);
    value = n;
  } else if (numericString(current)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${name} holds a number`);
    /* Back as a string, the way the interpreter stores it. */
    value = raw;
  } else if (typeof current === 'boolean') {
    const t = raw.toLowerCase();
    if (!['true', 'false'].includes(t)) throw new Error(`${name} is true or false`);
    value = t === 'true';
  } else if (typeof current === 'string' && /^(true|false)$/i.test(current)) {
    const t = raw.toLowerCase();
    if (!['true', 'false'].includes(t)) throw new Error(`${name} is true or false`);
    value = t;
  }

  bag[name] = value;
  return value;
}
