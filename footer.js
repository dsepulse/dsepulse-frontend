/* DSE Pulse — the site footer, in one file
 * ===========================================================================
 * WHY THIS IS A SCRIPT AND NOT MARKUP IN 25 PAGES
 *   The content below is going to change. Addresses, phone numbers, links,
 *   wording — all of it. Twenty-five copies of a footer means twenty-five
 *   edits every time, and the twenty-fifth is the one that gets missed and
 *   sits there for a year saying something out of date.
 *
 *   So: edit CONTENT below, paste this one file, and every page changes.
 *
 * HOW IT GETS ONTO A PAGE
 *   env.js loads it. Every page already loads env.js, so no page needs a new
 *   script tag and no page needs editing to gain a footer.
 *
 * WHERE IT PUTS ITSELF
 *   If the page already has a <footer>, this REPLACES it. That is how
 *   home.html and shell.html get the shared version without being edited.
 *   Otherwise it appends to the end of <body>.
 *
 * WHERE IT DOES NOT APPEAR
 *   - inside an iframe: the dashboard loads tool pages in one, and a footer
 *     there would sit stranded in the middle of the screen rather than at the
 *     bottom of anything;
 *   - on admin.html and audit.html: internal pages, not public ones.
 * ===========================================================================
 */
(function () {
  "use strict";
  if (window.__dseFooter) return;
  window.__dseFooter = true;

  /* ═══ CONTENT — this is the part we edit ═══════════════════════════════
   *  Anything left as an empty string is NOT rendered. That is deliberate:
   *  a blank value shows nothing at all rather than an empty row, a dead
   *  link, or a placeholder that ships by accident.
   *  --------------------------------------------------------------------- */
  var CONTENT = {

    brand: {
      name: "DSE Pulse",
      line: "Bangladesh Stock Intelligence · dsepulse.com",
      //  One or two sentences. Keep it factual — this sits above a disclaimer
      //  that says we are not advisers, so it must not read like a promise.
      about: "Six analysis engines run every evening after the Dhaka Stock " +
             "Exchange closes, scoring 400+ listed companies and publishing " +
             "the entry, target and stop-loss levels each engine derived."
    },

    columns: [
      { title: "Product", links: [
        { label: "Dashboard",           href: "/shell.html" },
        { label: "Track record",        href: "/trackrecord.html" },
        { label: "Position calculator", href: "/calculator.html" },
        { label: "Screener",            href: "/screener.html" }
      ]},
      { title: "Market", links: [
        { label: "DSE (Dhaka Stock Exchange)", href: "https://www.dsebd.org/" },
        { label: "BSEC (Securities Commission)", href: "https://sec.gov.bd/" },
        { label: "CDBL (Central Depository)",  href: "https://www.cdbl.com.bd/" },
        { label: "Bangladesh Bank",            href: "https://www.bb.org.bd/" }
      ]},
      { title: "Legal", links: [
        { label: "Full disclaimer", href: "/disclaimer.html" },
        { label: "Risk warning",    href: "/disclaimer.html#risk" },
        { label: "Account",         href: "/shell.html" }
      ]}
    ],

    /* ─── FILL THESE IN ────────────────────────────────────────────────────
     *  Left empty on purpose. An invented address or phone number on a
     *  financial site is worse than none at all, so each of these renders
     *  only once it holds a real value.
     *  ------------------------------------------------------------------- */
    contact: {
      title:   "Have a question?",
      email:   "",          // e.g. "support@dsepulse.com"
      phone:   "",          // e.g. "+8801XXXXXXXXX"
      address: "",          // e.g. "Motijheel C/A, Dhaka-1000"
      hours:   ""           // e.g. "Sunday–Thursday, 10am–6pm"
    },

    social: {
      facebook: "https://www.facebook.com/dsepulse",
      linkedin: "https://www.linkedin.com/company/146100974/",
      youtube:  "",
      whatsapp: ""
    },

    //  The legal text, carried over verbatim from home.html. Do not trim this
    //  without checking what it is protecting.
    disclaimer:
      "<b>Disclaimer.</b> DSE Pulse provides algorithm-generated market data, " +
      "technical signals, scores and analytics for informational and educational " +
      "purposes only. DSE Pulse and its operators are not registered or licensed " +
      "investment advisers, brokers, dealers or portfolio managers, and are not " +
      "registered with the Bangladesh Securities and Exchange Commission. All " +
      "signals, conviction scores and labels (including “Buy”, “Strong " +
      "Buy”, “Watch” and “Avoid”), entry prices, targets and " +
      "stop-loss levels are automated, rule-based calculations — not " +
      "recommendations, offers or solicitations. Any taka figure shown is a " +
      "conditional calculation of what a position would come to at those levels; " +
      "it is not a forecast of gains, not a promise that any level will be " +
      "reached, and excludes brokerage commission, taxes and slippage. Trading " +
      "and investing in shares carries a high level of risk, including the " +
      "possible loss of all invested capital. Market data is obtained from " +
      "third-party and publicly available sources and may be delayed, incomplete " +
      "or inaccurate. Past performance and back-tested results are not indicative " +
      "of future results. You are solely responsible for your own investment " +
      "decisions and should consult a licensed adviser. Read the " +
      "<a href=\"/disclaimer.html\">full disclaimer</a>.",

    copyright: "© 2026 DSE Pulse · Governed by the laws of Bangladesh"
  };
  /* ═══ END OF CONTENT ══════════════════════════════════════════════════ */

  var SKIP = ["/admin.html", "/audit.html"];

  function shouldSkip() {
    try {
      if (window.top !== window.self) return true;      // inside the dashboard
    } catch (e) { return true; }                        // cross-origin frame
    var p = "";
    try { p = String(window.location.pathname || "").toLowerCase(); } catch (e) {}
    for (var i = 0; i < SKIP.length; i++) {
      if (p.indexOf(SKIP[i]) !== -1) return true;
    }
    return false;
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var ICON = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.75-1.95C20.4 8.75 21 11 21 14v7h-4v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H9z"/></svg>',
    youtube:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.4-.4-5a2.7 2.7 0 0 0-1.9-1.9C19 4.7 12 4.7 12 4.7s-7 0-8.7.4A2.7 2.7 0 0 0 1.4 7C1 8.6 1 12 1 12s0 3.4.4 5a2.7 2.7 0 0 0 1.9 1.9c1.7.4 8.7.4 8.7.4s7 0 8.7-.4a2.7 2.7 0 0 0 1.9-1.9c.4-1.6.4-5 .4-5zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.8.8-.9 1.9-.2 3.1a10 10 0 0 0 4 3.9c1.7.7 2.4.6 3.1.5.5-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.1l-.5-.3z"/></svg>'
  };
  var LABEL = { facebook: "Facebook", linkedin: "LinkedIn",
                youtube: "YouTube", whatsapp: "WhatsApp" };

  var CSS =
  //  This footer is injected into ~20 pages that each have their own CSS, and
  //  several of them style the `footer` element directly. shell.html has
  //  `footer{display:flex;align-items:center;justify-content:space-between}`,
  //  which turned the three sections below into three columns sitting side by
  //  side — the links squeezed into a sliver on the left, the disclaimer in
  //  the middle and the copyright as a vertical strip on the right.
  //
  //  So the first rule RESETS every property a host page is likely to set on
  //  `footer`. `footer.dsef` outranks a bare `footer` selector, so no
  //  !important is needed — but each property has to be named, and the ones
  //  below are exactly the ones that were not.
  'footer.dsef{all:revert;display:block;background:#10203A;color:#B9C3D2;' +
    'font:400 14px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'margin:0;padding:0;border:0;box-sizing:border-box;align-items:initial;' +
    'justify-content:initial;gap:0;flex-wrap:initial;text-align:left;' +
    'max-width:none;width:auto}' +
  '.dsef *,.dsef *:before,.dsef *:after{box-sizing:border-box}' +
  '.dsef>div{width:auto;max-width:none;flex:none;float:none}' +
  '.dsef a{color:#B9C3D2;text-decoration:none}' +
  '.dsef a:hover{color:#fff;text-decoration:underline}' +
  '.dsef>.dsef-in{max-width:1200px;margin:0 auto;padding:46px 24px 30px;' +
    
    'display:grid;gap:34px 40px;grid-template-columns:1fr}' +
  '@media(min-width:680px){.dsef>.dsef-in{grid-template-columns:1fr 1fr}}' +
  '@media(min-width:1000px){.dsef>.dsef-in{grid-template-columns:1.6fr 1fr 1fr 1.2fr}}' +
  '.dsef h4{font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;' +
    'text-transform:uppercase;color:#C9A227;margin:0 0 6px;padding-bottom:9px;' +
    'border-bottom:2px solid rgba(201,162,39,.35);display:inline-block}' +
  '.dsef ul{list-style:none;margin:12px 0 0;padding:0}' +
  '.dsef li{margin-bottom:9px;font-size:13.5px}' +
  '.dsef-brand b{display:block;font:700 20px/1.2 "Playfair Display",Georgia,serif;' +
    'color:#fff;margin-bottom:4px}' +
  '.dsef-brand .l{display:block;font:500 11.5px/1.5 ui-monospace,SFMono-Regular,' +
    'Menlo,monospace;color:#8A93A5;margin-bottom:14px}' +
  '.dsef-brand p{margin:0;font-size:13.5px;max-width:46ch;color:#B9C3D2}' +
  '.dsef-social{display:flex;gap:9px;margin-top:18px;flex-wrap:wrap}' +
  '.dsef-social a{display:inline-flex;align-items:center;justify-content:center;' +
    'width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);' +
    'border:1px solid rgba(255,255,255,.14)}' +
  '.dsef-social a:hover{background:#C9A227;border-color:#C9A227;color:#10203A}' +
  '.dsef-social svg{width:15px;height:15px;fill:currentColor}' +
  '.dsef-c{margin:12px 0 0;font-size:13.5px}' +
  '.dsef-c div{margin-bottom:9px;display:flex;gap:9px;align-items:flex-start}' +
  '.dsef-c span{color:#8A93A5;flex:0 0 auto;font-size:11.5px;letter-spacing:.06em;' +
    'text-transform:uppercase;padding-top:2px;min-width:58px}' +
  '.dsef-disc{max-width:1200px;margin:0 auto;padding:0 24px 26px;' +
    'font-size:11.5px;line-height:1.7;color:#7E8898}' +
  '.dsef-disc b{color:#9AA5B6}' +
  '.dsef-disc a{color:#9AA5B6;text-decoration:underline}' +
  '.dsef-bar{border-top:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.22)}' +
  '.dsef-bar div{max-width:1200px;margin:0 auto;padding:15px 24px;' +
    'font-size:12.5px;color:#8A93A5;display:flex;gap:12px;flex-wrap:wrap;' +
    'justify-content:space-between}';

  function linkHTML(l) {
    var ext = /^https?:\/\//.test(l.href || "");
    return '<li><a href="' + esc(l.href) + '"' +
      (ext ? ' target="_blank" rel="noopener noreferrer"' : "") +
      ">" + esc(l.label) + "</a></li>";
  }

  function build() {
    var C = CONTENT, h = "";

    h += '<div class="dsef-in">';

    h += '<div class="dsef-brand"><b>' + esc(C.brand.name) + "</b>" +
         '<span class="l">' + esc(C.brand.line) + "</span>" +
         (C.brand.about ? "<p>" + esc(C.brand.about) + "</p>" : "");
    var soc = "";
    ["facebook", "linkedin", "youtube", "whatsapp"].forEach(function (k) {
      var url = String((C.social || {})[k] || "").trim();
      if (!/^https:\/\//.test(url)) return;         // no URL, no dead icon
      soc += '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"' +
             ' aria-label="DSE Pulse on ' + LABEL[k] + '">' + ICON[k] + "</a>";
    });
    if (soc) h += '<div class="dsef-social">' + soc + "</div>";
    h += "</div>";

    (C.columns || []).forEach(function (col) {
      if (!col.links || !col.links.length) return;
      h += "<div><h4>" + esc(col.title) + "</h4><ul>" +
           col.links.map(linkHTML).join("") + "</ul></div>";
    });

    var ct = C.contact || {}, rows = "";
    if (ct.address) rows += "<div><span>Office</span>" + esc(ct.address) + "</div>";
    if (ct.phone)   rows += '<div><span>Phone</span><a href="tel:' +
                            esc(ct.phone.replace(/\s+/g, "")) + '">' +
                            esc(ct.phone) + "</a></div>";
    if (ct.email)   rows += '<div><span>Email</span><a href="mailto:' +
                            esc(ct.email) + '">' + esc(ct.email) + "</a></div>";
    if (ct.hours)   rows += "<div><span>Hours</span>" + esc(ct.hours) + "</div>";
    //  The whole column disappears until there is something real to put in it.
    if (rows) h += "<div><h4>" + esc(ct.title || "Contact") + '</h4>' +
                   '<div class="dsef-c">' + rows + "</div></div>";

    h += "</div>";

    if (C.disclaimer) h += '<div class="dsef-disc">' + C.disclaimer + "</div>";
    if (C.copyright)  h += '<div class="dsef-bar"><div><span>' +
                           esc(C.copyright) + "</span></div></div>";
    return h;
  }

  function paint() {
    if (document.querySelector("footer.dsef")) return;
    try {
      if (!document.getElementById("dsef-css")) {
        var st = document.createElement("style");
        st.id = "dsef-css";
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
      }
      var f = document.createElement("footer");
      f.className = "dsef";
      f.innerHTML = build();

      //  Replace a page's own footer rather than adding a second one. This is
      //  what lets home.html and shell.html join in without being edited.
      var old = document.querySelector("footer:not(.dsef)");
      if (old && old.parentNode) old.parentNode.replaceChild(f, old);
      else document.body.appendChild(f);
    } catch (e) {}
  }

  if (shouldSkip()) return;
  if (document.readyState !== "loading") paint();
  else document.addEventListener("DOMContentLoaded", paint);
})();
