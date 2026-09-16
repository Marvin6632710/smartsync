/*
 * Runs in <head>, before the stylesheet and before anything is painted, so
 * the page opens in the theme it was left in rather than flashing light
 * and then switching. It is a plain script served from this origin
 * because the hosting Content-Security-Policy does not allow inline
 * scripts — see firebase.json. The same rules live in src/theme/index.js,
 * which takes over once the app has loaded.
 */
;(function () {
  var root = document.documentElement
  var dark = false
  try {
    var stored = localStorage.getItem('smartsync:theme')
    if (stored === 'dark') dark = true
    else if (stored !== 'light') dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch (error) {
    // No storage or no matchMedia: light, the way the stylesheet starts.
  }
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
