/*
 * settings.js — reader preferences and the selectable theme system.
 *
 * Themes are pure CSS: each is a class on <body> that redefines the tokens in
 * theme/tokens.css. Adding one means adding a block to theme/themes.css and an
 * entry to THEMES below. No JavaScript logic per theme.
 *
 * Storage keys match the old UI (preferredBackground, preferredFamily,
 * preferredZoom, preferredAnimation) so a player's settings survive the
 * upgrade; preferredTheme is new.
 */

var THEMES = [
  { id: 'paperback', label: 'Paperback', hint: 'Warm stock, ink indigo' },
  { id: 'terminal',  label: 'Terminal',  hint: 'Phosphor green on black' },
  { id: 'nocturne',  label: 'Nocturne',  hint: 'Deep navy, low glare' },
  { id: 'manuscript',label: 'Manuscript',hint: 'High-contrast parchment' },
  { id: 'newsprint', label: 'Newsprint', hint: 'Flat grey, plain white' },
  { id: 'ember',     label: 'Ember',     hint: 'Dark slate, warm amber' }
];

var TYPEFACES = [
  { id: 'serif',     label: 'Serif',      hint: 'Iowan Old Style, Charter' },
  { id: 'sans',      label: 'Sans',       hint: 'System UI' },
  { id: 'humanist',  label: 'Humanist',   hint: 'Optima, Gill Sans' },
  { id: 'slab',      label: 'Slab',       hint: 'Rockwell, Roboto Slab' },
  { id: 'mono',      label: 'Monospace',  hint: 'Fixed width' },
  { id: 'dyslexia',  label: 'OpenDyslexic', hint: 'Weighted baselines' }
];

var SETTINGS_ZOOMS = [0.875, 1, 1.125, 1.25, 1.5, 2];
var SETTINGS_WIDTHS = [
  { id: 'narrow',  label: 'Narrow',  value: '54ch' },
  { id: 'default', label: 'Default', value: '66ch' },
  { id: 'wide',    label: 'Wide',    value: '78ch' }
];

/* --- theme ---------------------------------------------------------------- */

function themeApply(id) {
  var body = document.body;
  for (var i = 0; i < THEMES.length; i++) body.classList.remove('theme-' + THEMES[i].id);
  if (id && id !== 'paperback') body.classList.add('theme-' + id);
}

function themeGet() {
  for (var i = 0; i < THEMES.length; i++) {
    if (document.body.classList.contains('theme-' + THEMES[i].id)) return THEMES[i].id;
  }
  return 'paperback';
}

function themeSet(id) {
  themeApply(id);
  if (typeof initStore === 'function' && initStore()) window.store.set('preferredTheme', id);
  busSet({});
}

/* --- light / dark scope (kept: authored *script blocks read these) --------- */

function settingsGetBackground() {
  if (document.body.classList.contains('nightmode')) return 'black';
  if (document.body.classList.contains('whitemode')) return 'white';
  return 'sepia';
}

function settingsSetBackground(color) {
  changeBackgroundColor(color);
  busSet({});
}

/* --- typeface ------------------------------------------------------------- */

function settingsGetFamily() {
  for (var i = 0; i < TYPEFACES.length; i++) {
    if (document.body.classList.contains('font-' + TYPEFACES[i].id)) return TYPEFACES[i].id;
  }
  return 'serif';
}

function settingsSetFamily(family, quiet) {
  for (var i = 0; i < TYPEFACES.length; i++) {
    document.body.classList.remove('font-' + TYPEFACES[i].id);
  }
  /* legacy classes some games check */
  document.body.classList.remove('sans');
  document.body.classList.remove('dyslexia');

  if (family && family !== 'serif') document.body.classList.add('font-' + family);
  if (family === 'sans' || family === 'dyslexia') document.body.classList.add(family);

  if (!quiet && typeof initStore === 'function' && initStore()) {
    window.store.set('preferredFamily', family);
  }
  if (!quiet) busSet({});
}

function changeFontFamily(family) { settingsSetFamily(family); }

/* --- text size ------------------------------------------------------------ */

function settingsGetZoom() {
  var current = parseFloat(document.documentElement.style.fontSize) / 100;
  return isNaN(current) ? 1 : current;
}

function setZoomFactor(zoom) {
  document.documentElement.style.fontSize = (zoom * 100) + '%';
  if (typeof initStore === 'function' && initStore()) window.store.set('preferredZoom', zoom);
  busSet({});
}

function changeFontSize(bigger) {
  var current = settingsGetZoom();
  var i = SETTINGS_ZOOMS.indexOf(current);
  if (i === -1) i = 1;
  i += bigger ? 1 : -1;
  if (i < 0) i = 0;
  if (i >= SETTINGS_ZOOMS.length) i = SETTINGS_ZOOMS.length - 1;
  setZoomFactor(SETTINGS_ZOOMS[i]);
}

/* --- line width ----------------------------------------------------------- */

function settingsGetWidth() {
  var w = document.body.style.getPropertyValue('--cs-measure');
  for (var i = 0; i < SETTINGS_WIDTHS.length; i++) {
    if (SETTINGS_WIDTHS[i].value === w) return SETTINGS_WIDTHS[i].id;
  }
  return 'default';
}

function settingsSetWidth(id) {
  var found = null;
  for (var i = 0; i < SETTINGS_WIDTHS.length; i++) {
    if (SETTINGS_WIDTHS[i].id === id) found = SETTINGS_WIDTHS[i];
  }
  if (!found) return;
  document.body.style.setProperty('--cs-measure', found.value);
  if (typeof initStore === 'function' && initStore()) window.store.set('preferredWidth', id);
  busSet({});
}

/* --- motion --------------------------------------------------------------- */

function settingsGetAnimation() { return window.animateEnabled !== false; }

function settingsSetAnimation(enabled) {
  window.animateEnabled = !!enabled;
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredAnimation', enabled ? 1 : 2);
  }
  busSet({});
}
