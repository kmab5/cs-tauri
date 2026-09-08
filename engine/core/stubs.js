/*
 * stubs.js — no-op replacements for the store, login, ads and platform code.
 *
 * scene.js guards only 9 of its global calls with `typeof` checks; the commerce
 * ones mostly are not guarded. Deleting these functions would hard-crash any
 * game using *purchase, *check_purchase, *restore_purchases, *subscribe or
 * *advertisement. All five fixture games call *check_purchase and *subscribe,
 * so this file is load-bearing on day one.
 *
 * Defaults: everything is owned, nothing costs money, nobody is signed in.
 * Paid chapters simply unlock.
 */

/* The engine expects these callbacks to be async. */
function stubAsync(fn) {
  if (typeof safeTimeout === 'function') return safeTimeout(fn, 0);
  return setTimeout(fn, 0);
}

/* ---- purchases ---------------------------------------------------------- */

function checkPurchase(products, callback) {
  var result = { billingSupported: false };
  var list = String(products || '').split(/\s+/);
  for (var i = 0; i < list.length; i++) {
    if (list[i]) result[list[i]] = true;
  }
  result.everything = true;
  stubAsync(function () { callback(true, result); });
}

function getPrice(product, callback) {
  stubAsync(function () { callback('free'); });
}

function purchase(product, callback) {
  stubAsync(callback);
}

function restorePurchases(product, callback) {
  stubAsync(function () { callback(true); });
}

function isWebPurchaseSupported() { return false; }
function isRestorePurchasesSupported() { return false; }
function printDiscount() {}
function rewriteDiscount() {}

/* ---- accounts ----------------------------------------------------------- */

function isRegistered(callback) {
  if (callback) stubAsync(function () { callback(false); });
  return false;
}

function isRegisterAllowed() { return false; }

function loginForm(target, optional, errorMessage, callback) {
  stubAsync(function () { if (callback) callback(); });
}

function loginDiv() {}

function promptEmailAddress(target, defaultEmail, allowContinue, callback) {
  stubAsync(function () { callback(null); });
}

function getPassword(target, code) { stubAsync(function () { if (code) code(); }); }
function showPassword(target, password) {}

/* ---- marketing ---------------------------------------------------------- */

function subscribe(target, options, callback) {
  stubAsync(function () { if (callback) callback(false); });
}

function subscribeByMail(target, options, callback, code) {
  stubAsync(function () { if (callback) callback(false); });
}

function subscribeLink(e) { if (e && e.preventDefault) e.preventDefault(); return false; }
function isFollowEnabled() { return false; }
function printFollowButtons() {}
function isShareConfigured() { return false; }
function printShareLinks(target, now) {}
function shareAction(e) { if (e && e.preventDefault) e.preventDefault(); return false; }
function moreGames() {}
function kindleButton(target, query, buttonName) {}
function downloadLink(e) { if (e && e.preventDefault) e.preventDefault(); return false; }

/* ---- reviews ------------------------------------------------------------ */

function isReviewSupported() { return false; }
function prepareReviewPrompt() {}
function promptForReview() {}
function getAndroidReviewLink() { return null; }

/* ---- advertising -------------------------------------------------------- */

function isAdvertisingSupported() { return false; }
function isFullScreenAdvertisingSupported() { return false; }

function showFullScreenAdvertisement(callback) {
  stubAsync(function () { if (callback) callback(); });
}

/* *page_break_advertisement and *finish_advertisement route here. With ads
 * disabled the honest behaviour is to continue immediately. */
function showFullScreenAdvertisementButton(buttonName, skipCallback, doneCallback) {
  stubAsync(function () { (doneCallback || skipCallback)(); });
}

function showTicker(target, endTimeInSeconds, finishedCallback) {
  stubAsync(function () { if (finishedCallback) finishedCallback(); });
}

/* ---- platform ----------------------------------------------------------- */

function registerNativeAchievement(name) {}
function isPrerelease() { return false; }
function platformCode() { return 'web'; }
function trackEvent() {}
function getSupportEmail() { return window.supportEmail || 'support@example.com'; }
function isSecureStore() { return false; }
function areSaveSlotsSupported() { return true; }
