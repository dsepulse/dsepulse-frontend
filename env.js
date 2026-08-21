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
    if (h.indexOf("--") !== -1 && h.indexOf(".netlify.app") !== -1) return "development";

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
