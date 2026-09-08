/*
 * achievements.js — the *achievement screen.
 *
 * The highest-traffic screen after the reading surface: 330 *achievement
 * declarations and 190 *check_achievements calls across the five fixture games.
 *
 * Three states per achievement:
 *   earned          show title + earnedDescription
 *   locked, visible show title + preEarnedDescription
 *   locked, hidden  do not reveal; count it only
 */

function achievementsData() {
  var list = (window.nav && nav.achievementList) || [];
  var earned = [];
  var locked = [];
  var hiddenCount = 0;
  var score = 0;
  var totalScore = 0;

  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    var a = nav.achievements[name];
    if (!a) continue;
    totalScore += a.points;

    if (nav.achieved[name]) {
      score += a.points;
      earned.push({
        name: name,
        title: a.title,
        description: a.earnedDescription,
        points: a.points,
      });
    } else if (a.visible) {
      locked.push({
        name: name,
        title: a.title,
        description: a.preEarnedDescription,
        points: a.points,
      });
    } else {
      hiddenCount++;
    }
  }

  return {
    earned: earned,
    locked: locked,
    hiddenCount: hiddenCount,
    score: score,
    totalScore: totalScore,
    total: list.length,
  };
}

/*
 * Reads the achievements the player has earned in *other* playthroughs out of
 * storage and merges them in, so the screen reflects lifetime progress rather
 * than just this session.
 */
function checkAchievements(callback) {
  function done() {
    if (callback) callback();
  }
  if (typeof initStore !== 'function' || !initStore()) return safeTimeout(done, 0);

  window.store.get('achieved', function (ok, value) {
    if (ok && value) {
      var stored = typeof value === 'string' ? jsonParse(value) : value;
      if (stored && stored.length) {
        for (var i = 0; i < stored.length; i++) nav.achieved[stored[i]] = true;
      }
    }
    done();
  });
}

/* Persist the earned set so it survives a restart. */
function recordAchievements() {
  if (typeof initStore !== 'function' || !initStore()) return;
  var earned = [];
  for (var name in nav.achieved) {
    if (nav.achieved[name]) earned.push(name);
  }
  window.store.set('achieved', toJson(earned));
}
