/* DSE Pulse — environment resolver
 * ---------------------------------------------------------------------------
 * Decides, at page load, which backend this copy of the site talks to.
 *
 * DESIGN RULE: production is the default. A hostname this file does not
 * recognise is treated as PRODUCTION, never as development. Only an explicit,
 * unambiguous development marker switches the target. This means a mistake in
 * this file can never point dsepulse.com at a development backend.
 *
 * Netlify branch deploys and deploy previews always contain "--" in their
 * hostname (dev--site.netlify.app, deploy-preview-7--site.netlify.app), while
 * the production Netlify deploy never does. That is the discriminator.
 *
 * Loaded before auth.js and before any page script.
 */
(function () {
  "use strict";
  if (window.DSEEnv) return;

  // ── EDIT THIS after the Railway development environment exists ────────────
  var DEV_API  = "https://dsepulse-backend-development.up.railway.app";
  var PROD_API = "https://dsepulse-backend-production.up.railway.app";
  // ──────────────────────────────────────────────────────────────────────────

  function detect() {
    var h = "";
    try { h = String(window.location.hostname || "").toLowerCase(); } catch (e) { return "production"; }

    // Explicit manual override, for testing only. Never set automatically.
    try {
      var q = String(window.location.search || "");
      if (q.indexOf("env=dev") !== -1) { window.localStorage.setItem("dse_env", "development"); }
      if (q.indexOf("env=prod") !== -1) { window.localStorage.removeItem("dse_env"); }
      if (window.localStorage.getItem("dse_env") === "development") return "development";
    } catch (e) {}

    if (h === "localhost" || h === "127.0.0.1" || h === "" ) return "development";
    if (h.indexOf("dev.") === 0) return "development";
    //  SUFFIX, not substring. The old test was h.indexOf(".netlify.app") !== -1,
    //  which a hostname like "dev--x.netlify.app.attacker.net" satisfies. The
    //  impact was bounded — it aimed a rogue copy at DEVELOPMENT, never at
    //  production — but the check was simply wrong. shell.html's inline guard
    //  has always used the suffix test and says this file should match it.
    var NETLIFY = ".netlify.app";
    if (h.indexOf("--") !== -1 &&
        h.length > NETLIFY.length &&
        h.lastIndexOf(NETLIFY) === h.length - NETLIFY.length) return "development";

    return "production";
  }

  var env = detect();
  var api = (env === "development") ? DEV_API : PROD_API;

  window.DSEEnv = {
    name:    env,
    apiBase: api,
    apiHost: api.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    isDev:   env === "development"
  };

  // A development build must be visually obvious so no one mistakes it for the
  // live site. Production renders nothing extra.
  if (env === "development") {
    try {
      console.log("[DSE Pulse] DEVELOPMENT environment · API =", api);
      var paint = function () {
        if (!document.body || document.getElementById("dse-env-badge")) return;
        var b = document.createElement("div");
        b.id = "dse-env-badge";
        b.textContent = "DEV";
        b.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647;" +
          "background:#b45309;color:#fff;font:700 10px/1 system-ui,sans-serif;" +
          "padding:4px 7px;border-top-right-radius:4px;letter-spacing:.08em;" +
          "pointer-events:none;opacity:.9";
        document.body.appendChild(b);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", paint);
      } else { paint(); }
    } catch (e) {}
  }
})();

