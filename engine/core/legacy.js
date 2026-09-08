/*
 * legacy.js — back-compat globals for authored *script blocks.
 *
 * The engine respects the render seam. Authored content does not. Shipped games
 * contain *script blocks that do things like:
 *
 *   target = document.getElementById('text');
 *   div = document.createElement("div");
 *   setClass(div, "statBar statLine");
 *   printx("\u00a0" + stats["label_"], labelbox);
 *   if (document.body.classList.contains("nightmode")) { ... }
 *   changeBackgroundColor("black");
 *   window.animateEnabled = false;
 *
 * Every one of those must keep working or shipped games lose their custom stat
 * bars. This file is the contract.
 *
 * The rule: when a `parent` node is supplied, write straight to it (legacy
 * path, bypasses the bus). When it is omitted, route into the bus so the normal
 * renderer handles it.
 */

/* bbcode used by printx/println/printParagraph. Kept identical to ui.js. */
function replaceBbCode(msg) {
  /* *line_break calls println() with no argument when the paragraph buffer is
   * empty (e.g. immediately after an *image). String(undefined) would render
   * the literal text "undefined" on the page. */
  if (msg === null || msg === undefined) return '';
  return String(msg)
    .replace(/\[n\/\]/g, '<br>')
    .replace(/\[b\]/g, '<b>').replace(/\[\/b\]/g, '</b>')
    .replace(/\[i\]/g, '<i>').replace(/\[\/i\]/g, '</i>')
    .replace(/\[url=([^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener">')
    .replace(/\[\/url\]/g, '</a>')
    .replace(/\[c\]/g, '<span class="capsSmall">').replace(/\[\/c\]/g, '</span>');
}

function setClass(element, classString) {
  if (element) element.className = classString;
}

function printx(msg, parent) {
  var html = replaceBbCode(msg);
  if (parent) {
    var span = document.createElement('span');
    span.innerHTML = html;
    while (span.firstChild) parent.appendChild(span.firstChild);
    return;
  }
  busPush({ kind: 'text', html: html, inline: true });
}

function println(msg, parent) {
  if (parent) {
    printx(msg, parent);
    parent.appendChild(document.createElement('br'));
    return;
  }
  busPush({ kind: 'text', html: replaceBbCode(msg), inline: true });
  busPush({ kind: 'linebreak' });
}

function printParagraph(msg, parent) {
  if (msg === '' || msg === null || msg === undefined) return;
  if (parent) {
    var p = document.createElement('p');
    p.innerHTML = replaceBbCode(msg);
    parent.appendChild(p);
    return;
  }
  busPush({ kind: 'text', html: replaceBbCode(msg) });
}

/* Theme scopes. Games flip these directly and also read them back. */
function changeBackgroundColor(color) {
  var body = document.body;
  body.classList.remove('nightmode');
  body.classList.remove('whitemode');
  if (color === 'black') body.classList.add('nightmode');
  else if (color === 'white') body.classList.add('whitemode');
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredBackground', color);
  }
}

function isNightMode() {
  return document.body.classList.contains('nightmode');
}

function getFontFamily() {
  if (document.body.classList.contains('sans')) return 'sans';
  if (document.body.classList.contains('dyslexia')) return 'dyslexia';
  return 'serif';
}

/*
 * A *script block may append a node to #text at any moment, including while the
 * renderer is mid-update. Preact would discard such a node on its next diff, so
 * the renderer owns a dedicated escape-hatch container that it never touches.
 * legacyTextNode() returns it, and app.js keeps `#text` pointing at it.
 */
var legacyTextEl = null;

/*
 * Published games append DOM nodes straight into #text from *script blocks:
 *
 *   target = document.getElementById('text');
 *   div = document.createElement("div");
 *   setClass(div, "statBar statLine");
 *   target.appendChild(div);
 *
 * Preact owns #text, so a raw appendChild lands after everything the renderer
 * has drawn (the node appears at the bottom of the page instead of where the
 * script ran) and then survives the next diff (the node carries over onto the
 * following screen).
 *
 * So we intercept. When the renderer itself is writing, appendChild behaves
 * normally. When anything else calls it, the child becomes a block in the bus
 * at the current position, and the renderer mounts it there.
 */
window.__csRendering = false;

/*
 * Authored nodes are real DOM elements, which cannot live in a serialisable
 * state object. They are kept in a registry and referenced by id, so public
 * state stays pure data and the front end fetches the element deliberately via
 * ChoiceScript.getLegacyNode(id).
 */
var legacyNodeRegistry = {};
var legacyNodeSeq = 0;

function legacyRegisterNode(el) {
  var id = 'legacy-' + (++legacyNodeSeq);
  legacyNodeRegistry[id] = el;
  return id;
}

function legacyGetNode(id) {
  return legacyNodeRegistry[id] || null;
}

function legacyClearNodes() {
  legacyNodeRegistry = {};
}

function legacySetTextNode(el) {
  if (!el || el === legacyTextEl) return;
  legacyTextEl = el;
  if (el.__csPatched) return;
  el.__csPatched = true;

  var nativeAppend = el.appendChild.bind(el);
  var nativeInsert = el.insertBefore.bind(el);

  /*
   * The engine buffers prose in accumulatedParagraph and only emits it on
   * paragraph(). A *script block that appends a node mid-buffer would land
   * BEFORE the text written above it, so flush first.
   */
  function flushParagraph() {
    var scene = window.__csScene;
    if (scene && scene.accumulatedParagraph && scene.accumulatedParagraph.length) {
      try { scene.paragraph(); } catch (e) { /* never block the append */ }
    }
  }

  el.appendChild = function (child) {
    if (window.__csRendering) return nativeAppend(child);
    flushParagraph();
    busPushQuiet({ kind: 'legacyNode', id: legacyRegisterNode(child) });
    return child;
  };
  el.insertBefore = function (child, ref) {
    if (window.__csRendering) return nativeInsert(child, ref);
    flushParagraph();
    busPushQuiet({ kind: 'legacyNode', id: legacyRegisterNode(child) });
    return child;
  };
}

/*
 * The core OWNS #text.
 *
 * Authored *script blocks call document.getElementById('text') directly, so an
 * element with that id must exist and must be intercepted before the engine
 * writes anything. Leaving it to the front end created a race (the engine can
 * run before the first render) and meant an unpatched node received raw
 * appendChild calls — which is why authored stat bars landed at the bottom of
 * the page and survived into the next screen.
 *
 * The host is offscreen. Nothing is ever really appended to it: appendChild is
 * intercepted and the node becomes a positioned block in the bus, which the
 * front end mounts via ChoiceScript.getLegacyNode(id).
 */
function legacyEnsureTextHost() {
  if (legacyTextEl && legacyTextEl.isConnected) return legacyTextEl;
  var el = document.getElementById('text');
  if (!el) {
    el = document.createElement('div');
    el.id = 'text';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
    (document.body || document.documentElement).appendChild(el);
  }
  legacySetTextNode(el);
  return el;
}

function legacyTextNode() {
  return legacyEnsureTextHost();
}
