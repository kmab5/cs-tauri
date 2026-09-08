/*
 * bridge.js — implements the globals scene.js calls, in terms of the bus.
 *
 * Every engine call becomes one of two things:
 *   an APPEND   — add a block to the current screen
 *   a SUSPEND   — park the engine's resume callback in bus.pending
 *
 * The engine is push-driven and callback-based. Parking the callback is what
 * converts it into something a declarative renderer can drive: the view reads
 * bus.pending and calls bus.pending.resume(answer) when the player acts.
 *
 * scene.js is NOT modified. Exactly one prototype override exists, in
 * screens/stats.js, for *stat_chart.
 */

/* ---- loading ------------------------------------------------------------ */

function startLoading() {
  busSet({ loading: true });
}

function doneLoading() {
  busSet({ loading: false });
}

/* ---- text --------------------------------------------------------------- */
/* printx / println / printParagraph live in legacy.js because they carry the
 * dual parent/bus behaviour that authored *script blocks depend on. */

function printLine(msg, parent) {
  println(msg, parent);
}

/* ---- screen lifecycle --------------------------------------------------- */

/*
 * clearScreen archives the current screen and starts a new one, then runs the
 * engine continuation. The old implementation cloned container1.innerHTML into
 * a second container, applied translateY(pageYOffset) and called scrollTo(0,1)
 * to hide mobile URL bars. The crossfade in app.js replaces all of that.
 */
/*
 * Position snapshot for saving.
 *
 * printLoop is `for (; !finished && lineNum < len; lineNum++)`, so the
 * increment still runs when *page_break sets finished — scene.lineNum ends up
 * one line PAST the page break. Saving that live value makes a restored game
 * resume one step ahead of where the player was.
 *
 * So we snapshot at the start of each screen instead. computeCookie serialises
 * stats and temps into a string, so this is a true point-in-time copy, not a
 * live reference that keeps mutating as the screen plays out.
 */
var bridgeScreenSnapshot = null;

function bridgeSnapshotScreen() {
  var scene = window.__csScene;
  if (!scene || typeof computeCookie !== 'function') return;
  try {
    bridgeScreenSnapshot = {
      cookie: computeCookie(scene.stats, scene.temps, scene.lineNum, scene.indent),
      sceneName: scene.name,
      lineNum: scene.lineNum,
      savedAt: new Date().getTime()
    };
  } catch (e) { /* a snapshot is never worth breaking the game for */ }
}

function clearScreen(code) {
  busAdvance();
  if (!bus.statsMode) bridgeSnapshotScreen();
  if (typeof safeCall === 'function') safeCall(null, code);
  else if (code) code();
}

/* The iOS page-curl animation. The crossfade supersedes it. */
function curl() {}

function focusFirst() {
  if (typeof appFocusFirst === 'function') appFocusFirst();
}

function setButtonTitles() {}

function printFooter() {}

/* ---- choices ------------------------------------------------------------ */

/*
 * groups  — e.g. [""] for a plain *choice, or ["weapon","armor"] for a
 *           multi-column *choice. Sub-options hang off option.suboptions.
 * options — [{ name, unselectable, suboptions? }, ...]
 */
function printOptions(groups, options, callback) {
  if (!options) throw new Error('undefined options');
  if (!options.length) throw new Error('no options');

  busSetPending({
      kind: 'choice',
      groups: groups,
      options: options,
      resume: function (option) {
        if (typeof safeCall === 'function') safeCall(null, function () { callback(option); });
        else callback(option);
      },
  });
}

/*
 * *page_break is the most-used command in the corpus (3,505 uses across the
 * five fixture games), so this is the hottest path in the file.
 */
function printButton(name, parent, isSubmit, code) {
  busSetPending({
      kind: 'next',
      name: name,
      resume: function () {
        if (typeof safeCall === 'function') safeCall(null, code);
        else if (code) code();
      },
  });
  return null;
}

/* ---- text input --------------------------------------------------------- */

function printInput(target, inputOptions, callback, minimum, maximum, step) {
  inputOptions = inputOptions || {};
  busSetPending({
      kind: 'input',
      long: !!inputOptions.long,
      numeric: !!inputOptions.numeric,
      allowBlank: !!inputOptions.allow_blank,
      minimum: minimum,
      maximum: maximum,
      step: step || 'any',
      resume: function (value) {
        if (typeof safeCall === 'function') safeCall(null, function () { callback(value); });
        else callback(value);
      },
  });
}

function printCheckboxes(options, submitButtonNameFunction, callback) {
  busSetPending({
      kind: 'checkboxes',
      options: options,
      submitName: typeof submitButtonNameFunction === 'function'
        ? submitButtonNameFunction
        : function () { return 'Next'; },
      resume: function (selected) {
        if (typeof safeCall === 'function') safeCall(null, function () { callback(selected); });
        else callback(selected);
      },
  });
}

/* ---- media -------------------------------------------------------------- */

function printImage(source, alignment, alt, invert) {
  busPush({
    kind: 'image',
    source: source,
    alignment: alignment || 'none',
    alt: alt || '',
    invert: !!invert,
  });
}

/* *kindle_image degrades to a normal image on the web. */
function kindleImage(source, alignment, alt, invert) {
  printImage(source, alignment, alt, invert);
}

function printYoutubeFrame(slug) {
  busPush({ kind: 'youtube', slug: slug });
}

function playSound(source) {
  try {
    var audio = new Audio(source);
    audio.play().catch(function () {});
  } catch (e) { /* autoplay blocked; not fatal */ }
}

function printLink(target, href, anchorText, onclick) {
  if (target && target.appendChild) {
    var a = document.createElement('a');
    a.setAttribute('href', href);
    a.appendChild(document.createTextNode(anchorText));
    if (onclick) a.onclick = onclick;
    target.appendChild(a);
    return a;
  }
  busPush({ kind: 'link', href: href, anchorText: anchorText });
  return null;
}

/* ---- dialogs ------------------------------------------------------------ */

function asyncAlert(message, callback) {
  busSet({
    modal: {
      kind: 'alert',
      message: message,
      resume: function () {
        busSet({ modal: null });
        if (callback) callback();
      },
    },
  });
}

function asyncConfirm(message, callback) {
  busSet({
    modal: {
      kind: 'confirm',
      message: message,
      resume: function (ok) {
        busSet({ modal: null });
        if (callback) callback(ok);
      },
    },
  });
}

function preventDefault(event) {
  if (event && event.preventDefault) event.preventDefault();
  return false;
}

/* ---- achievements ------------------------------------------------------- */

var bridgeToasts = [];

function achieve(name, title, description) {
  bridgeToasts.push({ name: name, title: title, description: description });
  if (typeof shellRecordAchievement === 'function') shellRecordAchievement();
  if (typeof appToast === 'function') appToast(title, description);
}

/* ---- scene wiring ------------------------------------------------------- */

/*
 * scene.js resolves its output target as:
 *   var target = this.target; if (!target) target = document.getElementById('text');
 * Assigning scene.target to a node the renderer owns means those fallbacks
 * never fire, which is why scene.js needs no edits.
 */
function bridgeAttachScene(scene) {
  if (scene) {
    scene.target = legacyTextNode();
    /* the opening screen has no preceding clearScreen */
    if (!bridgeScreenSnapshot && scene.name !== 'choicescript_stats') {
      window.__csScene = scene;
      bridgeSnapshotScreen();
    }
    /* legacy.js needs the active scene to flush buffered prose before
     * inserting a node appended by an authored *script block */
    window.__csScene = scene;
  }
  return scene;
}
