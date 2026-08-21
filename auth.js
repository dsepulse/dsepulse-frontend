/* ============================================================================
   DSE Pulse — shared auth helper                       Phase 1 (2026-08-20)
   ----------------------------------------------------------------------------
   PURPOSE
     Make every page authentication-ready without editing its existing fetch
     calls. When a signed-in user has a token, requests to the DSE Pulse API
     carry "Authorization: Bearer <token>". When there is no token, requests go
     out exactly as they do today.

   THIS FILE DOES NOT BLOCK ANYTHING.
     It adds a header. The backend currently ignores it. Enforcement is Phase 4.

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
    return nativeFetch(input, init);
  };

  // Small public surface for later phases and for debugging in the console.
  window.DSEAuth = {
    token:      getToken,
    isLoggedIn: function () { return !!getToken(); },
    apiHost:    API_HOST
  };
})();
