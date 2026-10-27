// FFF Skin Tools — shared module for the query-string-routed single-file site.
// Loaded before the page's own <script type="text/x-dc"> block.
//
// Every screen is now a genuinely real page load (index.html?screen=...&key=...&item=...),
// which is what actually fixes the AdSense problem — but it also means nothing in `this.state`
// survives between screens on its own anymore. This module is the one thing that DOES persist
// (coins/uid/region/unlocked, via localStorage) plus the ad helpers.
//
// v1.10: adBreak() must be called as part of a user action (Google's own requirement). Firing
// it from componentDidMount — a page-load lifecycle hook, not a live user gesture — silently
// broke BOTH the interstitial and the rewarded ad (the rewarded ad's own, genuinely valid click
// was very likely getting caught by the same page's ad-placement context having already been
// flagged non-compliant by the earlier bad call). Fix: only ever call adBreak() synchronously
// inside an actual click handler, and defer the real navigation until it resolves.

window.AppShared = (function () {
  const STATE_KEY = 'fffSkinToolsState';
  const DEFAULT_STATE = { coins: 0, unlocked: [], uid: '', region: 'India' };

  function getState() {
    try {
      return Object.assign({}, DEFAULT_STATE, JSON.parse(localStorage.getItem(STATE_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, DEFAULT_STATE);
    }
  }
  function setState(patch) {
    const next = Object.assign(getState(), patch);
    try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable — fail silently */ }
    return next;
  }

  // Real page loads mean a genuinely clean DOM every time — no accumulation of stale <ins>
  // tags across "screens" to worry about.
  // --- Campaign attribution --------------------------------------------------------------
  // Reads 'campaign', 'adset' and 'channel' from the landing URL and keeps them for the rest
  // of the visit. Persistence is required, not optional: every screen change on this site is a
  // REAL page load, so without it the params would be dropped the moment someone navigates and
  // every ad after the landing screen would go untagged.
  //
  // sessionStorage rather than localStorage on purpose. It survives page loads within the tab
  // but clears when the tab closes, so a campaign can never be credited for an unrelated
  // organic visit days later. localStorage would silently inflate campaign revenue over time.
  var ATTR_KEY = 'fff_attr';
  var attrCache = null;

  function readParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }

  function getAttribution() {
    if (attrCache) return attrCache;
    // The head script already parsed and validated this before the AdSense loader was injected
    // (it has to, so the H5 channel can ride on the script tag). Reuse its result so there is
    // one source of truth. The logic below is only a fallback if that script didn't run.
    if (window.__fffAttr && typeof window.__fffAttr === 'object') {
      attrCache = {
        campaign: window.__fffAttr.campaign || '',
        adset: window.__fffAttr.adset || '',
        channel: window.__fffAttr.channel || ''
      };
      return attrCache;
    }
    var fromUrl = {
      // UTM names accepted as fallbacks, mirroring the head script so both paths agree.
      campaign: readParam('campaign') || readParam('utm_campaign'),
      adset: readParam('adset') || readParam('utm_content') || readParam('utm_term'),
      channel: readParam('channel')
    };
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || '{}') || {}; } catch (e) {}

    // A fresh campaign link on this load re-attributes the session; otherwise carry what we had.
    var a = (fromUrl.campaign || fromUrl.channel)
      ? fromUrl
      : { campaign: stored.campaign || '', adset: stored.adset || '', channel: stored.channel || '' };

    // AdSense channel IDs are numeric, with '+' separating multiple. Note a '+' in a query
    // string decodes to a SPACE, so channel=111+222 arrives here as "111 222" — normalise any
    // run of spaces or plusses back to a single '+' so ad ops can write it the natural way.
    a.channel = String(a.channel).trim().replace(/[\s+]+/g, '+');
    // Anything that isn't digits-and-plus is dropped rather than written into a DOM attribute,
    // since this value comes straight off the URL and is attacker-controllable.
    if (!/^[0-9]{1,32}(\+[0-9]{1,32})*$/.test(a.channel)) a.channel = '';

    if (fromUrl.campaign || fromUrl.channel) {
      try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(a)); } catch (e) {}
    }
    attrCache = a;
    return a;
  }

  // The Bottom slot is lazy-loaded: requested only once the user scrolls near it, so it isn't
  // served to visitors who never reach it (better viewability). Every other slot is requested
  // straight away.
  var LAZY_AD_SLOT = '7202099488';
  var LAZY_MARGIN = '300px 0px'; // start the request this far before the slot reaches the screen

  function requestAd(el) {
    if (el.getAttribute('data-ad-fill-requested')) return;
    try {
      // Must be set BEFORE push() — the attribute is read as part of the ad request, so
      // setting it afterwards would have no effect on reporting.
      var channel = getAttribution().channel;
      if (channel) el.setAttribute('data-ad-channel', channel);
      el.setAttribute('data-ad-fill-requested', '1');
      // push({}) fills the first not-yet-filled <ins> on the page. The Top slot always comes
      // before the Bottom slot in the markup, so the deferred push lands on the Bottom slot.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* AdSense script not loaded yet, or blocked (e.g. ad blocker) — fail silently */ }
  }

  function fillAds() {
    var lazy = [];
    // Only our own slots (each sits in a .fff-ad wrapper). Auto ads insert their own
    // ins.adsbygoogle elements and fill them themselves; pushing for those as well sends extra
    // requests, and a spare push({}) would fill the Bottom slot early, defeating the lazy load.
    document.querySelectorAll('.fff-ad > ins.adsbygoogle').forEach(el => {
      if (el.getAttribute('data-ad-slot') === LAZY_AD_SLOT) lazy.push(el);
      else requestAd(el);
    });
    if (!lazy.length) return;
    if (!('IntersectionObserver' in window)) { lazy.forEach(requestAd); return; } // very old browsers: load as before
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        adLog('bottom slot near viewport — requesting ad');
        requestAd(entry.target);
      });
    }, { rootMargin: LAZY_MARGIN });
    lazy.forEach(el => observer.observe(el));
  }

  // Calls fillAds() once the page has fully loaded AND at least one full render/layout cycle
  // has completed — document.readyState === 'complete' alone doesn't strictly guarantee the
  // browser has actually finished laying out the page at that exact synchronous point, which
  // is a plausible cause of the intermittent "No slot size for availableWidth=0" error (the ad
  // slot's container briefly resolving to 0 width right when push() is called). A double
  // requestAnimationFrame is the standard way to guarantee a real paint has happened first.
  function fillAdsWhenReady() {
    const afterPaint = () => requestAnimationFrame(() => requestAnimationFrame(fillAds));
    if (document.readyState === 'complete') {
      afterPaint();
    } else {
      window.addEventListener('load', afterPaint, { once: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Non-rewarded interstitial ("blanket" ad break) on navigation.
  //
  // Why the previous version never showed an ad:
  //   1. A blind setTimeout(go, 2500) fired REGARDLESS of whether an ad was
  //      playing. A real interstitial takes longer than 2.5s (the user has to
  //      view/dismiss it), so even a successfully-served ad got destroyed by
  //      navigating away mid-playback. The timeout has to distinguish "no ad is
  //      coming" from "an ad is on screen right now" — that's what beforeAd is for.
  //   2. adBreakDone receives a placementInfo argument whose breakStatus says
  //      exactly why no ad showed (noAdPreloaded / frequencyCapped / timeout /
  //      ignored / dismissed / viewed / error / notReady / other). It was being
  //      discarded, so there was no way to tell a policy/fill decision apart from
  //      a code bug. It's now logged.
  //   3. Every screen is a REAL page load in this app, so each page starts a brand
  //      new ad-placement session with nothing preloaded. Clicking a few seconds
  //      later then asks for a break that was never fetched. adConfig now sets
  //      preloadAdBreaks:'on' so Google starts fetching a break at page load.
  //
  // Timing model: wait a short window to see if an ad even starts (beforeAd). If
  // it doesn't, navigate immediately — no ad was coming. If it does, cancel that
  // window and allow a long one so the ad can actually play to completion.
  // Navigation is never blocked indefinitely no matter what the ad script does.
  var NO_AD_MS = 1200;   // "is an ad even coming?" window
  var AD_PLAY_MS = 30000; // safety net once an ad is genuinely on screen

  // Ad diagnostics are opt-in rather than always-on: add ?addebug=1 to any URL to turn the
  // [ads] logging back on (it survives navigation because the flag rides in the query string,
  // which is also how routing works here). Off by default so production consoles stay clean.
  var AD_DEBUG = /[?&]addebug=1/.test(location.search);
  function adLog() {
    if (!AD_DEBUG) return;
    try { console.log.apply(console, ['[ads]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // Runs an interstitial opportunity, then calls onDone() exactly once.
  function runNavInterstitial(label, onDone) {
    var done = false;
    var timer = null;
    function finish(why) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      adLog(label, '-> continuing:', why);
      onDone();
    }
    if (typeof adBreak !== 'function') { finish('adBreak() unavailable'); return; }

    timer = setTimeout(function () { finish('no ad started within ' + NO_AD_MS + 'ms'); }, NO_AD_MS);

    try {
      adBreak({
        type: 'next',
        name: label,
        // Fires only when an ad is actually about to take over the screen. This is
        // the signal that we must NOT navigate yet.
        beforeAd: function () {
          adLog(label, 'beforeAd — ad taking over, holding navigation');
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { finish('ad exceeded ' + AD_PLAY_MS + 'ms safety net'); }, AD_PLAY_MS);
        },
        afterAd: function () { adLog(label, 'afterAd — ad finished'); },
        adBreakDone: function (info) {
          adLog(label, 'adBreakDone breakStatus =', (info && info.breakStatus) || '(none)');
          finish('adBreakDone');
        }
      });
    } catch (e) {
      adLog(label, 'adBreak() threw:', e && e.message);
      finish('adBreak() threw');
    }
  }

  function navigateWithInterstitial(url) {
    runNavInterstitial('page-nav', function () { location.href = url; });
  }

  // Same, but for Back buttons, which have no fixed destination — they rely on
  // browser history, with fallbackUrl used only if there was nothing to go back to.
  function goBackWithInterstitial(fallbackUrl) {
    runNavInterstitial('page-back', function () {
      var before = location.href;
      history.back();
      setTimeout(function () { if (location.href === before) location.href = fallbackUrl; }, 200);
    });
  }

  return { getState, setState, fillAds, fillAdsWhenReady, adLog, getAttribution, navigateWithInterstitial, goBackWithInterstitial };
})();
