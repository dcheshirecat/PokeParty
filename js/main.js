'use strict';
// ── BOOT ────────────────────────────────────────────────────────────────────

Act.go = d => UI.go(d.arg, {...d});

// One delegated listener for every [data-act] element in the app
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = Act[el.dataset.act];
  if (!fn) return;
  if (!G && !['newGame', 'continue', 'deleteSlot'].includes(el.dataset.act) && UI.current() !== 'starter') return;
  SFX.tap();
  Promise.resolve(fn(el.dataset, el, e)).catch(err => {
    console.error(err);
    UI.toast('Something went wrong — please try again', 'bad');
  });
});

// The battle screen lives in its own DOM tree
UI.Screens.battle = {root: 'battle'};

window.addEventListener('DOMContentLoaded', () => {
  Battle.init();
  UI.go('title');
});

// Save when the app is backgrounded (Android WebView / mobile browsers)
document.addEventListener('visibilitychange', () => { if (document.hidden && G) Store.save(); });
