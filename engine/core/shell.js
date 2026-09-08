/*
 * shell.js — everything outside the reading surface.
 *
 * Screens are OVERLAYS, not replacements. The story stays mounted underneath
 * and is never cleared, so opening stats or settings mid-scene cannot lose the
 * player's place or strand a parked callback.
 *
 * The stats screen is the tricky one: it runs a real engine scene
 * (choicescript_stats.txt). Its output is routed to bus.statsBlocks — a
 * separate channel — so engine writes during stats can never overwrite the
 * story or leak into the next screen.
 */

/*
 * Title and author are engine facts, so they are held here and published in
 * state. Reading them back out of #title / #author would force every front end
 * to render those exact ids just so the API could find them again.
 */
var shellTitle = '';
var shellAuthor = '';

function changeTitle(title) {
  shellTitle = title || '';
  document.title = shellTitle;
  var el = document.getElementById('title');
  if (el) el.textContent = shellTitle;
  if (typeof busSet === 'function') busSet({});
}

function changeAuthor(author) {
  shellAuthor = /^\s*by\s/i.test(author || '') ? author : (author ? 'by ' + author : '');
  var el = document.getElementById('author');
  if (el) el.textContent = shellAuthor;
  if (typeof busSet === 'function') busSet({});
}

function shellGetTitle() { return shellTitle; }
function shellGetAuthor() { return shellAuthor; }

/* --- overlays ------------------------------------------------------------- */

function shellCloseOverlay() {
  if (bus.statsMode) {
    bus.statsMode = false;
    bus.statsBlocks = [];
    bus.statsPending = null;
  }
  busSet({ overlay: null });
}

function shellOpenOverlay(name) {
  if (bus.overlay === name) return shellCloseOverlay();
  if (bus.statsMode && name !== 'stats') {
    bus.statsMode = false;
    bus.statsBlocks = [];
    bus.statsPending = null;
  }
  busSet({ overlay: name });
}

/*
 * Runs choicescript_stats.txt into the stats channel. Because the story
 * channel is untouched, closing the overlay is just "stop showing it" — there
 * is no state to restore and nothing that can desync.
 */
function showStats() {
  if (bus.overlay === 'stats') return shellCloseOverlay();
  if (!window.stats || !window.stats.scene) return;

  bus.statsMode = true;
  bus.statsBlocks = [];
  bus.statsPending = null;
  busSet({ overlay: 'stats' });

  /*
   * saveSlot "temp" is the engine's own convention for the stats screen (see
   * tempStatWrites in scene.js). Without it the stats scene writes to the MAIN
   * autosave slot, so opening stats overwrites the player's restore point and
   * reloading boots straight into the stats screen as if it were a page.
   */
  var statsScene = new Scene('choicescript_stats', window.stats, window.nav, {
    secondaryMode: 'stats',
    saveSlot: 'temp'
  });
  bridgeAttachScene(statsScene);
  try {
    statsScene.execute();
  } catch (e) {
    if (typeof console !== 'undefined') console.error(e);
    busPush({ kind: 'text', html: 'The stats screen could not be loaded.' });
  }
}

/* *goto from within the stats screen jumps the STORY, so close the overlay. */
function redirectFromStats(sceneName, label, originLine, callback) {
  bus.statsMode = false;
  bus.statsBlocks = [];
  bus.statsPending = null;
  busSet({ overlay: null });
  bus.blocks = [];
  bus.pending = null;

  var scene = new Scene(sceneName, window.stats, window.nav, { saveSlot: '' });
  bridgeAttachScene(scene);
  if (label) scene.gotoLabel = label;
  scene.execute();
  if (callback) callback();
}

function returnFromStats() {
  shellCloseOverlay();
}

function restoreCheckpointFromStats(slot, callback) {
  shellCloseOverlay();
  if (typeof restoreCheckpoint === 'function') restoreCheckpoint(slot, callback);
  else if (callback) callback();
}

function showAchievements(hideNextButton) {
  checkAchievements(function () { shellOpenOverlay('achievements'); });
}

function showSaves() { shellOpenOverlay('saves'); }
function showMenu() { shellOpenOverlay('settings'); }
function showMainMenu() { shellOpenOverlay('menu'); }

function cacheKnownPurchases(knownPurchases) {}

/* --- restart -------------------------------------------------------------- */

