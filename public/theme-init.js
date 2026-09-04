/**
 * Applies the saved theme before first paint, so a dark-mode user does not get
 * a white flash on every cold load.
 *
 * This lives in a file rather than inline in index.html for one reason: the
 * production Content-Security-Policy is `script-src 'self'`, which permits no
 * inline script, no hash and no nonce. As an inline block this ran nowhere —
 * it was blocked in every browser, the flash it exists to prevent happened on
 * every load, and each one logged a CSP violation.
 *
 * A hash in the CSP header would have worked, but the header lives on the
 * server and this code lives in the repo, so the two would drift silently the
 * first time anyone edited these few lines. A same-origin file costs one cached
 * request and cannot drift.
 *
 * Keep it dependency-free and synchronous: it must complete before the browser
 * paints, so it is a classic blocking script in <head>, not a module.
 */
(function () {
  try {
    var theme = localStorage.getItem("plektos-theme") || "dark";
    if (theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.classList.add(theme);
  } catch (e) {
    // Private mode, or storage blocked entirely. Dark is the app's default.
    document.documentElement.classList.add("dark");
  }
})();
