/**
 * Author-mode instrumentation.
 *
 * The debug console needs to know things the public API does not report: which
 * way an `*if` went, which label a `*goto` jumped to, which scene a
 * `*goto_scene` entered, what a `*set` changed. All of that happens inside the
 * interpreter.
 *
 * So the interpreter is wrapped at runtime rather than edited. `Scene.prototype`
 * methods are replaced with functions that record an event and call through to
 * the originals, which are kept and restored when author mode is switched off.
 * This is the pattern the engine itself documents — `engine/core/stats.js` notes
 * that `randomtest.js` overrides `Scene.prototype.stat_chart` the same way, "so
 * the pattern is sanctioned rather than a fork" — and it means `engine/`, which
 * is generated, stays untouched.
 *
 * One honest caveat, recorded here because it matters when reading a trace:
 * `*if` conditions are re-evaluated to learn their result, since the engine's
 * own `if` returns nothing and communicates through `this.indent`. ChoiceScript
 * conditions are expressions rather than statements, so evaluating one twice
 * has no effect on the story — but a condition calling a function with side
 * effects would be counted twice, and if the evaluation throws the event is
 * recorded with an unknown result rather than being allowed to break the story.
 */

export type EventKind =
  | 'if'
  | 'goto'
  | 'gosub'
  | 'return'
  | 'scene'
  | 'choice'
  | 'pick'
  | 'set'
  | 'create'
  | 'temp'
  | 'achieve'
  | 'error'
  | 'note';

export interface TraceEvent {
  id: number;
  at: number;
  kind: EventKind;
  /** The scene and line it happened on, when the interpreter knows. */
  where?: string;
  text: string;
  /** For `if`: the branch taken. For `pick`: the option index. */
  detail?: string;
}

type Listener = (events: TraceEvent[]) => void;

/** Ring buffer: a long session traces tens of thousands of lines. */
const LIMIT = 2000;
let events: TraceEvent[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
let installed = false;
const originals = new Map<string, unknown>();

export function trace(kind: EventKind, text: string, detail?: string, where?: string) {
  events = [...events.slice(-(LIMIT - 1)), { id: nextId++, at: Date.now(), kind, text, detail, where }];
  for (const fn of listeners) fn(events);
}

export function getTrace(): TraceEvent[] {
  return events;
}

export function clearTrace() {
  events = [];
  for (const fn of listeners) fn(events);
}

export function onTrace(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

interface SceneLike {
  name?: string;
  lineNum?: number;
  labels?: Record<string, number>;
  stats?: Record<string, unknown>;
  temps?: Record<string, unknown>;
  tokenizeExpr(line: string): unknown;
  evaluateExpr(stack: unknown): unknown;
}

type SceneCtor = { prototype: Record<string, unknown> };

function sceneClass(): SceneCtor | null {
  const global = window as unknown as { Scene?: SceneCtor };
  return global.Scene ?? null;
}

const at = (scene: SceneLike) =>
  `${scene.name ?? '?'}:${typeof scene.lineNum === 'number' ? scene.lineNum + 1 : '?'}`;

/** Replace one prototype method, remembering the original. */
function wrap(
  proto: Record<string, unknown>,
  name: string,
  make: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown,
) {
  const original = proto[name];
  if (typeof original !== 'function') return;
  if (!originals.has(name)) originals.set(name, original);
  proto[name] = make(original as (...args: unknown[]) => unknown);
}

export function installInstrumentation() {
  const Scene = sceneClass();
  if (!Scene || installed) return;
  installed = true;
  const proto = Scene.prototype;

  wrap(proto, 'if', (original) =>
    function (this: SceneLike, line: unknown, ...rest: unknown[]) {
      let result = 'unknown';
      try {
        result = String(this.evaluateExpr(this.tokenizeExpr(String(line))));
      } catch {
        /* A condition that throws is the story's problem, not the trace's. */
      }
      trace('if', String(line), result, at(this));
      return original.call(this, line, ...rest);
    },
  );

  wrap(proto, 'goto', (original) =>
    function (this: SceneLike, line: unknown, ...rest: unknown[]) {
      trace('goto', `*goto ${String(line)}`, undefined, at(this));
      return original.call(this, line, ...rest);
    },
  );

  wrap(proto, 'gosub', (original) =>
    function (this: SceneLike, data: unknown, ...rest: unknown[]) {
      trace('gosub', `*gosub ${String(data)}`, undefined, at(this));
      return original.call(this, data, ...rest);
    },
  );

  wrap(proto, 'return', (original) =>
    function (this: SceneLike, ...rest: unknown[]) {
      trace('return', '*return', undefined, at(this));
      return original.call(this, ...rest);
    },
  );

  wrap(proto, 'goto_scene', (original) =>
    function (this: SceneLike, data: unknown, isGosub?: unknown, ...rest: unknown[]) {
      trace('scene', `${isGosub ? '*gosub_scene' : '*goto_scene'} ${String(data)}`, undefined, at(this));
      return original.call(this, data, isGosub, ...rest);
    },
  );

  wrap(proto, 'choice', (original) =>
    function (this: SceneLike, data: unknown, isFake?: unknown, ...rest: unknown[]) {
      trace('choice', isFake ? '*fake_choice' : '*choice', undefined, at(this));
      return original.call(this, data, isFake, ...rest);
    },
  );

  /* Assignments are logged after the fact, so the value recorded is the value
     the interpreter actually stored rather than our guess at the expression. */
  for (const name of ['set', 'create', 'temp'] as const) {
    wrap(proto, name, (original) =>
      function (this: SceneLike, line: unknown, ...rest: unknown[]) {
        const result = original.call(this, line, ...rest);
        const variable = String(line).trim().split(/\s+/)[0]?.toLowerCase();
        const value = variable
          ? (this.temps?.[variable] ?? this.stats?.[variable])
          : undefined;
        trace(
          name,
          `*${name} ${String(line)}`,
          value === undefined ? undefined : `= ${JSON.stringify(value)}`,
          at(this),
        );
        return result;
      },
    );
  }

  trace('note', 'author mode: tracing the interpreter');
}

export function removeInstrumentation() {
  const Scene = sceneClass();
  if (!Scene || !installed) return;
  for (const [name, original] of originals) Scene.prototype[name] = original;
  originals.clear();
  installed = false;
  trace('note', 'author mode: tracing stopped');
}

export const isInstrumented = () => installed;
