/*
 * api.js — the public ChoiceScript backend contract.
 *
 * Everything below this file (scene.js, util.js, persist.js, navigator.js) is
 * stock ChoiceScript. Everything above it is a front end. This is the only
 * surface a front end should touch.
 *
 * DESIGN
 *
 * State is pure data. The internal bus parks the engine's continuation
 * callbacks, but they never reach the front end: state describes WHAT the
 * engine is waiting for, and the front end answers with a verb — cs.choose(2)
 * rather than state.pending.resume(option). That keeps every published state
 * snapshot serialisable, loggable and comparable.
 *
 * The API is synchronous, deliberately. The engine is synchronous and
 * push-driven: *page_break parks a continuation and resuming runs straight
 * through to the next screen. Wrapping that in Promises would insert microtask
 * boundaries between screens and change the feel of the thing. Storage calls
 * take callbacks, because storage was always asynchronous.
 *
 * THE ONE IMPURITY
 *
 * Published games run *script blocks that append real DOM nodes into #text.
 * That is authored content executing arbitrary JS, and no API abstracts it
 * away. Such blocks appear in state as { kind: "legacyNode", id }, and the
 * front end MUST mount the element from cs.getLegacyNode(id) at that position.
 * This is why the engine cannot move to a worker or a remote process.
 */

