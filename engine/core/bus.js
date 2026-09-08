/*
 * bus.js — the single source of UI state.
 *
 * Plain data only. Knows nothing about the DOM and nothing about the engine.
 * bridge.js writes to it; app.js reads from it.
 *
 * Shape:
 *   blocks   array of rendered items on the current screen
 *   pending  what the engine is waiting for, or null while it is still running
 *   loading  true while a scene file is being fetched
 *   modal    { kind: "alert"|"confirm", message, resume }
 *   history  previous screens this session (for the history drawer)
 *   screen   "game" | "stats" | "saves" | "settings" | "achievements"
 *
 * Block kinds:
 *   { kind: "text",      html }
 *   { kind: "linebreak" }
 *   { kind: "image",     source, alignment, alt, invert }
 *   { kind: "youtube",   slug }
 *   { kind: "statchart", rows }
 *   { kind: "link",      href, anchorText }
 *   { kind: "legacyNode", id }        authored *script node, fetched by id
 *
 * Pending kinds:
 *   { kind: "choice",     groups, options, resume }
 *   { kind: "next",       name, resume }
 *   { kind: "input",      inputType, name, minimum, maximum, step, resume }
 *   { kind: "checkboxes", options, submitName, resume }
 */

var bus = {
  blocks: [],
  pending: null,
  loading: false,
  modal: null,
  history: [],
  screen: 'game',

  /* Overlay screens render ABOVE the story without touching it.
   * null | "stats" | "saves" | "settings" | "achievements" | "menu" */
  overlay: null,

  /* The stats screen runs a real engine scene. Its output goes to a separate
   * channel so it can never overwrite, or leak into, the story text. */
  statsMode: false,
  statsBlocks: [],
  statsPending: null,
};

var busSubscribers = [];

function busSubscribe(fn) {
  busSubscribers.push(fn);
  return function busUnsubscribe() {
    var i = busSubscribers.indexOf(fn);
    if (i !== -1) busSubscribers.splice(i, 1);
  };
}

function busNotify() {
  for (var i = 0; i < busSubscribers.length; i++) {
    busSubscribers[i](bus);
  }
}

function busSet(patch) {
  for (var key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) bus[key] = patch[key];
  }
  busNotify();
}

function busPush(block) {
  if (bus.statsMode) bus.statsBlocks.push(block);
  else bus.blocks.push(block);
  busNotify();
}

/*
 * Authored *script blocks can append many DOM nodes in a tight loop (one per
 * stat bar). Notifying on each would re-render the whole tree every time, so
 * these coalesce into a single update on the next microtask.
 */
var busFlushScheduled = false;
function busPushQuiet(block) {
  if (bus.statsMode) bus.statsBlocks.push(block);
  else bus.blocks.push(block);
  if (busFlushScheduled) return;
  busFlushScheduled = true;
  var flush = function () { busFlushScheduled = false; busNotify(); };
  if (typeof Promise !== 'undefined') Promise.resolve().then(flush);
  else setTimeout(flush, 0);
}

function busSetPending(pending) {
  if (bus.statsMode) bus.statsPending = pending;
  else bus.pending = pending;
  busNotify();
}

/* Archive the current screen and start a fresh one. */
function busAdvance() {
  if (bus.statsMode) {
    bus.statsBlocks = [];
    bus.statsPending = null;
    busNotify();
    return;
  }
  if (bus.blocks.length) bus.history.push(bus.blocks);
  bus.blocks = [];
  bus.pending = null;
  busNotify();
}

function busReset() {
  bus.blocks = [];
  bus.pending = null;
  bus.loading = false;
  bus.modal = null;
  bus.history = [];
  bus.screen = 'game';
  bus.overlay = null;
  bus.statsMode = false;
  bus.statsBlocks = [];
  bus.statsPending = null;
  busNotify();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bus: bus, busSet: busSet, busPush: busPush,
    busAdvance: busAdvance, busReset: busReset, busSubscribe: busSubscribe };
}
