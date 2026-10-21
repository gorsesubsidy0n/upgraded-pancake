// Safety net. If auth.js did not finish — a stray quote in a pasted code
// line is the usual reason — every function below it is missing and the
// gate never mounts. Say so plainly instead of leaving a blank page.
// (External file rather than inline so the page can ship a strict CSP.)
if (typeof ihMountGate !== 'function') {
  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div');
    d.id = 'ih-boot-fail';
    d.innerHTML =
      '<div class="ih-boot-fail-card">' +
      '<h1>\u26a0 Inspire Habits could not start</h1>' +
      '<p><code>auth.js</code> stopped partway through, so the access ' +
      'gate never loaded. The app is being kept shut rather than left ' +
      'unlocked.</p>' +
      '<p>This almost always means a pasted access-code line is broken \u2014 ' +
      'a missing quote or comma. Open <code>auth.js</code>, check the two ' +
      'lines between the PASTE markers, then re-publish.</p>' +
      '<p class="ih-boot-fail-hint">The exact error is in the browser ' +
      'console (F12 \u2192 Console).</p>' +
      '</div>';
    document.body.appendChild(d);
  });
}
