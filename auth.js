/* ============================================================================
   DSE Pulse — shared auth helper                       Phase 1 (2026-08-20)
   ----------------------------------------------------------------------------
   PURPOSE
     Make every page authentication-ready without editing its existing fetch
     calls. When a signed-in user has a token, requests to the DSE Pulse API
     carry "Authorization: Bearer <token>". When there is no token, requests go
     out exactly as they do today.

   THIS FILE DOES NOT BLOCK ANYTHING.
     It adds a header, and it EXPLAINS a refusal the backend has already made.
     It never decides entitlement itself — by the time this code runs, the
     server has already withheld the data and sent 403. There is nothing here
     to bypass: no payload arrives that a determined user could unhide.

   PLAN REFUSALS                                        (2026-08-25)
     Without this, a 403 travels through each page's fetchJSON(), which turns
     every failure into null, which the pages read as "the engine found nothing
     today". A paying opportunity would be reported to the user as a quiet
     market. Three pages are worse still: tech, smartmoney and mastersignal call
     quietBanner() without defining it, so they throw and render blank.
     This file answers both.

   DESIGN NOTES
     - Wraps window.fetch once, guarded against double-install.
     - Only touches requests to the API host. Supabase/PostgREST calls, CDN
       assets and Google Fonts are left completely alone.
     - Never overwrites an Authorization header a page already set (several
       pages send the Supabase anon key that way).
     - Every step is inside try/catch: a failure here must never break a page.
       localStorage can throw in private mode or a sandboxed iframe.
   ========================================================================== */
