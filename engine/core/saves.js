/*
 * saves.js — save slots.
 *
 * util.js owns the storage: it writes the engine state under "state<slot>" and
 * keeps a slot list under "save_list". It stores no name, no scene and no real
 * timestamp — getSaves derives `timestamp` by trimming 4 characters off the
 * slot id, which yields a STRING. All the metadata a player actually wants to
 * see is ours to keep, so we write it to a parallel key.
 */

function savesCanSave() {
  return typeof shellCanSave === 'function' ? shellCanSave() : true;
}

function savesLoad(callback) {
  if (typeof getSaves !== 'function' || !savesCanSave()) return callback([]);
  try {
    getSaves(function (list) {
      var saves = (list || []).slice();
      saves.sort(function (a, b) {
        return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
      });
      var pending = saves.length;
      if (!pending) return callback(saves);
      saves.forEach(function (save) {
        window.store.get('savemeta_save' + save.timestamp, function (ok, value) {
          if (ok && value) {
            try {
              var meta = typeof value === 'string' ? jsonParse(value) : value;
              if (meta) {
                save.name = meta.name;
                save.scene = meta.scene;
                save.line = meta.line;
                save.savedAt = meta.savedAt;
              }
            } catch (e) { /* a corrupt meta record must not hide the save */ }
          }
          if (--pending === 0) callback(saves);
        });
      });
    });
  } catch (e) {
    callback([]);
  }
}

function savesWrite(name, callback) {
  if (typeof recordSave !== 'function') return callback(false, 'Saving is not available.');
  if (!savesCanSave()) {
    return callback(false, 'Saving is unavailable: no storage for this game.');
  }

  var snap = typeof bridgeScreenSnapshot !== 'undefined' ? bridgeScreenSnapshot : null;
  if (!snap || !snap.cookie) {
    return callback(false, 'Nothing to save yet.');
  }

  var stamp = new Date().getTime();
  /* upstream derives the timestamp by trimming "save" off the front */
  var slot = 'save' + stamp;

  try {
    /*
     * Write the snapshot cookie directly rather than calling saveCookie, which
     * would recompute from the LIVE scene — one line past the page break.
     */
    window.store.set('state' + slot, snap.cookie, function () {
      recordSave(slot, function () {
        var meta = {
          name: (name && name.trim()) ? name.trim() : savesDefaultName(snap),
          scene: snap.sceneName,
          line: snap.lineNum,
          savedAt: stamp
        };
        window.store.set('savemeta_' + slot, toJson(meta), function () {
          callback(true);
        });
      });
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.error(e);
    callback(false, 'Could not save: ' + (e && e.message ? e.message : 'unknown error'));
  }
}

function savesDefaultName(snap) {
  return savesChapterLabel(snap.sceneName);
}

/* scene file names are snake_case; make them readable */
function savesChapterLabel(sceneName) {
  if (!sceneName) return 'Unknown chapter';
  return String(sceneName)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function savesFormatDate(timestamp) {
  /* timestamp arrives as a STRING from getSaves, so Number() is required */
  var n = Number(timestamp);
  if (!n || isNaN(n)) return '';
  try {
    return new Date(n).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch (e) {
    return new Date(n).toString();
  }
}

function savesRelativeTime(timestamp) {
  var n = Number(timestamp);
  if (!n || isNaN(n)) return '';
  var secs = Math.round((new Date().getTime() - n) / 1000);
  if (secs < 45) return 'just now';
  var units = [
    [60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.35, 'month'], [12, 'year']
  ];
  var value = secs / 60;
  var label = 'minute';
  for (var i = 1; i < units.length; i++) {
    if (value < units[i][0]) break;
    value = value / units[i][0];
    label = units[i][1];
  }
  var rounded = Math.round(value);
  return rounded + ' ' + label + (rounded === 1 ? '' : 's') + ' ago';
}

function savesRestore(save) {
  if (!save || typeof restoreGame !== 'function') return;
  shellCloseOverlay();
  bus.blocks = [];
  bus.pending = null;
  bus.history = [];
  busSet({});
  restoreGame(save, null, true);
}
