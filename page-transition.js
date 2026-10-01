// ---------- Page transition: fallback ----------
// The page transition itself is CSS (styles.css → PAGE TRANSITION): browsers
// that run view transitions across documents do it on their own. They only do
// so between pages served over http(s) from one origin, so opening the files
// straight from disk, the app's file preview, or a browser without the
// cross-document kind (Firefox) got a plain cut. There, this plays the same
// move in two halves with same-document view transitions:
//   · on the way out, the page shrinks and is carried up off a red screen
//   · on the way in, the new page rises from below and grows to fill it
// Loaded in <head>, before first paint, so an arriving page can hold itself
// hidden behind the red until its half runs.
(function pageTransition() {
  const root = document.documentElement;
  const KEY = 'pt-enter';
  const native = 'PageRevealEvent' in window && /^https?:$/.test(location.protocol);
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // window.pageReady resolves once this page fills the screen: when the
  // arriving transition (either kind) has finished, or on load when there is
  // none. Entrance effects on the page wait for it.
  let ready;
  window.pageReady = new Promise((resolve) => { ready = resolve; });
  const readyOnLoad = () => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  };
  if (native) {
    window.addEventListener('pagereveal', (e) => {
      if (e.viewTransition) e.viewTransition.finished.then(ready, ready);
      else ready();
    }, { once: true });
  }

  if (native || reduce || typeof document.startViewTransition !== 'function') {
    if (!native) readyOnLoad();
    return;
  }

  // ---- arriving: cover the page in red, then let it rise in -------------
  let entering = false;
  try {
    entering = sessionStorage.getItem(KEY) === '1';
    sessionStorage.removeItem(KEY);
  } catch (e) {}
  // storage can be walled off for files opened from disk; the tab's name
  // carries the flag across the navigation instead
  if (window.name === KEY) { entering = true; window.name = ''; }

  if (entering) {
    root.classList.add('pt-cover');
    const reveal = () => {
      root.classList.add('pt-in');
      try {
        const vt = document.startViewTransition(() => root.classList.remove('pt-cover'));
        vt.finished.finally(() => { root.classList.remove('pt-in'); ready(); });
      } catch (e) {
        root.classList.remove('pt-cover', 'pt-in');
        ready();
      }
    };
    const start = () => requestAnimationFrame(() => requestAnimationFrame(reveal));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  } else {
    readyOnLoad();
  }

  // ---- leaving: play the way out, then follow the link ------------------
  const samePlace = (url) => (url.protocol === 'file:'
    ? location.protocol === 'file:'
    : url.origin === location.origin);

  let leaving = false;
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if (!samePlace(url)) return;
    // a jump within this page stays a jump
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    if (leaving) return;
    leaving = true;
    const go = () => {
      try { sessionStorage.setItem(KEY, '1'); } catch (err) {}
      window.name = KEY;
      location.href = url.href;
    };
    try {
      root.classList.add('pt-out');
      document.startViewTransition(() => root.classList.add('pt-cover')).finished.finally(go);
    } catch (err) {
      go();
    }
  };
  // registered once the page's own scripts have theirs, so a link they take
  // over (the contact panel) is already marked handled when this runs
  document.addEventListener('DOMContentLoaded', () => document.addEventListener('click', onClick));

  // coming back to this page from the history cache: don't leave it red
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    leaving = false;
    root.classList.remove('pt-cover', 'pt-out', 'pt-in');
  });
})();
