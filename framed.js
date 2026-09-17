/* DSE Pulse — what a tool page looks like INSIDE the dashboard
 * ===========================================================================
 * THE PROBLEM
 *   Every tool page — overview, market, wma, tech, combined, bd, sectors,
 *   picks, risk, screener, comparison, fundamentals, crosstool, trackrecord,
 *   calculator, mastersignal, smartmoney — is a complete standalone page. It
 *   carries its own header with the DSE Pulse logo and a "Back to app" link,
 *   its own big serif title, a subtitle describing itself, and its own
 *   disclaimer line.
 *
 *   All of that is right when the page is opened on its own. Inside the
 *   dashboard iframe every bit of it is a second copy of something already on
 *   screen: the shell has the logo, has "Back to site", and the tab you just
 *   clicked is called Overview — so a 24px serif heading saying "Overview" is
 *   telling you where you already know you are.
 *
 *   Measured on overview.html at the dashboard's own width: 1390px of page to
 *   show 564px of content. 169px of that is chrome this file removes, and it
 *   is the difference between the market view fitting one screen and not.
 *
 * WHY A SCRIPT AND NOT SEVENTEEN EDITS
 *   Same reason as footer.js. Seventeen pages means seventeen edits every time
 *   the rule changes, and the seventeenth is the one that gets missed. env.js
 *   already loads on every page, so this reaches all of them and no page needs
 *   touching.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It never runs at the top level. A page opened on its own is unchanged,
 *   down to the pixel — that is what makes this safe to ship to seventeen
 *   pages at once without seeing sixteen of them.
 *
 *   It does not delete the disclaimer. That line is compressed, not removed:
 *   the words still render, they just stop costing 65px. Removing a risk
 *   disclaimer is not a layout decision and is not made here.
 * ===========================================================================
 */
(function () {
  "use strict";

  //  Top level, or a frame we cannot see out of? Either way, do nothing.
  try {
    if (window.top === window.self) return;
  } catch (e) {
    return;                      // cross-origin: not our dashboard, leave alone
  }
  if (document.getElementById("dse-framed-css")) return;

  var CSS =
  //  The standalone header. Inside the dashboard the logo is already at the
  //  top of the window and "Back to site" is already beside the greeting.
  '.hdr{display:none!important}' +

  //  The page's own title and subtitle. The dashboard tab names the page, and
  //  a subtitle that describes what the page shows is describing something the
  //  reader is looking at.
  '.h-title,.h-sub{display:none!important}' +

  //  960px inside a 1100px pane is a column of empty either side, and a
  //  narrower column means more wrapped lines, which means more height. Let it
  //  fill the pane; trim the padding that was sized for a standalone page.
  '.wrap{max-width:none!important;padding:12px 16px 14px!important;' +
    'margin:0!important}' +

  //  The disclaimer stays. It just stops being a 65px band.
  '.foot{padding:10px 0 4px!important;margin-top:6px!important;' +
    'font-size:10.5px!important;text-align:left!important}' +

  //  A tool page sets min-height on body for its standalone life; in a frame
  //  that forces a scrollbar the content does not need.
  'html,body{min-height:0!important}' +
  'body{background:transparent!important}';

  function paint() {
    try {
      var st = document.createElement("style");
      st.id = "dse-framed-css";
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
      //  A hook for anything that wants to know, without re-testing window.top
      (document.documentElement || {}).setAttribute &&
        document.documentElement.setAttribute("data-dse-framed", "1");
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
    //  and immediately, so the chrome never flashes before being hidden
    paint();
  } else {
    paint();
  }
})();