(function (global) {
  'use strict';

  var subscribers = [];
  var lastState = null;
  var started = false;

  /* ---- state projection -------------------------------------------------- */

  function projectOptions(options) {
    if (!options) return [];
    return options.map(function (o) {
      /* option text still carries bbcode; the engine expands it for prose but
       * not for choices, so [i]like this[/i] reached the page verbatim */
      var name = typeof replaceBbCode === 'function' ? replaceBbCode(o.name) : o.name;
      var out = { name: name, unselectable: !!o.unselectable };
      if (o.suboptions) out.suboptions = projectOptions(o.suboptions);
      return out;
    });
  }

  function projectPending(p) {
    if (!p) return null;
    if (p.kind === 'choice') {
      return { kind: 'choice', groups: (p.groups || ['']).slice(),
               options: projectOptions(p.options) };
    }
    if (p.kind === 'next') return { kind: 'next', name: p.name };
    if (p.kind === 'input') {
      return { kind: 'input', long: !!p.long, numeric: !!p.numeric,
               allowBlank: !!p.allowBlank, minimum: p.minimum,
               maximum: p.maximum, step: p.step };
    }
    if (p.kind === 'checkboxes') {
      return { kind: 'checkboxes', options: projectOptions(p.options),
               submitName: typeof p.submitName === 'function'
                 ? p.submitName() : (p.submitName || 'Next') };
    }
    return { kind: p.kind };
  }

  function projectBlocks(blocks) {
    return (blocks || []).map(function (b) {
      var out = { kind: b.kind };
      for (var k in b) {
        if (k === 'kind' || k === 'el') continue;
        out[k] = b[k];
      }
      return out;
    });
  }

  function currentTheme() {
    var body = global.document ? global.document.body : null;
    return {
      name: typeof themeGet === 'function' ? themeGet() : 'paperback',
      brightness: typeof settingsGetBackground === 'function'
        ? settingsGetBackground() : 'sepia',
      typeface: typeof settingsGetFamily === 'function' ? settingsGetFamily() : 'serif',
      zoom: typeof settingsGetZoom === 'function' ? settingsGetZoom() : 1,
      width: typeof settingsGetWidth === 'function' ? settingsGetWidth() : 'default',
      animate: global.animateEnabled !== false,
      nightMode: !!(body && body.classList.contains('nightmode'))
    };
  }

  function buildState() {
    var state = {
      started: started,
      loading: !!bus.loading,
      title: typeof shellGetTitle === 'function' ? shellGetTitle() : '',
      author: typeof shellGetAuthor === 'function' ? shellGetAuthor() : '',
      blocks: projectBlocks(bus.blocks),
      pending: projectPending(bus.pending),
      modal: bus.modal ? { kind: bus.modal.kind, message: bus.modal.message } : null,
      overlay: bus.overlay,
      history: bus.history.length,
      statsBlocks: projectBlocks(bus.statsBlocks),
      statsPending: projectPending(bus.statsPending),
      theme: currentTheme(),
      canSave: typeof shellCanSave === 'function' ? shellCanSave() : false
    };
    if (typeof achievementsData === 'function') {
      try { state.achievements = achievementsData(); } catch (e) { state.achievements = null; }
    }
    return Object.freeze(state);
  }

  function publish() {
    lastState = buildState();
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](lastState); } catch (e) {
        if (global.console) global.console.error(e);
      }
    }
  }

  /* ---- helpers ----------------------------------------------------------- */

  function pendingOf(channel) {
    return channel === 'stats' ? bus.statsPending : bus.pending;
  }

  function requirePending(kind, channel) {
    var p = pendingOf(channel);
    if (!p) throw new Error('ChoiceScript: nothing is waiting for input');
    if (kind && p.kind !== kind) {
      throw new Error('ChoiceScript: expected "' + kind + '" but the engine is waiting for "' + p.kind + '"');
    }
    return p;
  }

  function optionAtPath(options, path) {
    var opts = options, option = null;
    for (var i = 0; i < path.length; i++) {
      if (!opts || !opts[path[i]]) {
        throw new Error('ChoiceScript: no option at index ' + path[i]);
      }
      option = opts[path[i]];
      opts = option.suboptions;
    }
    return option;
  }

  /* ---- the API ----------------------------------------------------------- */

  var api = {
    version: '1.0.0',

    /* --- lifecycle --- */

    start: function (options) {
      if (started) return api;
      started = true;

      /*
       * In the stock layout mygame.js creates these. A front end that loads the
       * engine as a bundle has no mygame.js, so create them here rather than
       * making every front end remember to. ["startup"] is all that is needed:
       * the engine reads the real order from *scene_list in startup.txt.
       */
      if (!global.nav && typeof SceneNavigator === 'function') {
        global.nav = new SceneNavigator(['startup']);
      }
      if (!global.stats) global.stats = {};

      /*
       * *scene_list is declared in startup.txt and tells the engine which
       * scene follows which. A restored save jumps straight into a later
       * scene, so that block never runs: nav._sceneMap stays empty and the
       * first *finish finds no next scene and ends the game with the "play
       * again" prompt. mygame.js bakes the list in for the stock layout; a
       * bundle-based front end passes it here.
       */
      if (options && options.sceneList && options.sceneList.length &&
          global.nav && typeof global.nav.setSceneList === 'function') {
        try { global.nav.setSceneList(options.sceneList.slice()); }
        catch (e) { if (global.console) global.console.warn(e); }
      }

      /*
       * *title is likewise declared in startup.txt, so a restored save leaves
       * the page titled whatever the shell said. Seed it up front; the *title
       * command overwrites this when startup does run.
       */
      if (options && options.title && typeof changeTitle === 'function') {
        changeTitle(options.title);
      }
      if (options && options.author && typeof changeAuthor === 'function') {
        changeAuthor(options.author);
      }

      /*
       * Achievements are declared by *achievement in startup.txt. A restored
       * save jumps straight into a later scene, so those declarations never
       * run and *achieve throws "was not declared as an *achievement in
       * startup". In the stock layout mygame.js pre-loads them; a bundle-based
       * front end passes them to start() instead.
       */
      if (options && options.achievements && global.nav &&
          typeof global.nav.loadAchievements === 'function') {
        try { global.nav.loadAchievements(options.achievements); }
        catch (e) { if (global.console) global.console.warn(e); }
      }

      if (typeof shellEnsureStoreName === 'function') shellEnsureStoreName();
      if (typeof loadPreferences === 'function') loadPreferences();
      if (typeof loadAndRestoreGame === 'function') loadAndRestoreGame();
      publish();
      return api;
    },

    restart: function () {
      if (typeof shellRestart === 'function') shellRestart();
      return api;
    },

    /* --- reading --- */

    getState: function () {
      if (!lastState) lastState = buildState();
      return lastState;
    },

    subscribe: function (fn) {
      if (typeof fn !== 'function') throw new Error('ChoiceScript: subscribe needs a function');
      subscribers.push(fn);
      fn(api.getState());
      return function unsubscribe() {
        var i = subscribers.indexOf(fn);
        if (i !== -1) subscribers.splice(i, 1);
      };
    },

    /* --- answering the engine --- */

    /* single-group choice: cs.choose(2) */
    choose: function (index, channel) {
      var p = requirePending('choice', channel);
      return api.chooseGroups([index], channel);
    },

    /* multi-group choice: cs.chooseGroups([0, 3]) */
    chooseGroups: function (path, channel) {
      var p = requirePending('choice', channel);
      var option = optionAtPath(p.options, path);
      if (option.unselectable) {
        throw new Error('ChoiceScript: that option is not selectable');
      }
      p.resume(option);
      return api;
    },

    next: function (channel) {
      var p = requirePending('next', channel);
      p.resume();
      return api;
    },

    submitInput: function (value, channel) {
      var p = requirePending('input', channel);
      p.resume(value);
      return api;
    },

    submitCheckboxes: function (indices, channel) {
      var p = requirePending('checkboxes', channel);
      p.resume(indices);
      return api;
    },

    answerModal: function (ok) {
      if (!bus.modal) throw new Error('ChoiceScript: no modal is open');
      bus.modal.resume(ok);
      return api;
    },

    /* --- the one impurity: authored DOM nodes --- */

    getLegacyNode: function (id) {
      return typeof legacyGetNode === 'function' ? legacyGetNode(id) : null;
    },

    /* --- screens --- */

    openStats: function () { showStats(); return api; },
    openSaves: function () { showSaves(); return api; },
    openSettings: function () { showMenu(); return api; },
    openAchievements: function () { showAchievements(); return api; },
    openMenu: function () { showMainMenu(); return api; },
    closeOverlay: function () { shellCloseOverlay(); return api; },

    /* --- saves (callbacks: storage was always async) --- */

    listSaves: function (callback) { savesLoad(callback); return api; },
    save: function (name, callback) { savesWrite(name, callback || function () {}); return api; },
    load: function (save) { savesRestore(save); return api; },

    /* --- presentation --- */

    setTheme: function (id) { themeSet(id); return api; },
    setBrightness: function (v) { settingsSetBackground(v); return api; },
    setTypeface: function (v) { settingsSetFamily(v); return api; },
    setZoom: function (z) { setZoomFactor(z); return api; },
    setWidth: function (id) { settingsSetWidth(id); return api; },
    setAnimation: function (on) { settingsSetAnimation(on); return api; },

    themes: function () { return (typeof THEMES !== 'undefined' ? THEMES : []).slice(); },
    typefaces: function () { return (typeof TYPEFACES !== 'undefined' ? TYPEFACES : []).slice(); },
    widths: function () { return (typeof SETTINGS_WIDTHS !== 'undefined' ? SETTINGS_WIDTHS : []).slice(); },

    /* --- escape hatch for anything not yet wrapped --- */
    _internal: function () { return { bus: bus }; }
  };

  /*
   * Every scene must pass through the bridge, or nothing records where the
   * player is and saving reports "nothing to save yet". bridgeAttachScene was
   * previously only called from showStats, so the main game never registered.
   *
   * This wrapper is installed here because api.js loads after scene.js.
   */
  (function attachEveryScene() {
    if (typeof Scene === 'undefined' || Scene.__csAttached) return;
    Scene.__csAttached = true;
    var originalExecute = Scene.prototype.execute;
    Scene.prototype.execute = function () {
      if (typeof bridgeAttachScene === 'function') bridgeAttachScene(this);
      return originalExecute.apply(this, arguments);
    };
  })();

  /* republish whenever the engine moves */
  if (typeof busSubscribe === 'function') busSubscribe(publish);

  global.ChoiceScript = api;
})(typeof window !== 'undefined' ? window : this);