(function () {
  "use strict";

  if (window.__dseAuthInstalled) return;      // idempotent — safe if included twice
  window.__dseAuthInstalled = true;

  // Target host comes from env.js when present. If env.js failed to load for
  // any reason, fall back to production — the same host this file used before
  // the development environment existed, so behaviour is never worse.
  var API_HOST = "dsepulse-backend-production.up.railway.app";
  try {
    if (window.DSEEnv && window.DSEEnv.apiHost) API_HOST = window.DSEEnv.apiHost;
  } catch (e) {}
  var TOKEN_KEY = "dse_token";

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || null; }
    catch (e) { return null; }               // private mode / blocked storage
  }

  function urlOf(input) {
    try {
      if (typeof input === "string") return input;
      if (input && typeof input.url === "string") return input.url;   // Request
      if (input && typeof input.href === "string") return input.href; // URL
    } catch (e) {}
    return "";
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;                   // ancient browser — do nothing

  window.fetch = function (input, init) {
    try {
      var token = getToken();
      if (token && urlOf(input).indexOf(API_HOST) !== -1) {
        init = init || {};
        var headers = new Headers(
          init.headers ||
          (typeof input !== "string" && input && input.headers) ||
          {}
        );
        // Respect a header the page set itself (e.g. the Supabase anon key).
        if (!headers.has("Authorization")) {
          headers.set("Authorization", "Bearer " + token);
        }
        init.headers = headers;
      }
    } catch (e) {
      /* fall through to an unmodified request */
    }
    var target = urlOf(input);
    return nativeFetch(input, init).then(function (res) {
      inspectResponse(res, target);
      return res;                       // the response is passed through untouched
    });
  };

  /* ==========================================================================
     Plan refusals
     ======================================================================== */

  //  Endpoint -> what a person calls it. The panel must name the thing the user
  //  was looking at, not the URL they never saw.
  var TOOL_NAME = {
    "/api/picks/today":      "Today's Picks",
    "/api/picks/full":       "Today's Picks",
    "/api/wma/today":        "WMA Signals",
    "/api/tech/today":       "Technical Analysis",
    "/api/combined/today":   "Combined Signal",
    "/api/bd/today":         "BD Signal",
    "/api/bd/all":           "the Screener",
    "/api/bd/eval":          "the decision card",
    "/api/activity/today":   "Smart Money",
    "/api/activity/sectors": "sector money flow",
    "/api/analyse":          "stock analysis",
    "/api/fundamentals":     "Fundamentals",
    "/api/portfolio":        "My Holdings"
  };

  var PLAN_LABEL = { free: "Free", premium: "Premium", pro: "Pro", guest: "not signed in" };

  function toolNameFor(path) {
    try {
      var keys = Object.keys(TOOL_NAME).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < keys.length; i++) {
        if (path.indexOf(keys[i]) !== -1) return TOOL_NAME[keys[i]];
      }
    } catch (e) {}
    return "this tool";
  }

  var panelShown = false;          // one panel per page load, never a stack

  function showPanel(kind, detail) {
    if (panelShown) return;
    panelShown = true;
    try {
      if (!document.body) {
        document.addEventListener("DOMContentLoaded", function () {
          panelShown = false; showPanel(kind, detail);
        });
        return;
      }
      var d       = detail || {};
      var tool    = toolNameFor(String(d.endpoint || ""));
      var plan    = String(d.your_plan || "guest");
      var allowed = (d.allowed || []).map(function (p) { return PLAN_LABEL[p] || p; });
      var signedIn = plan !== "guest";

      var title, body, primaryText, primaryHref;
      if (kind === "signin") {
        title = "Please sign in again";
        body  = "Your session has expired. Signing in again restores everything — " +
                "nothing has been lost.";
        primaryText = "Sign in"; primaryHref = "/login.html";
      } else if (!signedIn) {
        title = tool.charAt(0).toUpperCase() + tool.slice(1) + " needs an account";
        body  = "Sign in to see it. New accounts get a " +
                "7-day free trial with everything unlocked.";
        primaryText = "Sign in or start free trial"; primaryHref = "/login.html";
      } else {
        title = tool.charAt(0).toUpperCase() + tool.slice(1) + " is on " +
                (allowed.length ? allowed.join(" and ") : "a paid plan");
        body  = "You are on " + (PLAN_LABEL[plan] || plan) + ". " +
                "Upgrading unlocks it immediately — your account keeps everything else as it is.";
        primaryText = "See plans"; primaryHref = "/pricing.html";
      }

      var wrap = document.createElement("div");
      wrap.id = "dse-gate-panel";
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-modal", "true");
      wrap.setAttribute("aria-label", title);
      wrap.style.cssText =
        "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;" +
        "justify-content:center;padding:20px;background:rgba(13,31,60,.55);" +
        "backdrop-filter:blur(2px);font:400 14px/1.55 Inter,system-ui,-apple-system,sans-serif";

      var card = document.createElement("div");
      card.style.cssText =
        "background:#fff;color:#0D1F3C;max-width:420px;width:100%;border-radius:12px;" +
        "box-shadow:0 18px 50px rgba(0,0,0,.3);padding:26px 26px 22px;text-align:left";

      var h = document.createElement("div");
      h.style.cssText = "font:600 18px/1.3 Inter,system-ui,sans-serif;margin-bottom:9px";
      h.textContent = title;

      var p = document.createElement("p");
      p.style.cssText = "margin:0 0 18px;color:#4A5568;font-size:14px";
      p.textContent = body;

      var row = document.createElement("div");
      row.style.cssText = "display:flex;gap:9px;flex-wrap:wrap";

      var a = document.createElement("a");
      a.href = primaryHref;
      a.textContent = primaryText;
      a.style.cssText =
        "background:#D4A017;color:#0D1F3C;text-decoration:none;font-weight:600;" +
        "padding:10px 16px;border-radius:7px;font-size:14px";

      var back = document.createElement("button");
      back.type = "button";
      back.textContent = "Go back";
      back.style.cssText =
        "background:transparent;border:1px solid #E2E8F0;color:#4A5568;cursor:pointer;" +
        "padding:10px 16px;border-radius:7px;font-size:14px;font-family:inherit";
      back.addEventListener("click", function () {
        try { wrap.remove(); } catch (e) {}
        try { if (history.length > 1) history.back(); else location.href = "/"; } catch (e) {}
      });

      row.appendChild(a); row.appendChild(back);
      card.appendChild(h); card.appendChild(p); card.appendChild(row);
      wrap.appendChild(card);
      document.body.appendChild(wrap);
      try { a.focus(); } catch (e) {}
    } catch (e) {
      /* the panel must never be the reason a page breaks */
    }
  }

  //  Pages can listen for this instead of the panel if they want to render the
  //  refusal inline. Nothing does yet; the panel is the default.
  function announce(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent("dse:" + kind, { detail: detail || {} }));
    } catch (e) {}
  }

  function inspectResponse(res, url) {
    //  Only 401 and 403 are interesting, and only from our own API.
    try {
      if (!res || (res.status !== 403 && res.status !== 401)) return;
      if (url.indexOf(API_HOST) === -1) return;
      if (res.status === 401) {
        announce("signin-required", { endpoint: url });
        showPanel("signin", { endpoint: url });
        return;
      }
      res.clone().json().then(function (body) {
        var d = (body && body.detail) || {};
        if (d.error !== "plan_required") return;   // some other 403; leave it alone
        var info = { endpoint: d.endpoint || url, your_plan: d.your_plan,
                     allowed: d.allowed || [], upgrade: d.upgrade };
        announce("plan-required", info);
        showPanel("plan", info);
      }).catch(function () {});
    } catch (e) {}
  }

  // Small public surface for later phases and for debugging in the console.
  window.DSEAuth = {
    token:      getToken,
    isLoggedIn: function () { return !!getToken(); },
    apiHost:    API_HOST,
    _showPanel: showPanel            // exposed for the test harness only
  };

  /* ==========================================================================
     quietBanner fallback
     --------------------------------------------------------------------------
     tech.html, smartmoney.html and mastersignal.html call quietBanner() but do
     not define it — a pre-existing bug that only fires on a genuinely quiet
     market day, and would fire far more often once refusals start returning
     empty. Defining a plain fallback here costs nothing and cannot override the
     richer version on the four pages that do define their own, because a page's
     own function declaration wins over this assignment.
     ======================================================================== */
  if (typeof window.quietBanner !== "function") {
    window.quietBanner = function (reason, toolLabel) {
      var today = "";
      try {
        today = new Date().toLocaleDateString("en-GB",
          { day: "2-digit", month: "short", year: "numeric" });
      } catch (e) {}
      var esc = function (t) {
        return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
      };
      return '<div style="background:#fff;border:1px solid #E2DECE;border-radius:10px;' +
             'padding:18px 20px;max-width:920px">' +
             '<div style="font:600 13px/1.4 Inter,system-ui,sans-serif;color:#0D1F3C">' +
             'No ' + esc(toolLabel) + ' today' + (today ? ' &middot; ' + esc(today) : '') +
             '</div><div style="font-size:11px;color:#8A94A6;margin-top:3px">' +
             esc(reason) + '</div></div>';
    };
  }
})();