/* ── The paywall, said in words ──────────────────────────────────────────────
 *
 * When PLAN_GATE_MODE is enforce, a call a plan cannot reach comes back 403
 * with {"error":"plan_required", ...}. Left alone, every tool page renders
 * that as its own generic failure — "could not load", or an empty table. A
 * customer whose trial ended yesterday would conclude the site is broken, and
 * a broken site is not one you pay for.
 *
 * This lives in env.js because env.js is the one file all 24 pages already
 * load, before any page script. Handling it in each tool page instead would be
 * twelve copies of the same logic, and the twelfth would be the one that got
 * missed.
 *
 * It is deliberately narrow: it acts ONLY on a 403 whose body says
 * plan_required. An admin key rejection is also a 403 and must fall through
 * untouched, so the check is on the payload, never on the status alone.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  if (!window.fetch || window.__dsePlanGate) return;
  window.__dsePlanGate = true;

  var shown = false;

  function pricingHref(fallback) {
    //  The pricing anchor differs by which landing file is serving: home.html
    //  uses #join, shell.html uses #pricing-section. Ask the page rather than
    //  guessing, and fall back to whatever the server suggested.
    try {
      if (document.getElementById("join")) return "#join";
      if (document.getElementById("pricing-section")) return "#pricing-section";
    } catch (e) {}
    return fallback || "/";
  }

  function words(d) {
    var need = d.needs === "pro" ? "Pro" : d.needs === "premium" ? "Premium" : "a paid plan";
    if (!d.signed_in) {
      return ["Sign in to see this",
              "This is part of " + need + ". Create a free account to start a "
              + "7-day trial with everything unlocked."];
    }
    if (d.trial_expired) {
      return ["Your free trial has ended",
              "You had everything for seven days. This tool is part of " + need
              + " — choose a plan to get it back."];
    }
    if (d.plan_lapsed) {
      return ["Your subscription has ended",
              "You keep your free tools. This one is part of " + need
              + " — renew to get it back."];
    }
    return [need + " plan required",
            "This tool is not part of your current plan. Upgrading unlocks it "
            + "immediately — there is nothing to reinstall."];
  }

  function panel(d) {
    if (shown) return;
    shown = true;
    try {
      var t = words(d), href = pricingHref(d.upgrade);
      var w = document.createElement("div");
      w.id = "dse-plan-gate";
      w.setAttribute("role", "alert");
      w.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;display:flex;" +
        "align-items:center;justify-content:center;padding:24px;" +
        "background:rgba(16,32,58,.55);backdrop-filter:blur(2px)";
      var card = document.createElement("div");
      card.style.cssText =
        "max-width:420px;width:100%;background:#fff;color:#10203A;" +
        "border-radius:14px;padding:26px 28px;box-shadow:0 18px 50px rgba(0,0,0,.28);" +
        "font:400 14px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif";
      card.innerHTML =
        '<div style="font:700 19px/1.25 Georgia,serif;margin-bottom:8px">' +
          t[0].replace(/[<>]/g, "") + "</div>" +
        '<p style="margin:0 0 18px;color:#3E4A61">' + t[1].replace(/[<>]/g, "") + "</p>" +
        '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
          '<a id="dse-pg-go" style="background:#10203A;color:#fff;text-decoration:none;' +
            'font:600 13px/1 system-ui,sans-serif;padding:12px 17px;border-radius:8px;' +
            'cursor:pointer">' + (d.signed_in ? "See plans" : "Start free") + "</a>" +
          '<button id="dse-pg-x" style="background:#fff;border:1.5px solid #E2DDD1;' +
            'color:#3E4A61;font:600 13px/1 system-ui,sans-serif;padding:12px 17px;' +
            'border-radius:8px;cursor:pointer">Not now</button>' +
        "</div>";
      w.appendChild(card);
      (document.body || document.documentElement).appendChild(w);

      var go = card.querySelector("#dse-pg-go");
      go.href = href;
      go.onclick = function () {
        //  Best case: we are a tool running inside the dashboard, and the
        //  dashboard has a plan pane that can take a payment without the
        //  customer leaving the screen they are already on. Sending them out
        //  to the marketing page to buy something is how you lose them.
        try {
          if (window.top && window.top !== window &&
              typeof window.top.openAccountPlan === "function") {
            window.top.openAccountPlan();
            if (w.parentNode) w.parentNode.removeChild(w);
            shown = false;
            return false;
          }
        } catch (e) {}
        //  Otherwise: this tool was opened on its own, or the shell is an
        //  older build. Navigate the TOP window, so a page opened in an iframe
        //  does not leave the customer looking at pricing in a little box.
        try {
          if (window.top && window.top !== window) {
            window.top.location.href =
              (href.charAt(0) === "#" ? window.top.location.pathname : "") + href;
            return false;
          }
        } catch (e) {}
        return true;
      };
      card.querySelector("#dse-pg-x").onclick = function () {
        w.parentNode && w.parentNode.removeChild(w);
        shown = false;
      };
    } catch (e) { shown = false; }
  }

  var real = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return real.apply(this, args).then(function (res) {
      if (res && res.status === 403) {
        //  clone() so the caller still gets an unread body and can handle the
        //  403 its own way as well
        try {
          res.clone().json().then(function (j) {
            var d = (j && j.detail) || j;
            if (d && d.error === "plan_required") panel(d);
          }).catch(function () {});
        } catch (e) {}
      }
      return res;
    });
  };
})();

/* ── the shared site footer ──────────────────────────────────────────────────
 *  Loaded from here rather than added as a <script> tag to twenty-five pages.
 *  Every page already loads env.js, so this is the one hook that reaches all
 *  of them without any page being edited. footer.js decides for itself where
 *  to render and where to stay out of the way (inside the dashboard iframe,
 *  and on the internal admin pages).
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return;   // don't even fetch it in a frame
  } catch (e) { return; }
  if (document.getElementById("dse-footer-js")) return;
  var s = document.createElement("script");
  s.id = "dse-footer-js";
  s.src = "/footer.js";
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();

/* ── the tab icon, on every page ─────────────────────────────────────────────
 *  Twenty-five pages, none of which declare one, so every tab reads as a blank
 *  document. Adding six <link> tags to twenty-five files is twenty-five edits
 *  and one page that gets missed; env.js already loads everywhere.
 *
 *  A page that declares its OWN icon keeps it — this fills a gap, it does not
 *  overrule a decision someone made deliberately.
 *
 *  16 and 32 carry the pulse mark alone. The full tile has "DSE PULSE" and a
 *  tagline on it, and at tab size those are three grey smudges — an icon that
 *  cannot be told from any other dark square is not doing the one job it has.
 *  The home-screen sizes get the whole tile, where the wordmark reads.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  try {
    if (window.top !== window.self) return;      // a frame has no tab of its own
  } catch (e) { return; }
  try {
    if (document.querySelector('link[rel~="icon"]')) return;   // page has its own
    var ICONS = [
      ["icon",             "/favicon-32x32.png", "image/png", "32x32"],
      ["icon",             "/favicon-16x16.png", "image/png", "16x16"],
      ["shortcut icon",    "/favicon.ico",       null,        null],
      ["apple-touch-icon", "/apple-touch-icon.png", null,     "180x180"]
    ];
    var head = document.head || document.documentElement;
    for (var i = 0; i < ICONS.length; i++) {
      var l = document.createElement("link");
      l.rel = ICONS[i][0];
      l.href = ICONS[i][1];
      if (ICONS[i][2]) l.type = ICONS[i][2];
      if (ICONS[i][3]) l.setAttribute("sizes", ICONS[i][3]);
      head.appendChild(l);
    }
  } catch (e) {}
})();

/* ── the logo goes home ──────────────────────────────────────────────────────
 *  Every page draws the wordmark as a <div>, so the first thing a visitor
 *  tries on any website does nothing at all here.
 *
 *  Where "home" is depends on the page. Inside shell.html the app has its own
 *  landing view and its own Back-to-site button, so leaving the page would
 *  throw away the dashboard someone is standing in — it switches view instead.
 *  Everywhere else, the site root, which each branch already resolves for
 *  itself through _redirects.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  function wire() {
    try {
      var logos = document.querySelectorAll(".logo, .brand");
      for (var i = 0; i < logos.length; i++) {
        var el = logos[i];
        if (el.dataset && el.dataset.dseHome) continue;
        if (el.closest && el.closest("a")) continue;   // already a link
        if (el.dataset) el.dataset.dseHome = "1";
        el.style.cursor = "pointer";
        el.setAttribute("role", "link");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "DSE Pulse — home");
        var go = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          try {
            //  in the dashboard shell, switch view rather than navigate away
            if (typeof window.showView === "function") {
              window.showView("landing");
              window.scrollTo({ top: 0, behavior: "smooth" });
              return;
            }
          } catch (x) {}
          window.location.href = "/";
        };
        el.addEventListener("click", go);
        el.addEventListener("keydown", function (e) {
          if (e && (e.key === "Enter" || e.key === " ")) go(e);
        });
      }
    } catch (e) {}
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();

/* ── and the mirror of it, for pages inside the dashboard ────────────────────
 *  Every tool page is a complete standalone page: its own header, its own big
 *  title, its own disclaimer. Correct on its own; inside the dashboard iframe
 *  it is 169px of things already on screen once. framed.js strips that, and
 *  ONLY in a frame — a page opened on its own is untouched.
 *
 *  Loaded WITHOUT defer, unlike footer.js: this one hides things that are
 *  already in the markup, so a deferred load would show the header and title
 *  for a moment and then snatch them away. footer.js adds rather than hides,
 *  so it can wait.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  try {
    if (window.top === window.self) return;   // not framed: nothing to do
  } catch (e) { return; }                     // cross-origin: not our frame
  if (document.getElementById("dse-framed-js")) return;
  var s = document.createElement("script");
  s.id = "dse-framed-js";
  s.src = "/framed.js";
  (document.head || document.documentElement).appendChild(s);
})();