function shellRestart() {
  asyncConfirm(
    'Start over from the beginning? Your current progress will be lost.',
    function (ok) {
      if (!ok) return;
      shellCloseOverlay();
      bus.blocks = [];
      bus.pending = null;
      bus.history = [];
      busSet({});
      if (typeof restartGame === 'function') restartGame('none');
    }
  );
}

/* --- boot ----------------------------------------------------------------- */

function shellRecordAchievement() {
  if (typeof recordAchievements === 'function') recordAchievements();
}

/*
 * Favicon: prefer an icon shipped with the game, fall back to the bundled
 * ChoiceScript mark. Probe with an Image so a missing file doesn't leave a
 * broken link in the tab.
 */
function shellSetFavicon() {
  var candidates = ['icon.png', 'favicon.png', 'cover.png'];
  var fallback = '../images/cs-logo-submark.png';

  function apply(href) {
    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  function tryNext(i) {
    if (i >= candidates.length) return apply(fallback);
    var img = new Image();
    img.onload = function () { apply(candidates[i]); };
    img.onerror = function () { tryNext(i + 1); };
    img.src = candidates[i];
  }
  tryNext(0);
}

/*
 * Persistence needs window.storeName. Upstream leaves it null unless the game
 * declares an *ifid, and initStore() bails when it is null — so window.store is
 * never created and saving throws "window.store is undefined". Preferences and
 * achievements die the same way.
 *
 * A game without an *ifid should still be playable and saveable, so derive a
 * stable name. compile.js bakes one in for published builds; this covers the
 * dev server and any shell that was not compiled.
 */
function shellEnsureStoreName() {
  if (window.storeName) return;
  var basis = (window.location && window.location.pathname) || 'mygame';
  var slug = String(basis).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  window.storeName = 'CS-' + (slug || 'mygame');
  if (typeof console !== 'undefined' && console.info) {
    console.info('No *ifid declared; using derived save name "' + window.storeName +
      '". Add an *ifid to startup.txt for a stable one.');
  }
}

/* True when saving is actually possible. */
function shellCanSave() {
  return typeof initStore === 'function' && !!initStore();
}

function shellBoot() {
  shellSetFavicon();
  appMount();
  /* ChoiceScript.start() owns store setup, preferences and game restore */
  if (window.ChoiceScript) window.ChoiceScript.start();
  else {
    shellEnsureStoreName();
    loadPreferences();
    if (typeof loadAndRestoreGame === 'function') loadAndRestoreGame();
  }
}

/* --- preferences ---------------------------------------------------------- */
/* Reuses the existing store keys so a player's settings survive the upgrade. */

function loadPreferences() {
  if (typeof initStore !== 'function' || !initStore()) {
    window.animateEnabled = true;
    return;
  }
  window.store.get('preferredTheme', function (ok, value) {
    if (ok && value) themeApply(value);
  });
  window.store.get('preferredBackground', function (ok, value) {
    if (ok && /^(black|white)$/.test(value)) {
      document.body.classList.add(value === 'black' ? 'nightmode' : 'whitemode');
    }
  });
  window.store.get('preferredFamily', function (ok, value) {
    if (ok && value) settingsSetFamily(value, true);
  });
  window.store.get('preferredZoom', function (ok, value) {
    var z = parseFloat(value);
    if (ok && !isNaN(z)) document.documentElement.style.fontSize = (z * 100) + '%';
  });
  window.store.get('preferredAnimation', function (ok, value) {
    window.animateEnabled = parseFloat(value) !== 2;
  });
}

/* --- error reporting ------------------------------------------------------ */
/*
 * ChoiceScript's own error reporter, called unguarded from util.js safeCall.
 * It lived in the old ui.js. Without it, any engine error throws a secondary
 * TypeError inside the error handler and the game dies with a blank page.
 *
 * The old version used alert() plus an email-support prompt. This renders the
 * error in the page instead, so the player sees what happened and the console
 * keeps the full trace.
 */
window.reportError = function (msg, file, line, column, error) {
  if (window.console) {
    if (error) {
      window.console.error(error);
      if (error.stack) window.console.error(error.stack);
    } else {
      window.console.error(msg);
      if (file) window.console.error('file: ' + file);
      if (line) window.console.error('line: ' + line);
    }
  }
  var text = String(msg === null || msg === undefined ? 'An unknown error occurred.' : msg);
  try {
    if (typeof busPush === 'function') {
      busPush({ kind: 'error', message: text });
      return;
    }
  } catch (e) { /* fall through to alert */ }
  if (typeof alert === 'function') alert(text);
};
