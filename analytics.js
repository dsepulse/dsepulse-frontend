/* ══════════════════════════════════════════════════════════════════════════════
 *  DSE Pulse · analytics.js          the collector, on every page
 *  Added 2026-09-27
 * ──────────────────────────────────────────────────────────────────────────────
 *  WHY THIS FILE EXISTS AT ALL
 *    The collector was written inline in home.html, which measured the landing
 *    page and nothing else — not shell.html, not one of the eighteen tool
 *    pages. Page views, feature usage and stock analysis were therefore
 *    uncollectable rather than merely unbuilt. env.js already injects
 *    footer.js, framed.js and the favicons into every page, so this rides the
 *    same mechanism: one file, loaded once, instead of an edit to twenty-five.
 *
 *  IT RUNS INSIDE IFRAMES, UNLIKE footer.js
 *    footer.js returns early when window.top !== window.self, because a footer
 *    inside the dashboard frame would be absurd. This must do the opposite:
 *    the tool pages ARE the iframe, so skipping frames would miss every single
 *    thing a paying customer does. Top and frame share an origin, so they also
 *    share localStorage and sessionStorage, and therefore the same visitor and
 *    session — the frame is a page view within the same visit, which is what
 *    it actually is.
 *
 *  NO CORS PREFLIGHT, AND EVERY LINE OF THE TRANSPORT DEPENDS ON THAT
 *    The API answers every origin with "*", and navigator.sendBeacon always
 *    sends with credentials included — that is what a beacon is, not a
 *    setting. CORS forbids answering a credentialed request with a wildcard
 *    origin, so anything that triggers a preflight dies at the OPTIONS with
 *    "No Allow Credentials". That happened in production on 27 September:
 *    every beacon was refused before its POST. So:
 *      · the body is declared text/plain, which is CORS-safelisted
 *      · there is no Authorization header; the token travels in the body,
 *        where the server verifies its signature before believing it
 *    The browser then refuses to let the page read the response, which costs
 *    nothing — a beacon never reads one.
 *
 *  PRIVACY
 *    A random visitor id in localStorage and a random session id in
 *    sessionStorage. No IP is ever sent. No email, no name, nothing from the
 *    account but a signed token the server checks. Our own traffic is excluded
 *    with ?dse_internal=1. Every storage read and write is wrapped, because
 *    private mode and blocked storage both throw, and analytics must never be
 *    the reason a page fails to load.
 *
 *  WHAT IT COUNTS, AND THE RULE FOR EACH
 *    session_start  once per visit; the session rolls over after 30 minutes idle
 *    page_view      once per navigation, including soft ones (pushState,
 *                   replaceState, popstate, hashchange) and including a tool
 *                   loading inside the frame. Never on a re-render.
 *    feature_used   once per tool page, derived from the path, so every page
 *                   reports which product feature it is without being edited
 *    [data-ev]      any element carrying the attribute, clicked
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  //  One instance per window. env.js guards the injection too, but a page that
  //  also hard-codes the tag would otherwise double every number.
  if (window.__dseAnalytics) return;
  window.__dseAnalytics = true;

  var API = (window.DSEEnv && window.DSEEnv.apiBase) ||
            "https://dsepulse-backend-production.up.railway.app";
  var URL_TRACK = API + "/api/track";
  var IDLE_MS   = 30 * 60 * 1000;
  var BATCH_MS  = 1200;
  var MAX_BATCH = 25;

  /* ── storage, defensively ─────────────────────────────────────────────── */
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k);
          localStorage.setItem(k, v); return v; } catch (e) { return null; }
  }
  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k);
          sessionStorage.setItem(k, v); return v; } catch (e) { return null; }
  }
  function rid(p) {
    var a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", o = p || "";
    try {
      if (window.crypto && crypto.getRandomValues) {
        var b = new Uint8Array(16); crypto.getRandomValues(b);
        for (var i = 0; i < 16; i++) o += a[b[i] % a.length];
        return o;
      }
    } catch (e) {}
    for (var j = 0; j < 16; j++) o += a[Math.floor(Math.random() * a.length)];
    return o;
  }

  /* ── identity ─────────────────────────────────────────────────────────── */
  var VID = ls("dse_vid") || ls("dse_vid", rid("v-"));
  var NEWSESSION = false;
  var SID = (function () {
    var id = ss("dse_sid"), last = +(ss("dse_sid_at") || 0);
    if (!id || !last || (Date.now() - last) > IDLE_MS) {
      id = ss("dse_sid", rid("s-"));
      NEWSESSION = true;
    }
    ss("dse_sid_at", String(Date.now()));
    return id;
  })();

  //  Our own visits, kept out of the numbers the growth decisions are made
  //  from. ?dse_internal=1 marks this browser, ?dse_internal=0 unmarks it.
  try {
    var mi = /[?&]dse_internal=([01])/.exec(location.search);
    if (mi) ls("dse_internal", mi[1]);
  } catch (e) {}
  var INTERNAL = ls("dse_internal") === "1";

  /* ── the campaign that brought them ───────────────────────────────────── */
  //  Captured on the FIRST page of the session and kept for the rest of it.
  //  Without that, a visitor who lands on a tagged link and then clicks
  //  through to pricing is recorded as arriving at pricing from nowhere, and
  //  the campaign loses credit for the conversion it paid for.
  var UTM = (function () {
    try {
      var keep = ss("dse_utm");
      if (keep) return JSON.parse(keep);
      var out = {}, q;
      try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
      if (q) ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
        .forEach(function (k) { var v = q.get(k); if (v) out[k] = String(v).slice(0, 80); });
      ss("dse_utm", JSON.stringify(out));
      return out;
    } catch (e) { return {}; }
  })();

  //  The referrer of the page that STARTED the visit, not of this one. Inside
  //  the dashboard frame document.referrer is shell.html, which would record
  //  every tool as a referral from ourselves.
  var REF = (function () {
    try {
      var keep = ss("dse_ref");
      if (keep !== null) return keep;
      var r = "";
      try { r = (window.top === window.self) ? (document.referrer || "") : ""; } catch (e) { r = ""; }
      ss("dse_ref", r);
      return r;
    } catch (e) { return ""; }
  })();

  /* ── transport ────────────────────────────────────────────────────────── */
  /*  Section 17. Coarse on purpose: the viewport rounded to 20px, not the
      exact pixel. It exists to spot a layout broken on a size we do not test,
      and an exact size is a fingerprinting surface for no extra insight.    */
  var SCREEN = (function () {
    try {
      var r = function (n) { return Math.round(n / 20) * 20; };
      return r(window.innerWidth || screen.width || 0) + "x" +
             r(window.innerHeight || screen.height || 0);
    } catch (e) { return ""; }
  })();

  var BUF = [], TIMER = null;

  function flush() {
    if (TIMER) { clearTimeout(TIMER); TIMER = null; }
    if (!BUF.length) return;
    var tok = ls("dse_token");
    var body = JSON.stringify({
      visitor_id: VID, session_id: SID, internal: INTERNAL,
      token: tok || "", events: BUF.splice(0, MAX_BATCH)
    });
    try {
      if (navigator.sendBeacon) {
        //  text/plain deliberately — see the header. The payload is still JSON.
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(URL_TRACK, blob)) return;
      }
    } catch (e) {}
    try {
      //  No custom headers, so this stays a simple request too. fetch omits
      //  cookies cross-origin by default, so unlike the beacon it is not
      //  credentialed and the wildcard origin is accepted normally.
      fetch(URL_TRACK, { method: "POST", body: body, keepalive: true,
                         headers: { "Content-Type": "text/plain;charset=UTF-8" } })
        .catch(function () {});
    } catch (e) {}
  }
  function schedule() { if (!TIMER) TIMER = setTimeout(flush, BATCH_MS); }

  function track(name, props) {
    if (!name) return;
    try {
      var ev = { event: String(name), path: location.pathname, referrer: REF,
                 utm: UTM, screen: SCREEN };
      if (props) for (var k in props)
        if (props.hasOwnProperty(k) && k !== "path" && k !== "referrer" && k !== "utm")
          ev[k] = props[k];
      BUF.push(ev);
      ss("dse_sid_at", String(Date.now()));       // this visit is still alive
      schedule();
      //  Forwarded to a tag manager if one is ever installed, so adding GA4
      //  later is a configuration change rather than a re-instrumentation.
      try { if (window.dataLayer && window.dataLayer.push)
              window.dataLayer.push({ event: name, ts: Date.now() }); } catch (e) {}
      try { if (typeof window.gtag === "function")
              window.gtag("event", name, props || {}); } catch (e) {}
    } catch (e) {}
  }

  /*  Anything a page queued before this file finished loading. home.html
      pushes into window.dsePulseEvents synchronously; without this drain,
      every event fired above the fold would be lost to a race.              */
  function drain() {
    try {
      var Q = window.dsePulseEvents;
      if (!Q || !Q.length) return;
      var pending = Q.splice(0, Q.length);
      pending.forEach(function (e) {
        if (!e || !e.event) return;
        var p = {};
        for (var k in e) if (e.hasOwnProperty(k) && k !== "event" && k !== "ts") p[k] = e[k];
        track(e.event, p);
      });
    } catch (e) {}
  }

  window.dseTrack = track;                  // replaces any pre-load shim
  window.dseFlush = flush;

  /* ── which product feature this page is ───────────────────────────────── */
  //  Derived from the path, so a page reports what it is without being edited
  //  and a new tool needs one line here rather than an instrumentation pass.
  var FEATURES = {
    "picks": "daily_picker", "wma": "wma_analysis", "tech": "technical_analysis",
    "combined": "combined_signal", "bd": "bd_signal", "smartmoney": "smart_money",
    "mastersignal": "master_signal", "trackrecord": "track_record",
    "screener": "screener", "comparison": "comparison", "crosstool": "cross_tool",
    "fundamentals": "fundamentals", "risk": "risk", "holdings": "holdings",
    "calculator": "calculator", "overview": "overview", "market": "market_pulse",
    "sectors": "sector_ranking", "shell": "dashboard", "home": "landing",
    "index": "landing", "admin": "admin", "reset": "password_reset",
    "audit": "audit", "disclaimer": "disclaimer", "landing": "landing"
  };
  function featureOf(path) {
    try {
      var f = String(path || location.pathname).split("/").pop().replace(/\.html?$/i, "");
      if (!f) f = "index";
      return FEATURES[f.toLowerCase()] || null;
    } catch (e) { return null; }
  }

  //  A ticker, when the URL carries one. Tool pages that hold the code in
  //  their own state should call window.dseTrack("stock_analysis_view",
  //  {code: "BEXIMCO"}) directly — this only covers the URL case, and says so
  //  rather than guessing at page internals.
  function codeInUrl() {
    try {
      var q = new URLSearchParams(location.search);
      var c = q.get("code") || q.get("ticker") || q.get("stock");
      return c ? String(c).toUpperCase().slice(0, 20) : null;
    } catch (e) { return null; }
  }

  /* ── the automatic events ─────────────────────────────────────────────── */
  var lastPath = null;
  function pageView(why) {
    var p = location.pathname + location.hash;
    if (p === lastPath) return;             // a re-render is not a navigation
    lastPath = p;
    var props = { framed: (function () {
      try { return window.top !== window.self; } catch (e) { return true; } })() };
    if (why) props.nav = why;
    var code = codeInUrl(); if (code) props.code = code;
    track("page_view", props);

    var feat = featureOf();
    if (feat) track("feature_used", { feature: feat });
    if (code) track("stock_analysis_view", { code: code, feature: feat || undefined });
  }

  if (NEWSESSION) track("session_start", { entry: location.pathname });
  drain();
  pageView("load");

  /*  An invitation is an acquisition channel, so the click has to be counted
      separately from the signup it may or may not become. Emitted once per
      session: a referred visitor who reloads four times is one referral
      click, not four.                                                       */
  (function () {
    try {
      var m = /[?&]ref=([A-Za-z0-9]{4,16})/.exec(location.search);
      if (!m) return;
      if (ss("dse_ref_seen") === "1") return;
      ss("dse_ref_seen", "1");
      track("referral_clicked", { ref: m[1].toUpperCase() });
    } catch (e) {}
  })();

  /*  Soft navigation. shell.html swaps tools by changing the hash and by
      pushState, and neither fires a page load, so without this the whole
      dashboard would report exactly one page view per visit.                */
  try {
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== "function") return;
      history[m] = function () {
        var r = orig.apply(this, arguments);
        try { setTimeout(function () { pageView("soft"); }, 0); } catch (e) {}
        return r;
      };
    });
    window.addEventListener("popstate",   function () { pageView("back"); });
    window.addEventListener("hashchange", function () { pageView("hash"); });
  } catch (e) {}

  /*  Every element carrying data-ev, anywhere on the site. Capture phase, so
      an element whose own handler stops propagation is still counted.        */
  try {
    document.addEventListener("click", function (e) {
      try {
        var t = e.target && e.target.closest ? e.target.closest("[data-ev]") : null;
        if (t) {
          var props = {};
          var c = t.getAttribute("data-ev-code"); if (c) props.code = String(c).toUpperCase().slice(0, 20);
          var f = featureOf(); if (f) props.feature = f;
          track(t.getAttribute("data-ev"), props);
        }
      } catch (x) {}
    }, true);
  } catch (e) {}

  /*  Flush on the way out. pagehide is the one that fires reliably on mobile
      Safari, where beforeunload does not.                                    */
  try {
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
  } catch (e) {}
})();
