// ---------- Lenis smooth scroll (nudot-style inertia) ----------
// Momentum scrolling like nudot's Lenis setup. Lenis scrolls the real window,
// so native scroll events + getBoundingClientRect + position:sticky keep working.
let lenis = null;
if (typeof Lenis !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  lenis = new Lenis({
    duration: 1.15,               // ~nudot feel: slightly heavy glide
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out, like GSAP power4.out
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.4,
  });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

// ---------- Scramble text on hover (nav tabs / menu links) ----------
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

class ScrambleText {
  constructor(el) {
    this.el = el;
    this.originalText = el.textContent;
    this.frame = 0;
    this.queue = [];
    this.frameRequest = null;
  }

  // keeps the case of the letter it stands in for, so sentence-case links
  // don't swell with capitals while they scramble
  randomChar(to) {
    const c = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    return to === to.toLowerCase() && to !== to.toUpperCase() ? c.toLowerCase() : c;
  }

  run() {
    const text = this.originalText;
    this.queue = text.split('').map((to, i) => ({
      to,
      start: Math.floor(i * 2 + Math.random() * 4),
      end: Math.floor(i * 2 + 8 + Math.random() * 8),
      char: null,
    }));
    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;
    this.update();
  }

  update() {
    let output = '';
    let complete = 0;
    this.queue.forEach((item) => {
      if (item.to === ' ') {
        output += ' ';
        complete++;
        return;
      }
      if (this.frame >= item.end) {
        output += item.to;
        complete++;
      } else if (this.frame >= item.start) {
        if (!item.char || Math.random() < 0.5) item.char = this.randomChar(item.to);
        output += item.char;
      } else {
        output += item.to;
      }
    });
    this.el.textContent = output;
    if (complete < this.queue.length) {
      this.frame++;
      this.frameRequest = requestAnimationFrame(() => this.update());
    } else {
      this.el.textContent = this.originalText;
    }
  }
}

document.querySelectorAll('.nav__links a, .menu-link, .menu-sublink').forEach((el) => {
  const scrambler = new ScrambleText(el);
  el.addEventListener('mouseenter', () => scrambler.run());
  el.addEventListener('focus', () => scrambler.run());
});

// ---------- Headings: pixel mosaic reveal ----------
// A heading builds itself out of blocks: coarse squares appear where its
// letters will be, break into smaller squares, then into the letters
// themselves — sweeping left to right, each region on its own luck. The text
// is drawn to an offscreen canvas first (from the heading's own laid-out
// letters, so wrapping, size and colour match) to know where the ink is; a
// canvas over the heading plays the reveal while the real text waits hidden,
// and hands back to it when done. Every h1/h2 plays it once as it comes into
// view, and again whenever it's hovered; the home hero title (after the loader) and the Works title (after
// the page transition) are started by their own pages.
const pixelReveal = (() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (i, j, k) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  // every letter of the heading with its box, font and colour
  const lettersOf = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const cs = getComputedStyle(node.parentElement);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const upper = cs.textTransform === 'uppercase';
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i])) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r || !r.width) continue;
        out.push({ ch: upper ? text[i].toUpperCase() : text[i], r, font, color: cs.color });
      }
    }
    return out;
  };

  // replay (on hover) hides the text by opacity rather than visibility, so the
  // heading keeps the cursor and doesn't read the replay as leaving and
  // coming back
  const play = (el, { duration = 1100, delay = 0, replay = false } = {}) => new Promise((resolve) => {
    const show = () => {
      if (replay) el.style.opacity = '';
      else el.style.visibility = 'visible';
      delete el.dataset.pxBusy;
      resolve();
    };
    if (still) { show(); return; }
    el.dataset.pxBusy = '1';
    if (replay) el.style.opacity = '0';
    else el.style.visibility = 'hidden';
    setTimeout(() => {
      const box = el.getBoundingClientRect();
      const letters = lettersOf(el);
      if (!letters.length || !box.width) { show(); return; }
      const PAD = 6;
      const W = Math.ceil(box.width + PAD * 2);
      const H = Math.ceil(box.height + PAD * 2);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // the ink: the heading's letters, drawn where they're laid out
      const ink = document.createElement('canvas');
      ink.width = Math.round(W * dpr);
      ink.height = Math.round(H * dpr);
      const ictx = ink.getContext('2d');
      ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
      letters.forEach(({ ch, r, font, color }) => {
        ictx.font = font;
        ictx.fillStyle = color;
        const m = ictx.measureText(ch);
        const ascent = m.fontBoundingBoxAscent || r.height * 0.8;
        ictx.fillText(ch, r.left - box.left + PAD, r.top - box.top + PAD + ascent);
      });
      const alpha = ictx.getImageData(0, 0, ink.width, ink.height).data;

      // block sizes: three steps down to a fine square, then the letters
      const size = parseFloat(getComputedStyle(el).fontSize) || 48;
      const B = Math.max(4, Math.min(14, size * 0.09));
      const S = [B * 4, B * 2, B];
      const cover = (x, y, s) => {
        // the share of the block that's ink, sampled on a coarse grid
        let hit = 0, n = 0;
        const step = Math.max(1, Math.floor((s * dpr) / 6));
        for (let yy = Math.floor(y * dpr); yy < Math.min(ink.height, (y + s) * dpr); yy += step) {
          for (let xx = Math.floor(x * dpr); xx < Math.min(ink.width, (x + s) * dpr); xx += step) {
            n++;
            if (alpha[(yy * ink.width + xx) * 4 + 3] > 60) hit++;
          }
        }
        return n ? hit / n : 0;
      };
      const color = letters[0].color;
      // the blocks, coarse to fine; each has a start time and its children
      // follow it, so a region always goes coarse → finer → letters
      const SEG = 0.1;
      const blocks = [];
      for (let y = 0, by = 0; y < H; y += S[0], by++) {
        for (let x = 0, bx = 0; x < W; x += S[0], bx++) {
          const t0 = 0.5 * (x / W) + 0.25 * rand(bx, by, 1);
          const kids = [];
          for (let y2 = y, cy = 0; y2 < y + S[0] && y2 < H; y2 += S[1], cy++) {
            for (let x2 = x, cx = 0; x2 < x + S[0] && x2 < W; x2 += S[1], cx++) {
              const t1 = t0 + SEG * (1 + 0.5 * rand(bx * 2 + cx, by * 2 + cy, 2));
              const fine = [];
              for (let y3 = y2, fy = 0; y3 < y2 + S[1] && y3 < H; y3 += S[2], fy++) {
                for (let x3 = x2, fx = 0; x3 < x2 + S[1] && x3 < W; x3 += S[2], fx++) {
                  const t2 = t1 + SEG * (1 + 0.5 * rand(bx * 4 + cx * 2 + fx, by * 4 + cy * 2 + fy, 3));
                  fine.push({ x: x3, y: y3, t2, t3: t2 + SEG * (1 + 0.5 * rand(x3 | 0, y3 | 0, 4)), on: cover(x3, y3, S[2]) > 0.3 });
                }
              }
              kids.push({ x: x2, y: y2, t1, on: cover(x2, y2, S[1]) > 0.25, fine });
            }
          }
          blocks.push({ x, y, t0, on: cover(x, y, S[0]) > 0.15, kids });
        }
      }
      const END = 1 + SEG * 4;

      const cv = document.createElement('canvas');
      cv.className = 'px-reveal';
      cv.setAttribute('aria-hidden', 'true');
      cv.width = ink.width;
      cv.height = ink.height;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      cv.style.mixBlendMode = getComputedStyle(el).mixBlendMode;
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d');
      const t0 = performance.now();
      const frame = (now) => {
        // it rides along with the heading if the page moves meanwhile
        const b = el.getBoundingClientRect();
        cv.style.transform = `translate(${b.left - PAD}px,${b.top - PAD}px)`;
        const u = ((now - t0) / duration) * END;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = color;
        blocks.forEach((bl) => {
          if (u < bl.t0) return;
          bl.kids.forEach((k) => {
            if (u < k.t1) { if (bl.on) ctx.fillRect(bl.x, bl.y, S[0], S[0]); return; }
            k.fine.forEach((f) => {
              if (u < f.t2) { if (k.on) ctx.fillRect(k.x, k.y, S[1], S[1]); return; }
              if (u < f.t3) { if (f.on) ctx.fillRect(f.x, f.y, S[2], S[2]); return; }
              ctx.drawImage(ink, f.x * dpr, f.y * dpr, S[2] * dpr, S[2] * dpr, f.x, f.y, S[2], S[2]);
            });
          });
        });
        if (u < END) requestAnimationFrame(frame);
        else { cv.remove(); show(); }
      };
      requestAnimationFrame(frame);
    }, delay);
  });

  // and plays again, quicker, whenever the cursor comes onto it (not while
  // it's still building, and not before it has first come in)
  document.querySelectorAll('h1, h2').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      if (still || el.dataset.pxBusy || el.style.visibility === 'hidden') return;
      play(el, { duration: 900, replay: true });
    });
  });

  // every h1/h2 plays once as it comes into view, unless its page starts it
  const manual = (el) => el.matches('.whero__title')
    || (el.matches('.hero__title') && document.documentElement.classList.contains('is-loading'));
  const heads = Array.from(document.querySelectorAll('h1, h2')).filter((el) => !manual(el));
  if (!still && 'IntersectionObserver' in window && heads.length) {
    heads.forEach((el) => { el.style.visibility = 'hidden'; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        play(entry.target);
      });
    }, { threshold: 0.35 });
    const start = () => heads.forEach((el) => io.observe(el));
    Promise.all([window.pageReady || Promise.resolve(), document.fonts ? document.fonts.ready : null]).then(start);
  }
  return play;
})();

// ---------- Nav theme swap (dark/light) based on section behind it ----------
const nav = document.getElementById('nav');
// Exclude the nav itself — it also carries [data-theme] to set its own
// initial CSS state, but must never be treated as content to observe
// (it's fixed at the very top edge, so it can never validly "intersect"
// the shrunk rootMargin band below, which left it permanently stuck on
// whichever theme last fired once a page had more than one theme value).
const themedSections = document.querySelectorAll('[data-theme]:not(nav)');

if (nav && themedSections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        nav.setAttribute('data-theme', entry.target.dataset.theme);
      }
    });
  }, { rootMargin: '-80px 0px -85% 0px', threshold: 0 });

  themedSections.forEach((section) => navObserver.observe(section));

  // Safety net: at the very bottom of the page (incl. trackpad overscroll),
  // the IntersectionObserver's shrunk rootMargin band can miss the last
  // section crossing it — force the theme to match whatever section is
  // actually last on the page once we're at (or past) max scroll.
  const lastThemedSection = themedSections[themedSections.length - 1];
  const updateBottomTheme = () => {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) nav.setAttribute('data-theme', lastThemedSection.dataset.theme);
  };
  window.addEventListener('scroll', updateBottomTheme, { passive: true });
  window.addEventListener('resize', updateBottomTheme);
  updateBottomTheme();
}

// ---------- Nav (project pages): hide while scrolling down, show again on the way up ----------
// Home and Works keep the nav on screen the whole way down.
(function autoHideNav() {
  const nav = document.getElementById('nav');
  const menu = document.getElementById('menuOverlay');
  if (!nav || document.body.classList.contains('home') || document.body.classList.contains('works-page')) return;
  const DELTA = 6; // ignore the tiny jitter of trackpads and smooth scroll
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const diff = y - lastY;
    if (Math.abs(diff) < DELTA) return;
    const menuOpen = menu && menu.classList.contains('is-open');
    // always shown near the top, or while the menu is open
    nav.classList.toggle('is-hidden', diff > 0 && y > nav.offsetHeight && !menuOpen);
    lastY = y;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
})();

// ---------- Home: curtain-reveal the fixed footer once its spacer enters the
// viewport (mirror of the pinned hero above). Keeping the footer hidden until
// then is what stops the bottom-fixed footer from covering the hero up top. An
// IntersectionObserver drives it so it fires reliably under Lenis, native scroll
// or none. ----------
const revealFooterEl = document.querySelector('body.home .sfooter');
const revealFooterSpacer = document.querySelector('body.home .sfooter__reveal');
if (revealFooterEl && revealFooterSpacer && 'IntersectionObserver' in window) {
  const footerObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      revealFooterEl.classList.toggle('is-revealing', entry.isIntersecting);
    });
  }, { rootMargin: '0px 0px 100px 0px' }); // arm just before .works uncovers it
  footerObserver.observe(revealFooterSpacer);
}

// ---------- Custom scrollbar (desktop) ----------
// A short rail on the right edge in place of the browser's bar: a 48px thumb
// on a 176px track, blended (exclusion) so it reads over any section. It only
// shows while the page moves, is hovered or is being dragged, and fades once
// the page has been still for half a second. Dragging the thumb scrolls the
// page (through Lenis when it's running, so the glide stays the same).
(function customScrollbar() {
  const desktop = matchMedia('(min-width: 768px) and (pointer: fine)');
  const bar = document.createElement('div');
  bar.className = 'sbar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<span class="sbar__track"></span><span class="sbar__thumb"></span>';
  document.body.appendChild(bar);
  const thumb = bar.querySelector('.sbar__thumb');
  document.documentElement.classList.add('has-sbar');

  const IDLE_MS = 500;
  let idleTimer = null;
  let hovering = false;
  let dragging = false;
  let queued = false;

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const travel = () => bar.clientHeight - thumb.offsetHeight;

  const place = () => {
    queued = false;
    const max = maxScroll();
    bar.classList.toggle('is-empty', max < 1);
    const p = max ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    thumb.style.transform = `translate3d(0,${(p * travel()).toFixed(1)}px,0)`;
  };
  const queuePlace = () => {
    if (!queued) { queued = true; requestAnimationFrame(place); }
  };

  const show = () => {
    bar.classList.add('is-on');
    clearTimeout(idleTimer);
    if (!hovering && !dragging) idleTimer = setTimeout(() => bar.classList.remove('is-on'), IDLE_MS);
  };

  window.addEventListener('scroll', () => { queuePlace(); if (desktop.matches) show(); }, { passive: true });
  window.addEventListener('resize', queuePlace);
  bar.addEventListener('pointerenter', () => { hovering = true; show(); });
  bar.addEventListener('pointerleave', () => { hovering = false; show(); });

  // drag: the thumb's travel maps onto the whole scroll range
  let startY = 0;
  let startScroll = 0;
  thumb.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startScroll = window.scrollY;
    thumb.setPointerCapture(e.pointerId);
    bar.classList.add('is-dragging');
    show();
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const y = startScroll + ((e.clientY - startY) / Math.max(1, travel())) * maxScroll();
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('is-dragging');
    show();
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);

  place();
})();

// ---------- Nav language pill: EN / VN ----------
// Only the switch itself for now: it lights the chosen language, remembers it
// and sets the page's lang; the copy has no VN version to swap in yet.
const langToggle = document.getElementById('langToggle');
if (langToggle) {
  const parts = langToggle.querySelectorAll('[data-lang]');
  const setLang = (lang) => {
    parts.forEach((el) => el.classList.toggle('is-on', el.dataset.lang === lang));
    document.documentElement.lang = lang === 'vn' ? 'vi' : 'en';
    langToggle.setAttribute('aria-label', lang === 'vn' ? 'Switch to English' : 'Chuyển sang tiếng Việt');
  };
  let lang = 'en';
  try { lang = localStorage.getItem('957-lang') === 'vn' ? 'vn' : 'en'; } catch (e) {}
  setLang(lang);
  langToggle.addEventListener('click', () => {
    lang = lang === 'en' ? 'vn' : 'en';
    setLang(lang);
    try { localStorage.setItem('957-lang', lang); } catch (e) {}
  });
}

// ---------- Menu: red card morphing out of the nav's four dots ----------
const menuToggle = document.getElementById('menuToggle');
const menuOverlay = document.getElementById('menuOverlay');
const menuClose = document.getElementById('menuClose');

if (menuToggle && menuOverlay && menuClose) {
  let settleTimer = null;
  // stagger index for the rise-in, in reading order
  menuOverlay.querySelectorAll('.menu-link, .menu-overlay__label, .menu-sublink')
    .forEach((el, i) => el.style.setProperty('--i', i));

  // the morph's start: the card's clip is measured onto the toggle's box, and
  // each of the close button's nine dots onto the nearest of the toggle's four
  // (the middle row and column split between them), so opening spreads the
  // dots into the grid as the card grows out of the button — and closing
  // gathers them back
  const panel = menuOverlay.querySelector('.menu-overlay__panel');
  const gridDots = Array.from(menuClose.querySelectorAll('i'));
  const toggleDots = Array.from(menuToggle.querySelectorAll('i'));
  // the toggle's dots in the order top-left, bottom-left, bottom-right, top-right
  const corner = (col, row) => {
    const right = col === 2 || (col === 1 && row !== 1);
    const bottom = row === 2 || (row === 1 && col !== 1);
    return right ? (bottom ? 2 : 3) : (bottom ? 1 : 0);
  };
  const measureMorph = () => {
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const t = menuToggle.getBoundingClientRect();
    if (!p.width || !t.width) return;
    panel.style.setProperty('--mt', `${t.top - p.top}px`);
    panel.style.setProperty('--ml', `${t.left - p.left}px`);
    panel.style.setProperty('--mr', `${p.right - t.right}px`);
    panel.style.setProperty('--mb', `${p.bottom - t.bottom}px`);
    gridDots.forEach((dot, i) => {
      const home = toggleDots[corner(i % 3, Math.floor(i / 3))];
      if (!home) return;
      // measured without the dot's own offset, so it's where it sits in the grid
      dot.style.setProperty('--dx', '0px');
      dot.style.setProperty('--dy', '0px');
      dot.style.transition = 'none';
      const g = dot.getBoundingClientRect();
      const h = home.getBoundingClientRect();
      dot.style.setProperty('--dx', `${h.left + h.width / 2 - (g.left + g.width / 2)}px`);
      dot.style.setProperty('--dy', `${h.top + h.height / 2 - (g.top + g.height / 2)}px`);
      dot.style.setProperty('--k', i);
      void dot.offsetWidth;
      dot.style.transition = '';
    });
  };
  window.addEventListener('resize', () => {
    if (!menuOverlay.classList.contains('is-open')) measureMorph();
  });

  const setMenu = (open) => {
    clearTimeout(settleTimer);
    if (open) {
      // fresh from wherever the toggle is now (the nav may have moved), and
      // committed before the card starts to grow
      measureMorph();
      void panel.offsetWidth;
    }
    menuOverlay.classList.toggle('is-open', open);
    menuOverlay.classList.remove('is-settled');
    menuToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      settleTimer = setTimeout(() => menuOverlay.classList.add('is-settled'), 1250);
      menuClose.focus({ preventScroll: true });
    }
  };
  menuToggle.setAttribute('aria-expanded', 'false');

  menuToggle.addEventListener('click', () => setMenu(!menuOverlay.classList.contains('is-open')));
  menuClose.addEventListener('click', () => {
    setMenu(false);
    menuToggle.focus({ preventScroll: true });
  });
  // a click anywhere outside the card closes it
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOverlay.classList.contains('is-open')) setMenu(false);
  });
  menuOverlay.querySelectorAll('.menu-link, .menu-sublink').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
  });
}

// ---------- Hero stage: the image grows to fill the screen, then the about copy rises over it ----------
// One pinned stage, three beats driven by how far the page has scrolled into it
// (frames 1 → 4 of the Figma storyboard):
//   1. the image grows from its slot in the middle of the frame to the full viewport
//      height and a third of the width, while the heading block drifts up over it
//   2. then to the full width, its corners squaring off, as the block scrolls out
//   3. a black veil settles over it and the about copy scrolls up through the
//      frame, each word sharpening in as it crosses the reveal line
// The stage's height is set here from the copy's measured height, so the copy
// moves 1:1 with the scroll and the stage lets go once the last line is read.
const heroStage = document.getElementById('hero');
const heroMedia = heroStage && heroStage.querySelector('.hero__media');

if (heroStage && heroMedia) {
  const sticky = heroStage.querySelector('.hero__sticky');
  const slot = heroStage.querySelector('.hero__media-slot');
  const intro = heroStage.querySelector('.hero__intro');
  const shade = heroStage.querySelector('.hero__shade');
  // the clip sits bowed into the page at rest, like a curved screen seen from
  // the front: its top edge dips toward the middle and its bottom edge rises,
  // the middle a touch darker for lying further back. It flattens out over the
  // first stretch of the scroll as it starts to grow.
  const BOW = 0.06;       // how far the edges bow in at the middle, per px of height
  const FLAT_AT = 0.5;    // flat (and clear) by this far into beat 1
  const bow = document.createElement('span');
  bow.className = 'hero__bow';
  bow.setAttribute('aria-hidden', 'true');
  heroMedia.appendChild(bow);

  // the old-TV look at rest: soft, a little hot, the red and blue channels
  // pulled apart, under scanlines, grain and a slow rolling band; it clears
  // as the clip flattens, while the picture eases back from a 10% zoom, so
  // the clip opens up into focus. The channel split is an SVG filter (Safari
  // draws SVG filters on video unreliably, so it goes without).
  const tvVideo = heroMedia.querySelector('.hero__video');
  const tv = document.createElement('span');
  tv.className = 'hero__tv';
  tv.setAttribute('aria-hidden', 'true');
  heroMedia.appendChild(tv);
  const splitOK = !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  let splitR = null;
  let splitB = null;
  if (splitOK) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="heroTv" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
      <feOffset in="r" dx="0" dy="0" result="rs"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
      <feOffset in="b" dx="0" dy="0" result="bs"/>
      <feBlend in="rs" in2="g" mode="screen" result="rg"/>
      <feBlend in="rg" in2="bs" mode="screen"/>
    </filter>`;
    document.body.appendChild(svg);
    [splitR, splitB] = svg.querySelectorAll('feOffset');
  }
  let lastTv = -1;
  // under the cursor the clip comes apart into pixels: every square in a
  // small round the cursor takes the frame's colour there, splits into four
  // and the quarters drift out from the cursor over the clip itself; as the
  // cursor moves on they slow, come back together and the clip shows through
  // again. Each square keeps an energy the cursor tops up and time drains;
  // only lit squares are drawn, and the loop sleeps once they're all back.
  // The canvas lies inside the clip, under the TV layer, so the pieces never
  // leave the frame or change its shape.
  if (tvVideo && matchMedia('(hover: hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const CELL = 14;          // px
    const REACH = 56;         // px around the cursor that comes apart
    const DRIFT = 22;         // px the quarters travel at full energy
    const DECAY = 0.93;       // energy kept per frame
    const shatter = document.createElement('canvas');
    shatter.className = 'hero__shatter';
    shatter.setAttribute('aria-hidden', 'true');
    tvVideo.after(shatter);
    const sctx = shatter.getContext('2d');
    const sample = document.createElement('canvas');
    const pctx = sample.getContext('2d', { willReadFrequently: true });
    let cols = 0, rows = 0, W = 0, H = 0, dpr = 1;
    let energy = new Float32Array(0);
    let dirX = new Float32Array(0);   // which way each square's pieces drift:
    let dirY = new Float32Array(0);   // away from where the cursor struck it
    const live = new Set();
    let raf = 0;
    let pointer = null;

    const fit = () => {
      const w = heroMedia.clientWidth;
      const h = heroMedia.clientHeight;
      if (w === W && h === H) return;
      W = w; H = h;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      shatter.width = Math.round(W * dpr);
      shatter.height = Math.round(H * dpr);
      cols = Math.ceil(W / CELL);
      rows = Math.ceil(H / CELL);
      sample.width = cols * 2;
      sample.height = rows * 2;
      energy = new Float32Array(cols * rows);
      dirX = new Float32Array(cols * rows);
      dirY = new Float32Array(cols * rows);
      live.clear();
    };

    // the frame at two samples a square, cropped as object-fit: cover crops it
    const grab = () => {
      const vw = tvVideo.videoWidth, vh = tvVideo.videoHeight;
      if (!vw || tvVideo.readyState < 2) return false;
      const scale = Math.max(W / vw, H / vh);
      const sw = W / scale, sh = H / scale;
      pctx.drawImage(tvVideo, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, sample.width, sample.height);
      return true;
    };

    const strike = (i, e, dx, dy) => {
      if (e <= energy[i]) return;
      energy[i] = e;
      dirX[i] = dx;
      dirY[i] = dy;
      live.add(i);
    };

    const frame = () => {
      raf = 0;
      if (pointer) {
        const c0 = Math.max(0, Math.floor((pointer.x - REACH) / CELL));
        const c1 = Math.min(cols - 1, Math.floor((pointer.x + REACH) / CELL));
        const r0 = Math.max(0, Math.floor((pointer.y - REACH) / CELL));
        const r1 = Math.min(rows - 1, Math.floor((pointer.y + REACH) / CELL));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const ox = (c + 0.5) * CELL - pointer.x, oy = (r + 0.5) * CELL - pointer.y;
            const d = Math.hypot(ox, oy);
            if (d > REACH) continue;
            strike(r * cols + c, 1 - d / REACH, ox / (d || 1), oy / (d || 1));
          }
        }
      }
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, shatter.width, shatter.height);
      if (!live.size || !grab()) { if (live.size) raf = requestAnimationFrame(frame); return; }
      const px = pctx.getImageData(0, 0, sample.width, sample.height).data;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const half = CELL / 2;
      live.forEach((i) => {
        const e = energy[i];
        const c = i % cols, r = (i / cols) | 0;
        const x = c * CELL, y = r * CELL;
        // nothing is blacked out behind a square: its pieces just shift over
        // the clip, so no dark disc forms round the cursor
        for (let q = 0; q < 4; q++) {
          const qx = q & 1, qy = q >> 1;
          const s = (r * 2 + qy) * sample.width + (c * 2 + qx);
          const away = DRIFT * e * e * (0.6 + 0.8 * (((i * 7 + q * 13) % 10) / 10));
          const size = half * (1 - 0.35 * e);
          sctx.fillStyle = `rgb(${px[s * 4]},${px[s * 4 + 1]},${px[s * 4 + 2]})`;
          sctx.fillRect(
            x + qx * half + (half - size) / 2 + dirX[i] * away + (qx - 0.5) * away * 0.5,
            y + qy * half + (half - size) / 2 + dirY[i] * away + (qy - 0.5) * away * 0.5,
            size, size,
          );
        }
        energy[i] = e * DECAY;
        if (energy[i] < 0.03) { energy[i] = 0; live.delete(i); }
      });
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

    sticky.addEventListener('pointermove', (e) => {
      const box = heroMedia.getBoundingClientRect();
      const x = e.clientX - box.left, y = e.clientY - box.top;
      if (x < 0 || y < 0 || x > box.width || y > box.height) { pointer = null; return; }
      fit();
      pointer = { x, y };
      wake();
    });
    sticky.addEventListener('pointerleave', () => { pointer = null; });
  }

  const setTv = (k) => {
    if (Math.abs(k - lastTv) < 0.004) return;
    lastTv = k;
    tv.style.opacity = k.toFixed(3);
    if (!tvVideo) return;
    if (k < 0.02) {
      tvVideo.style.filter = '';
      tvVideo.style.transform = '';
      return;
    }
    if (splitR) {
      splitR.setAttribute('dx', (2.6 * k).toFixed(2));
      splitB.setAttribute('dx', (-2.6 * k).toFixed(2));
    }
    tvVideo.style.filter = `${splitR ? 'url(#heroTv) ' : ''}blur(${(1.1 * k).toFixed(2)}px) contrast(${(1 + 0.15 * k).toFixed(3)}) saturate(${(1 + 0.25 * k).toFixed(3)}) brightness(${(1 - 0.05 * k).toFixed(3)})`;
    tvVideo.style.transform = `scale(${(1 + 0.1 * k).toFixed(4)})`;
  };
  const copy = heroStage.querySelector('.hero__about');
  const copyText = heroStage.querySelector('.hero__about-text');
  const anchor = document.getElementById('about');

  // scroll distance of each beat, as a share of the viewport height
  const GROW_H = 0.9;
  const GROW_W = 0.9;
  const MID_WIDTH = 1 / 3;        // beat 1 ends 640 wide in the 1920 frame
  const INTRO_DRIFT = 183 / 977;  // how far the block has risen by the end of beat 1, per px of height
  const VEIL = 0.35;
  const VEIL_OPACITY = 0.55;
  const COPY_END = 0.55;     // the copy stops once its last line sits this far down
  const REVEAL_AT = 0.85;    // a word starts sharpening as it rises past this line…
  const REVEAL_BAND = 0.25;  // …and is fully lit this much higher
  const MAX_BLUR = 4;
  const MIN_OPACITY = 0.35;  // unread words sit grey, as in the storyboard

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // split the copy into words so each can be lit on its own
  Array.from(copyText.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (part.trim() === '') {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'sr-word';
        span.textContent = part;
        frag.appendChild(span);
      }
    });
    node.replaceWith(frag);
  });
  const words = Array.from(copyText.querySelectorAll('.sr-word'));

  let vw = 0;
  let vh = 0;
  let start = { w: 0, h: 0, top: 0, r: 0 };
  let growH = 0;
  let growW = 0;
  let veil = 0;
  let travel = 0;
  let drift = 0;
  let introExit = 0;

  const measure = () => {
    vw = sticky.clientWidth;
    vh = sticky.clientHeight;

    // measure the block where it rests, not wherever the scroll has moved it
    intro.style.setProperty('--intro-y', '0px');
    const box = sticky.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    // the slot carries the resting corner radius, so the image starts out as it
    start = { w: s.width, h: s.height, top: s.top - box.top, r: parseFloat(getComputedStyle(slot).borderTopLeftRadius) || 0 };
    drift = INTRO_DRIFT * vh;
    // far enough that the lowest of the block's pieces (the buttons or the media
    // links) has cleared the top edge by the end of beat 2
    const lowest = Math.max(...Array.from(intro.children, (el) => el.getBoundingClientRect().bottom));
    introExit = lowest - box.top + 40;

    growH = GROW_H * vh;
    growW = GROW_W * vh;
    veil = VEIL * vh;
    // from just below the screen until the last line sits at COPY_END
    travel = vh * (1 - COPY_END) + copy.offsetHeight;

    heroStage.style.height = `${vh + growH + growW + veil + travel}px`;
    if (anchor) anchor.style.top = `${growH + growW}px`;

    // where each word sits inside the copy; a little of its x is folded in so
    // a line lights left → right instead of all at once
    const lineW = copyText.offsetWidth || 1;
    words.forEach((w) => {
      w.__at = w.offsetTop + w.offsetHeight / 2 + (w.offsetLeft / lineW) * w.offsetHeight;
      w.__k = -1;
    });
  };

  const update = () => {
    const y = -heroStage.getBoundingClientRect().top;

    const aRaw = clamp01(y / growH);
    const bRaw = clamp01((y - growH) / growW);
    const a = ease(aRaw);
    const b = ease(bRaw);

    // the block drifts up at a steady pace through beat 1, then picks up speed
    // (without a jolt — the pace carries over) until it has scrolled out
    const lift = bRaw === 0
      ? drift * aRaw
      : drift + drift * bRaw + Math.max(0, introExit - 2 * drift) * bRaw * bRaw;
    intro.style.setProperty('--intro-y', `${-lift}px`);

    const midW = Math.max(start.w, vw * MID_WIDTH);
    const w = b > 0 ? lerp(midW, vw, b) : lerp(start.w, midW, a);
    const h = lerp(start.h, vh, a);
    // the image leaves the slot as it rose with the block, then meets the top edge
    const top = lerp(start.top - drift * aRaw, 0, a);
    const r0 = start.r;
    const r1 = 0;   // square-cornered throughout
    heroMedia.style.width = `${w}px`;
    heroMedia.style.height = `${h}px`;
    heroMedia.style.transform = `translate3d(${(vw - w) / 2}px,${top}px,0)`;
    const radius = b > 0 ? lerp(r1, 0, b) : lerp(r0, r1, a);
    heroMedia.style.borderRadius = `${radius}px`;

    // the bow: a clip with the top and bottom edges curving in (each a
    // quadratic whose middle sits `sag` in), its corners rounded to the radius
    const f = clamp01(aRaw / FLAT_AT);
    const sag = BOW * h * (1 - f * f * (3 - 2 * f));
    if (sag > 0.5) {
      const r = Math.min(radius, w / 2, h / 2);
      heroMedia.style.clipPath = `path('M0,${r} Q0,0 ${r},0 Q${w / 2},${2 * sag} ${w - r},0 Q${w},0 ${w},${r} L${w},${h - r} Q${w},${h} ${w - r},${h} Q${w / 2},${h - 2 * sag} ${r},${h} Q0,${h} 0,${h - r} Z')`;
    } else {
      heroMedia.style.clipPath = '';
    }
    bow.style.opacity = (sag / (BOW * h || 1)).toFixed(3);
    setTv(1 - f * f * (3 - 2 * f));

    shade.style.opacity = VEIL_OPACITY * clamp01((y - growH - growW) / veil);

    const copyTop = vh - Math.min(travel, Math.max(0, y - growH - growW - veil));
    copy.style.transform = `translate3d(0,${copyTop}px,0)`;

    words.forEach((word) => {
      const t = clamp01((REVEAL_AT * vh - (copyTop + word.__at)) / (REVEAL_BAND * vh));
      const k = Math.round(t * 50) / 50;
      if (k === word.__k) return;
      word.__k = k;
      word.style.opacity = MIN_OPACITY + (1 - MIN_OPACITY) * k;
      word.style.filter = k === 1 ? 'none' : `blur(${(1 - k) * MAX_BLUR}px)`;
    });
  };

  const refresh = () => { measure(); update(); };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('load', refresh);
  if (document.fonts) document.fonts.ready.then(refresh);
  refresh();

  // no point decoding the clip once the stage has scrolled away
  const video = heroMedia.querySelector('.hero__video');
  if (video && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }).observe(heroStage);
  }
}

// ---------- Word field: NINEFIVE SEVEN typing in and wiping out (hero, Works) ----------
// A dense grid of faint mono "NINEFIVE SEVEN" under the whole stage. Each cell
// runs its own loop: it waits, types the phrase in letter by letter (the newest
// letter fainter), holds it, then wipes it out from the left (the letter about
// to go fainter), and waits again — every cell on its own clock, so the field
// is never still and never all there. Under the cursor the words light up
// white and fade back once it moves on; an empty cell types itself in when
// hovered. Drawn on a canvas; it only runs while the stage is on screen.
// One canvas per stage — under the home hero, and under the home Works
// section, where it rides along at screen height as the section scrolls by.
const wordField = (field, stage) => {
  if (!field || !field.getContext) return;
  const ctx = field.getContext('2d');
  const PHRASE = 'NINEFIVE SEVEN';
  const FONT_PX = 13;
  const ROW = 24;            // line pitch
  const COL_CHARS = PHRASE.length + 3;
  const BASE = 0.1;          // resting ink
  const FAINT = 0.045;       // the letter being typed or wiped
  const LIT = 0.95;          // a word right under the cursor
  const REACH = 110;         // px around the cursor that still catches some light
  const STEP = [18, 32];     // ms per letter, typing and wiping
  const WAIT = [200, 2600];  // empty between runs
  const HOLD = [900, 3200];  // phrase fully shown
  const GLOW_IN = 0.35;      // how fast a word catches the light, per frame
  const GLOW_OUT = 0.06;     // …and lets it go

  const rand = (a, b) => a + Math.random() * (b - a);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cells = [];
  let charW = 8;
  let cellW = 0;
  let dirty = true;
  let pointer = null;        // {x, y} in canvas px while over the stage

  const build = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = field.clientWidth;
    const h = field.clientHeight;
    field.width = Math.round(w * dpr);
    field.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `400 ${FONT_PX}px "Geist Mono", "Roboto Mono", monospace`;
    ctx.textBaseline = 'top';
    charW = ctx.measureText('M').width;
    cellW = charW * PHRASE.length;

    // enough columns and rows to run off every edge, centred so the cut is
    // even on both sides and no strip of the frame is left bare
    const colW = charW * COL_CHARS;
    const cols = Math.ceil(w / colW) + 1;
    const rows = Math.ceil(h / ROW) + 1;
    const left = (w - (cols * colW - charW * 3)) / 2;
    const top = (h - rows * ROW) / 2 + (ROW - FONT_PX) / 2;
    const now = performance.now();
    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = { x: left + c * colW, y: top + r * ROW, k: 0, state: 'wait', next: 0, step: rand(...STEP), glow: 0 };
        // start mid-loop, so the first frame already reads as a field in motion
        if (still || Math.random() < 0.5) {
          cell.state = 'hold';
          cell.k = PHRASE.length;
          cell.next = now + rand(0, HOLD[1]);
        } else {
          cell.next = now + rand(0, WAIT[1]);
        }
        cells.push(cell);
      }
    }
    dirty = true;
  };

  const advance = (cell, now) => {
    const len = PHRASE.length;
    switch (cell.state) {
      case 'wait':
        cell.state = 'type';
        cell.k = 1;
        cell.step = rand(...STEP);
        cell.next = now + cell.step;
        break;
      case 'type':
        if (cell.k < len) { cell.k++; cell.next = now + cell.step; }
        else { cell.state = 'hold'; cell.next = now + rand(...HOLD); }
        break;
      case 'hold':
        cell.state = 'wipe';
        cell.k = 1;               // letters wiped from the left
        cell.next = now + cell.step;
        break;
      case 'wipe':
        if (cell.k < len) { cell.k++; cell.next = now + cell.step; }
        else { cell.state = 'wait'; cell.k = 0; cell.next = now + rand(...WAIT); }
        break;
    }
  };

  // 1 on the word the cursor is over, falling off to 0 at REACH beyond its box
  const lightAt = (cell) => {
    if (!pointer) return 0;
    const dx = Math.max(cell.x - pointer.x, 0, pointer.x - (cell.x + cellW));
    const dy = Math.max(cell.y - pointer.y, 0, pointer.y - (cell.y + FONT_PX));
    const d = Math.hypot(dx, dy);
    return d === 0 ? 1 : Math.max(0, 1 - d / REACH) * 0.6;
  };

  const ink = (a) => `rgba(255,255,255,${a})`;

  const draw = () => {
    ctx.clearRect(0, 0, field.width, field.height);
    cells.forEach((cell) => {
      const { k, x, y, state, glow } = cell;
      if (state === 'wait') return;
      const solid = ink(BASE + (LIT - BASE) * glow);
      const faint = ink(FAINT + (LIT * 0.5 - FAINT) * glow);
      if (state === 'type') {
        // typed so far, the newest letter still faint
        if (k > 1) { ctx.fillStyle = solid; ctx.fillText(PHRASE.slice(0, k - 1), x, y); }
        ctx.fillStyle = faint; ctx.fillText(PHRASE[k - 1], x + (k - 1) * charW, y);
      } else if (state === 'hold') {
        ctx.fillStyle = solid; ctx.fillText(PHRASE, x, y);
      } else {
        // the first k letters are gone; the next to go is already faint
        if (k >= PHRASE.length) return;
        ctx.fillStyle = faint; ctx.fillText(PHRASE[k], x + k * charW, y);
        if (k + 1 < PHRASE.length) { ctx.fillStyle = solid; ctx.fillText(PHRASE.slice(k + 1), x + (k + 1) * charW, y); }
      }
    });
    dirty = false;
  };

  let raf = 0;
  let onScreen = true;
  const tick = (now) => {
    raf = 0;
    cells.forEach((cell) => {
      // a hovered empty cell doesn't wait its turn
      const target = lightAt(cell);
      if (target === 1 && cell.state === 'wait') cell.next = now;
      if (!still && now >= cell.next) { advance(cell, now); dirty = true; }
      if (cell.glow !== target) {
        const rate = target > cell.glow ? GLOW_IN : GLOW_OUT;
        cell.glow += (target - cell.glow) * rate;
        if (Math.abs(target - cell.glow) < 0.01) cell.glow = target;
        dirty = true;
      }
    });
    if (dirty) draw();
    run();
  };
  // keeps going while anything still moves: the loops, or a glow fading out
  const run = () => {
    if (raf || !onScreen || document.hidden) return;
    if (still && !dirty && !pointer && !cells.some((c) => c.glow > 0)) return;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const restart = () => { build(); stop(); run(); };

  // the canvas sits under the rest of the stage, so the stage hears the cursor
  if (stage && matchMedia('(hover: hover)').matches) {
    stage.addEventListener('pointermove', (e) => {
      const box = field.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
      run();
    });
    stage.addEventListener('pointerleave', () => { pointer = null; run(); });
  }

  build();
  run();
  if (document.fonts) document.fonts.ready.then(restart);
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(restart, 120);
  });
  document.addEventListener('visibilitychange', () => { stop(); run(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      stop();
      run();
    }).observe(field);
  }
};
wordField(document.getElementById('heroField'), document.getElementById('heroField')?.parentElement);
wordField(document.getElementById('worksField'), document.getElementById('works'));

// ---------- Core keyword field: nudot-style dual wave (scroll-driven) ----------
// Faithful port of nudot.com.tw's _ipWave:
//   x        = ((sin(WAVE_NUM·i + WAVE_SPD·p·2π − π/2) + 1) / 2) · (colW − maxTextW)
//   field y  = fieldH · (0.5 − p)          (whole field slides up through the pin)
//   focused  = round(p · (n − 1))          (walks the rows top → bottom)
// The focused row turns white, flips EN → VN, and drives the centre image.
const cfField = document.getElementById('cfField');

if (cfField) {
  const TAU = Math.PI * 2;
  const WAVE_NUM = 12;   // nudot: WAVE_NUM = 12 → organic scatter per row
  const WAVE_SPD = 1;    // nudot: WAVE_SPD = 1 → one wave cycle per pinned pass
  const SMOOTH = 0.1;    // nudot lerps scroll progress by 0.1 per frame
  const EASE = 0.12;     // per-word settle (their gsap quickTo 0.6s power4.out)
  const CENTER_BASE = 56;    // px the centre image sits below the centreline
  const CENTER_DRIFT = 0.32; // share of the field's travel it keeps, so it moves

  const corefieldEl = cfField.closest('.corefield');
  // nudot keeps the centre media fixed at viewport centre while only the word
  // columns slide; our centre lives inside the sliding field, so we counter it.
  const cfCenter = cfField.querySelector('.cf__center');

  const getCol = (side) => {
    const col = cfField.querySelector(`.cf__col--${side}`);
    const words = Array.from(col.querySelectorAll('.cf__word'));
    return { col, words, cur: words.map(() => 0) };
  };
  const L = getCol('left');
  const R = getCol('right');
  const nRows = Math.max(L.words.length, R.words.length);

  const waveX = (i, p, range) =>
    ((Math.sin(WAVE_NUM * i + WAVE_SPD * p * TAU - Math.PI / 2) + 1) / 2) * range;

  let ranges = { l: 0, r: 0 };
  let fieldH = 0;
  // where the centre slot sits inside the section, before any transform, so the
  // slot can re-project the section's vignette onto itself each frame without
  // reading a rect back (see .cf__panel in the stylesheet)
  const panelEl = cfField.querySelector('.cf__panel');
  let panelBase = { x: 0, y: 0 };
  // slide the slot's copy of the vignette to wherever the slot has drifted to,
  // so the ground the clip screens against stays the section's own
  let lastVy = null;
  const setVignette = (y) => {
    if (!panelEl) return;
    const vy = y.toFixed(1);
    if (vy === lastVy) return;
    panelEl.style.setProperty('--cf-vy', `${-vy}px`);
    lastVy = vy;
  };
  const measure = () => {
    const maxW = (c) => Math.max(...c.words.map((w) => w.offsetWidth));
    ranges = {
      l: Math.max(0, L.col.offsetWidth - maxW(L)),
      r: Math.max(0, R.col.offsetWidth - maxW(R)),
    };
    const ul = L.col.querySelector('ul');
    fieldH = ul ? ul.offsetHeight : 0;
    if (panelEl) {
      // read the slot's seat with the per-frame translates lifted off, so the
      // number is pure layout (offsetTop lies here: the centre is its own
      // offset parent once it carries a transform)
      const held = { field: cfField.style.transform, center: cfCenter ? cfCenter.style.transform : '' };
      cfField.style.transform = 'none';
      if (cfCenter) cfCenter.style.transform = 'none';
      const pr = panelEl.getBoundingClientRect();
      const cr = corefieldEl.getBoundingClientRect();
      panelBase = { x: pr.left - cr.left, y: pr.top - cr.top };
      cfField.style.transform = held.field;
      if (cfCenter) cfCenter.style.transform = held.center;
      panelEl.style.setProperty('--cf-vw', `${corefieldEl.offsetWidth}px`);
      panelEl.style.setProperty('--cf-vh', `${corefieldEl.offsetHeight}px`);
      panelEl.style.setProperty('--cf-vx', `${(-panelBase.x).toFixed(1)}px`);
      lastVy = null;
      setVignette(panelBase.y);
    }
  };
  measure();
  window.addEventListener('resize', measure);

  // place every word on the wave immediately (nudot's ensureInit)
  L.words.forEach((w, i) => { L.cur[i] = waveX(i, 0, ranges.l); w.style.transform = `translateX(${L.cur[i]}px)`; });
  R.words.forEach((w, i) => { R.cur[i] = -waveX(i, 0, ranges.r); w.style.transform = `translateX(${R.cur[i]}px)`; });

  // ---- centre panel: the ASCII butterfly ------------------------------
  // The stills that used to swap per focused row are gone; the slot now holds
  // one looping clip. The wings only beat while the page is moving — harder the
  // faster it goes — and hold still the moment it stops. The butterfly starts
  // low in its (tall, invisible) slot and flies up through it as the section is
  // scrolled, on top of the slot's own drift.
  const panelVideo = document.getElementById('cfPanelVideo');
  const FLAP_MIN = 0.6;    // playback rate at the slowest scroll that still counts
  const FLAP_MAX = 4;      // playback rate at full scroll speed
  const STILL_BELOW = 0.02; // scroll speed (0–1) under which the wings stop
  const FULL_SPEED = 45;   // px of scroll per frame that counts as flat out
  const LAG_MAX = 45;      // px the scroll speed can throw it up or down the frame
  const TILT_MAX = 10;     // degrees it banks into the direction of travel
  let flapRate = 0;
  let lastScrollY = window.scrollY;
  let velocity = 0;        // smoothed px per frame, signed (down is positive)

  // How far it can climb each way without a wingtip leaving the slot: half the
  // slot, less half the butterfly (0.26 of the clip's square at its 1.9×
  // scale), less the speed kick, less what a full bank swings a corner out by.
  let riseRoom = 0;
  const measureRise = () => {
    if (!panelEl || !panelVideo) return;
    const clip = panelVideo.offsetHeight;
    riseRoom = Math.max(0, panelEl.offsetHeight / 2 - clip * 0.26 - LAG_MAX - clip * 0.06 - 12);
  };
  measureRise();
  window.addEventListener('resize', measureRise);

  // The wings are held by dropping the rate to zero rather than pausing: a
  // paused <video> is an unreliable thing to blend (see the reduced-motion
  // branch below), a frozen playing one is not.
  const setFlap = (rate) => {
    try {
      panelVideo.playbackRate = rate;
    } catch (e) {
      // an engine that refuses a zero rate gets a real pause instead
      if (rate === 0) panelVideo.pause();
    }
    if (rate > 0 && panelVideo.paused && clipStarted) startClip();
  };
  let clipStarted = false;
  const startClip = () => {
    clipStarted = true;
    const play = panelVideo.play();
    if (play && play.catch) play.catch(() => {});
  };

  const stillWanted = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (panelVideo && stillWanted) {
    // reduced motion: keep the butterfly, drop the flight. A paused <video> is
    // an unreliable thing to blend, so the first frame is copied onto a canvas
    // and the clip itself is thrown away.
    panelVideo.addEventListener('loadeddata', () => {
      const frame = document.createElement('canvas');
      frame.width = panelVideo.videoWidth;
      frame.height = panelVideo.videoHeight;
      frame.getContext('2d').drawImage(panelVideo, 0, 0);
      frame.className = panelVideo.className;
      frame.setAttribute('aria-hidden', 'true');
      panelVideo.replaceWith(frame);
    }, { once: true });
    panelVideo.load();
  }

  if (panelVideo && !stillWanted) {
    // start it frozen: the first scroll is what sets the wings going
    setFlap(0);
    // hold the 4MB download until the section is within a screen or two
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { startClip(); io.disconnect(); }
      });
    }, { rootMargin: '150% 0px' });
    io.observe(panelVideo);
    // a backgrounded tab suspends the element; pick it back up on return
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && panelVideo.paused) startClip();
    });
  }

  // ---- nudot-style pinned entrance -------------------------------------
  // The section is sticky inside a tall .cf-stage. The first stretch of the
  // pinned scroll drives a bottom-up clip-path curtain (nudot's
  // setDarkWrapperReveal: inset(H% 0 0 0) -> inset(0)), the next drives the
  // wave, and the last screen is Our Service sliding up over it, the field
  // darkening underneath. The stretches are in vh; the CSS height adds them up.
  const stage = document.getElementById('cfStage');
  const WIPE_VH = 33, WAVE_VH = 44, COVER_VH = 100;
  const PIN_VH = WIPE_VH + WAVE_VH + COVER_VH;
  const P_WIPE = WIPE_VH / PIN_VH;               // entrance curtain finishes here
  const P_EXIT = (WIPE_VH + WAVE_VH) / PIN_VH;   // wave finishes here; Our Service slides over the rest
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const stageActive = () => stage && window.innerWidth >= 720;

  let scrollProgress = 0;
  // the butterfly's climb spans the curtain, the wave and the first half of
  // Our Service sliding over — the part of the field still in view — not
  // just the wave
  const FLIGHT_END = (WIPE_VH + WAVE_VH + COVER_VH / 2) / PIN_VH;
  let flightProgress = 0;
  const updateProgress = () => {
    if (stageActive()) {
      const r = stage.getBoundingClientRect();
      const total = Math.max(1, r.height - window.innerHeight);
      const p = clamp01(-r.top / total);
      flightProgress = clamp01(p / FLIGHT_END);
      const wipe = easeInOutCubic(clamp01(p / P_WIPE));
      corefieldEl.style.clipPath = `inset(${((1 - wipe) * 100).toFixed(2)}% 0 0 0)`;
      corefieldEl.classList.toggle('is-revealed', wipe > 0.45);
      // wave runs between the curtain and the exit
      scrollProgress = clamp01((p - P_WIPE) / (P_EXIT - P_WIPE));
      // exit: the field darkens under Our Service as it slides over, the
      // way Our Service does under Process
      const exit = easeInOutCubic(clamp01((p - P_EXIT) / (1 - P_EXIT)));
      corefieldEl.style.opacity = (1 - exit * 0.6).toFixed(3);
    } else {
      corefieldEl.style.clipPath = 'none';
      corefieldEl.style.opacity = '1';
      const rect = corefieldEl.getBoundingClientRect();
      const vh = window.innerHeight;
      scrollProgress = clamp01((vh - rect.top) / (vh + rect.height));
      flightProgress = scrollProgress;
      const inView = rect.top < vh * 0.65 && rect.bottom > vh * 0.35;
      corefieldEl.classList.toggle('is-revealed', inView);
    }
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // ---- per-frame update (nudot's _ipWave.update) ------------------------
  let smoothP = 0;
  let smoothFlight = 0;
  let lastFocused = -1;
  let lastRise = null;
  const tick = () => {
    smoothP += (scrollProgress - smoothP) * SMOOTH;
    const p = smoothP;

    // The butterfly answers the scroll speed itself, read straight off the
    // window each frame (Lenis glides scrollY, so the reading is already
    // smooth). While the page moves the wings beat — harder the faster the
    // wheel — it is flung up the frame (down when scrolling back) and banks;
    // when the page stops the wings freeze and it settles back to its line.
    // That line runs from low in the slot up to high as the section is passed,
    // so scrolling on reads as the butterfly flapping its way up.
    if (panelVideo && !stillWanted) {
      const y = window.scrollY;
      const raw = y - lastScrollY;
      lastScrollY = y;
      // quick to pick up a flick or a change of direction, slower to let go
      const picking = Math.abs(raw) > Math.abs(velocity) || Math.sign(raw) === -Math.sign(velocity);
      velocity += (raw - velocity) * (picking ? 0.35 : 0.08);
      const speed = Math.min(1, Math.abs(velocity) / FULL_SPEED);
      const dir = Math.sign(velocity);
      const eased = 1 - (1 - speed) * (1 - speed);

      const target = speed < STILL_BELOW ? 0 : FLAP_MIN + (FLAP_MAX - FLAP_MIN) * eased;
      flapRate += (target - flapRate) * 0.15;
      // snap the last of the ease-out to a dead stop rather than crawl
      const rate = flapRate < FLAP_MIN * 0.5 && target === 0 ? 0 : Math.max(flapRate, FLAP_MIN * 0.5);
      if (rate === 0 ? panelVideo.playbackRate !== 0 : Math.abs(panelVideo.playbackRate - rate) > 0.02) setFlap(rate);

      smoothFlight += (flightProgress - smoothFlight) * SMOOTH;
      const rise = (riseRoom * (1 - 2 * smoothFlight)).toFixed(1);
      if (rise !== lastRise) { panelVideo.style.setProperty('--cf-rise', `${rise}px`); lastRise = rise; }
      panelVideo.style.setProperty('--cf-lag', `${(-dir * eased * LAG_MAX).toFixed(1)}px`);
      panelVideo.style.setProperty('--cf-tilt', `${(dir * eased * TILT_MAX).toFixed(2)}deg`);
    }

    // whole field slides up through the section (nudot: y = H · (0.5 − p))
    if (stageActive()) {
      const fy = fieldH * (0.5 - p);
      cfField.style.transform = `translateY(${fy.toFixed(2)}px)`;
      // The centre used to be countered exactly, which pinned it dead still —
      // nothing to watch while the words streamed past. Keeping a share of the
      // field's travel lets it enter low and drift up through the section, and
      // the base offset holds it below the centreline for most of the pass.
      const drift = CENTER_BASE + fy * CENTER_DRIFT;
      if (cfCenter) cfCenter.style.transform = `translateY(${(drift - fy).toFixed(2)}px)`;
      // the field translates by fy and the centre by (drift - fy), so the slot
      // ends up `drift` below its layout seat: slide its vignette copy to match
      setVignette(panelBase.y + drift);
    } else {
      cfField.style.transform = 'none';
      if (cfCenter) cfCenter.style.transform = 'none';
      setVignette(panelBase.y);
    }

    L.words.forEach((w, i) => {
      const t = waveX(i, p, ranges.l);
      L.cur[i] += (t - L.cur[i]) * EASE;
      w.style.transform = `translateX(${L.cur[i].toFixed(2)}px)`;
    });
    R.words.forEach((w, i) => {
      const t = -waveX(i, p, ranges.r);
      R.cur[i] += (t - R.cur[i]) * EASE;
      w.style.transform = `translateX(${R.cur[i].toFixed(2)}px)`;
    });

    const focused = Math.max(0, Math.min(nRows - 1, Math.round(p * (nRows - 1))));
    if (focused !== lastFocused) {
      L.words.forEach((w, i) => w.classList.toggle('focused', i === focused));
      R.words.forEach((w, i) => w.classList.toggle('focused', i === focused));
      lastFocused = focused;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Works: category filter ----------
const categoryFilter = document.getElementById('categoryFilter');
const yearFilter = document.getElementById('yearFilter');
const worksGrid = document.getElementById('worksGrid');

if (categoryFilter && yearFilter && worksGrid) {
  // Render cards from the shared PROJECTS array (projects.js) if not server-rendered.
  if (typeof PROJECTS !== 'undefined' && !worksGrid.children.length) {
    worksGrid.innerHTML = PROJECTS.map((p) => {
      // tags render as colour-cycled chips over the still, matching the markup
      const chips = p.tags
        .map((t, i) => `<span class="project__tag project__tag--${['a', 'b', 'c'][i % 3]}">${t}</span>`)
        .join('');
      const head = `<header class="project__head"><span>${p.code}</span></header>` +
        `<div class="project__img"><img src="${p.image}" alt="${p.code} project">` +
        `<div class="project__tags">${chips}</div></div>`;
      const inner = p.href ? `<a href="${p.href}" class="project__link">${head}</a>` : head;
      // data-code keys the per-project accent colour in the stylesheet
      return `<article class="project" data-code="${p.code}" data-category="${p.category}" data-year="${p.year}">${inner}</article>`;
    }).join('');
  }

  const projects = worksGrid.querySelectorAll('.project');
  let activeCategory = 'all';

  // each card owns a fixed pos-N slot (set in the HTML) so filtering keeps
  // every project's own position; only the first visible card drops its
  // top margin so the remaining cards move up into the freed space
  const layoutCards = () => {
    let first = true;
    projects.forEach((project) => {
      project.classList.remove('is-first');
      if (project.classList.contains('is-hidden')) return;
      if (first) {
        project.classList.add('is-first');
        first = false;
      }
    });
  };

  const applyFilters = () => {
    projects.forEach((project) => {
      const categories = project.dataset.category.split(' ');
      const matchesCategory = activeCategory === 'all' || categories.includes(activeCategory);
      project.classList.toggle('is-hidden', !matchesCategory);
    });
    layoutCards();
    revealDriver(); // card offsets shift when the set of visible cards changes
    updateWeb();
  };
  layoutCards();

  categoryFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    categoryFilter.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeCategory = btn.dataset.filter;
    applyFilters();
  });

  // ---------- Works: year rail as a scroll-spy (like a timeline indicator) ----------
  const yearButtons = yearFilter.querySelectorAll('button');

  const updateYearSpy = () => {
    // the active year is the year of the last visible project whose top has
    // passed the middle of the viewport (i.e. the one being looked at)
    const line = window.innerHeight * 0.55;
    let currentYear = null;
    projects.forEach((project) => {
      if (project.classList.contains('is-hidden')) return;
      if (currentYear === null) currentYear = project.dataset.year; // default: first project's year
      if (project.getBoundingClientRect().top < line) currentYear = project.dataset.year;
    });
    yearButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.year === currentYear));
  };

  // poll scrollY via rAF instead of the scroll event so the spy also tracks
  // programmatic scrolling (our lerp smooth-scroll updates scrollTop directly)
  let spyLastY = -1;
  const spyLoop = () => {
    if (window.scrollY !== spyLastY) {
      spyLastY = window.scrollY;
      updateYearSpy();
    }
    requestAnimationFrame(spyLoop);
  };
  requestAnimationFrame(spyLoop);
  window.addEventListener('scroll', updateYearSpy, { passive: true });
  window.addEventListener('resize', updateYearSpy);
  updateYearSpy();

  // clicking a year scrolls to the first visible project of that year
  yearFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const target = [...projects].find(
      (p) => !p.classList.contains('is-hidden') && p.dataset.year === btn.dataset.year
    );
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 160;
    window.scrollTo({ top, behavior: 'smooth' });
  });

  // ---------- Works: grid / list view toggle ----------
  const viewToggle = document.getElementById('viewToggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      viewToggle.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      worksGrid.classList.toggle('is-list', btn.dataset.view === 'list');
    });
  }

  // ---------- Works: reveal cards as they scroll into view ----------
  const revealProjects = () => {
    const vh = window.innerHeight;
    projects.forEach((project) => {
      if (project.classList.contains('is-revealed')) return;
      const rect = project.getBoundingClientRect();
      if (rect.top < vh * 0.92) {
        project.classList.add('is-revealed');
      }
    });
  };

  window.addEventListener('scroll', revealProjects, { passive: true });
  window.addEventListener('resize', revealProjects);
  revealProjects();

  // ---------- Works: scramble the card title on hover ----------
  projects.forEach((project) => {
    const scramblers = Array.from(
      project.querySelectorAll('.project__head span')
    ).map((span) => new ScrambleText(span));
    project.addEventListener('mouseenter', () => {
      // a LIST row's name sits in a chip that simply opens — no letter jitter
      if (worksGrid.classList.contains('is-list')) return;
      scramblers.forEach((sc) => sc.run());
    });
  });

  // ---------- Works: LIST view row ----------
  // The card markup only carries [ name | tag chips ]; the LIST row's own
  // columns — status dot, year, type, tag string — plus the "view project"
  // badge are built here from PROJECTS, so the row stays in step with the data
  // both pages already render from. They live inside .project__link when the
  // project has a detail page, which makes the whole row one click target.
  const byCode = new Map(
    typeof PROJECTS !== 'undefined' ? PROJECTS.map((p) => [p.code, p]) : []
  );
  const cell = (mod, text) => {
    const el = document.createElement('span');
    el.className = `project__cell project__cell--${mod}`;
    el.textContent = text;
    return el;
  };
  projects.forEach((project) => {
    const p = byCode.get(project.dataset.code);
    if (!p) return;
    const host = project.querySelector('.project__link') || project;

    // the dot leads the name, so it belongs inside the name cell
    const head = project.querySelector('.project__head');
    if (head) {
      const dot = document.createElement('i');
      dot.className = 'project__dot';
      dot.style.setProperty('--dot', p.dot || 'var(--accent)');
      head.prepend(dot);
    }

    host.append(
      cell('year', p.year),
      cell('type', p.listType || ''),
      cell('tags', (p.listTags || p.tags || []).join('・'))
    );

    // the badge floats above the row's right edge on an elbow leader, drawn
    // from the row's top edge — decorative, the row itself is the link
    const cta = document.createElement('span');
    cta.className = 'project__cta';
    cta.setAttribute('aria-hidden', 'true');
    cta.innerHTML =
      '<svg class="project__cta-line" viewBox="0 0 54 56" preserveAspectRatio="none" fill="none">' +
        '<path d="M1 56V1H54" stroke="currentColor" stroke-width="2"/>' +
      '</svg>' +
      `<span class="project__cta-label">${p.href ? 'View project' : 'Coming soon'}</span>`;
    host.append(cta);
  });

  // ---------- Works: "VIEW" label that follows the cursor (GRID view) ----------
  const cursorView = document.createElement('div');
  cursorView.className = 'cursor-view';
  cursorView.textContent = 'VIEW';
  document.body.appendChild(cursorView);

  // document-space layout position: transform-free like offsetTop, but summed
  // through the offsetParent chain so positioned ancestors (.works is
  // position:relative) don't skew the numbers
  const layoutTop = (el) => {
    let t = 0;
    for (let n = el; n; n = n.offsetParent) t += n.offsetTop;
    return t;
  };

  let cvX = 0, cvY = 0, cvTargetX = 0, cvTargetY = 0, cvRaf = null, cvActive = false;
  let hoveredProject = null; // read by updateWeb: dims the other cards' threads

  const cvLoop = () => {
    cvX += (cvTargetX - cvX) * 0.2;
    cvY += (cvTargetY - cvY) * 0.2;
    cursorView.style.left = `${cvX}px`;
    cursorView.style.top = `${cvY}px`;
    if (cvActive || Math.abs(cvTargetX - cvX) > 0.5 || Math.abs(cvTargetY - cvY) > 0.5) {
      cvRaf = requestAnimationFrame(cvLoop);
    } else {
      cvRaf = null;
    }
  };

  projects.forEach((project) => {
    project.addEventListener('mouseenter', (e) => {
      cvActive = true;
      hoveredProject = project;
      updateWeb();
      // snap to the cursor on entry so it doesn't fly in from the corner
      cvX = cvTargetX = e.clientX;
      cvY = cvTargetY = e.clientY;
      // a list row opens its own panel on hover, so the pill stays in GRID view
      if (!worksGrid.classList.contains('is-list')) cursorView.classList.add('is-visible');
      if (!cvRaf) cvRaf = requestAnimationFrame(cvLoop);
    });
    project.addEventListener('mousemove', (e) => {
      cvTargetX = e.clientX;
      cvTargetY = e.clientY;
      if (!cvRaf) cvRaf = requestAnimationFrame(cvLoop);
    });
    project.addEventListener('mouseleave', () => {
      cvActive = false;
      hoveredProject = null;
      updateWeb();
      cursorView.classList.remove('is-visible');
    });
  });

  // ---------- Works: gentle per-card parallax while scrolling (desktop) ----------
  // same-sign speeds: cards drift together at different rates, so with the
  // tighter vertical spacing neighbouring cards can never converge and touch
  const PAR_SPEED = [0.055, 0.02, 0.065, 0.03];
  const PAR_MAX = 60;
  const parDesktop = window.matchMedia('(min-width:800px)');
  const parReduced = window.matchMedia('(prefers-reduced-motion:reduce)');
  let parRaf = null;

  const updateParallax = () => {
    parRaf = null;
    const viewCenter = window.innerHeight / 2;
    const enabled = parDesktop.matches && !parReduced.matches && !worksGrid.classList.contains('is-list');
    let i = 0;
    projects.forEach((project) => {
      if (project.classList.contains('is-hidden')) return;
      if (!enabled) {
        project.style.setProperty('--par', '0px');
        i++;
        return;
      }
      // layout values (transforms excluded), so no feedback loop with the
      // offsets we apply
      const center = layoutTop(project) - window.scrollY + project.offsetHeight / 2;
      const raw = (viewCenter - center) * PAR_SPEED[i % 4];
      const off = Math.max(-PAR_MAX, Math.min(PAR_MAX, raw));
      project.style.setProperty('--par', `${off.toFixed(1)}px`);
      i++;
    });
  };
  const requestParallax = () => {
    if (!parRaf) parRaf = requestAnimationFrame(updateParallax);
  };

  // ---------- Works: scroll-linked slide-up reveal (grid view) ----------
  // card position follows the scroll progress directly: it slides up ~120px
  // while entering the viewport and slides back down when scrolling up,
  // so the effect replays naturally on every pass
  const REV_DISTANCE = 120;
  const revealDriver = () => {
    const vh = window.innerHeight;
    const isList = worksGrid.classList.contains('is-list');
    const start = vh * 0.98; // card top enters here -> progress 0
    const end = vh * 0.55;   // card top reaches here -> fully arrived
    projects.forEach((project) => {
      if (project.classList.contains('is-hidden')) return;
      if (isList) {
        // list view uses the transition-based reveal (is-revealed)
        project.style.removeProperty('--rev');
        project.style.removeProperty('--revo');
        return;
      }
      if (parReduced.matches) {
        project.style.setProperty('--rev', '0px');
        project.style.setProperty('--revo', '1');
        return;
      }
      const top = layoutTop(project) - window.scrollY;
      const p = Math.max(0, Math.min(1, (start - top) / (start - end)));
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic: fast entry, soft landing
      project.style.setProperty('--rev', `${((1 - eased) * REV_DISTANCE).toFixed(1)}px`);
      project.style.setProperty('--revo', eased.toFixed(3));
    });
  };

  // ---------- Works: red threads from the viewport centre to each card (grid) ----------
  // one <line> per project on a fixed SVG overlay behind the cards. One end
  // pins to the middle of the screen, the other tracks the card's centre;
  // each line fades in/out with its card's scroll-linked reveal progress
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const webSvg = document.createElementNS(SVG_NS, 'svg');
  webSvg.setAttribute('class', 'works-web');
  webSvg.setAttribute('aria-hidden', 'true');
  const webLines = new Map();
  projects.forEach((project) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('opacity', '0');
    webSvg.appendChild(line);
    webLines.set(project, line);
  });
  // inside .works for the same stacking-context reason as the hover line
  const worksSection = worksGrid.closest('.works');
  worksSection.appendChild(webSvg);

  const updateWeb = () => {
    const show = parDesktop.matches && !worksGrid.classList.contains('is-list');
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    // threads only live while the works section is around the viewport:
    // fade in once the section top reaches the middle of the screen (otherwise
    // an entering card would hang a stray line over the previous section),
    // fade out as the section bottom leaves past the top of the screen
    const sectionRect = worksSection.getBoundingClientRect();
    const vh = window.innerHeight;
    const fadeIn = Math.max(0, Math.min(1, (vh * 0.5 - sectionRect.top) / 200));
    // gently dissolve the threads as the footer scrolls in: start fading as the
    // works section's bottom rises past 85% of the viewport, gone by 55%
    const fadeOut = Math.max(0, Math.min(1, (sectionRect.bottom - vh * 0.55) / (vh * 0.3)));
    const sectionFade = fadeIn * fadeOut;
    projects.forEach((project) => {
      const line = webLines.get(project);
      if (!show || project.classList.contains('is-hidden')) {
        line.setAttribute('opacity', '0');
        return;
      }
      const rect = project.getBoundingClientRect(); // visual centre: follows parallax/reveal
      const revo = parseFloat(project.style.getPropertyValue('--revo'));
      const reveal = Number.isFinite(revo) ? revo : 1;
      // while any card is hovered, every thread dims — including the hovered
      // card's own, so the annotation overlay takes the spotlight
      const hoverFactor = hoveredProject ? 0.25 : 1;
      line.setAttribute('x1', cx.toFixed(1));
      line.setAttribute('y1', cy.toFixed(1));
      line.setAttribute('x2', (rect.left + rect.width / 2).toFixed(1));
      line.setAttribute('y2', (rect.top + rect.height / 2).toFixed(1));
      line.setAttribute('opacity', (reveal * sectionFade * hoverFactor).toFixed(3));
    });
  };

  // ---------- Works: cards take a knock when the cursor crosses their edge ----------
  // the pointer behaves like a physical object: crossing an edge shoves the card
  // along that edge's normal, then a spring drags it home with a couple of light
  // bounces. Off-centre hits also twist it slightly, like a real nudge would.
  const finePointer = window.matchMedia('(hover:hover) and (pointer:fine)');
  const SPRING = 0.14;    // stiffness — how hard the card is pulled back to rest
  const DAMPING = 0.8;    // velocity kept per frame; under 1 it overshoots, hence the bounce
  const REST = 0.02;      // px/deg under which the card is parked exactly at 0
  const HIT_MIN = 2.2;    // impulse from a slow crossing
  const HIT_MAX = 7;      // impulse from a fast one
  const SPEED_CAP = 45;   // px/frame of cursor travel that counts as "fast"
  const SPIN = 0.09;      // how much of an off-centre hit turns into rotation
  const SPIN_CAP = 0.3;   // deg/frame, so the twist stays a hint
  const EXIT_SCALE = 0.6; // leaving is a softer knock than arriving
  const COOLDOWN = 240;   // ms — a card that just took a hit ignores the next one, so a
                          // card sliding out from under the cursor can't retrigger itself

  const bodies = new Map();
  projects.forEach((project) => {
    bodies.set(project, { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, hit: 0 });
  });
  let physRaf = null;

  // last cursor sample, so a bump knows how fast the pointer was moving
  let pxLast = 0, pyLast = 0, pSpeed = 0, pTime = 0;
  document.addEventListener('mousemove', (e) => {
    const now = performance.now();
    const dt = now - pTime;
    if (pTime && dt > 0 && dt < 120) {
      // normalise to px per 16ms frame, then smooth so one jumpy sample can't spike it
      const step = Math.hypot(e.clientX - pxLast, e.clientY - pyLast) * (16 / dt);
      pSpeed += (step - pSpeed) * 0.5;
    }
    pxLast = e.clientX; pyLast = e.clientY; pTime = now;
  }, { passive: true });

  const settle = (v, x) => Math.abs(v) < REST && Math.abs(x) < REST;

  const physStep = () => {
    let awake = false;
    bodies.forEach((b, project) => {
      if (!b.vx && !b.vy && !b.vr && !b.x && !b.y && !b.r) return;
      b.vx = (b.vx - b.x * SPRING) * DAMPING;
      b.vy = (b.vy - b.y * SPRING) * DAMPING;
      b.vr = (b.vr - b.r * SPRING) * DAMPING;
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      if (settle(b.vx, b.x)) { b.x = 0; b.vx = 0; }
      if (settle(b.vy, b.y)) { b.y = 0; b.vy = 0; }
      if (settle(b.vr, b.r)) { b.r = 0; b.vr = 0; }
      project.style.setProperty('--fx', `${b.x.toFixed(2)}px`);
      project.style.setProperty('--fy', `${b.y.toFixed(2)}px`);
      project.style.setProperty('--fr', `${b.r.toFixed(3)}deg`);
      if (b.x || b.y || b.r || b.vx || b.vy || b.vr) awake = true;
    });
    physRaf = awake ? requestAnimationFrame(physStep) : null;
  };

  const bump = (project, e, outward) => {
    if (!finePointer.matches || parReduced.matches) return;
    // LIST rows answer a hover by opening, so they must not be knocked around
    if (worksGrid.classList.contains('is-list')) return;
    const b = bodies.get(project);
    const now = performance.now();
    if (!b || now - b.hit < COOLDOWN) return;
    b.hit = now;

    // whichever edge the cursor is closest to is the one it just came through
    const rect = project.getBoundingClientRect();
    const dl = e.clientX - rect.left, dr = rect.right - e.clientX;
    const dt = e.clientY - rect.top, db = rect.bottom - e.clientY;
    const near = Math.min(dl, dr, dt, db);
    let nx = 0, ny = 0;
    if (near === dl) nx = 1;
    else if (near === dr) nx = -1;
    else if (near === dt) ny = 1;
    else ny = -1;
    // leaving pushes the other way: the cursor is on its way back out
    if (outward) { nx = -nx; ny = -ny; }

    const speed = Math.min(1, pSpeed / SPEED_CAP);
    const force = (HIT_MIN + speed * (HIT_MAX - HIT_MIN)) * (outward ? EXIT_SCALE : 1);
    b.vx += nx * force;
    b.vy += ny * force;
    // hit above the centre line and the card tips one way, below and the other
    const offX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const offY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const spin = (nx * offY - ny * offX) * force * SPIN;
    b.vr += Math.max(-SPIN_CAP, Math.min(SPIN_CAP, spin));
    if (!physRaf) physRaf = requestAnimationFrame(physStep);
  };

  projects.forEach((project) => {
    project.addEventListener('mouseenter', (e) => bump(project, e, false));
    project.addEventListener('mouseleave', (e) => bump(project, e, true));
  });

  window.addEventListener('scroll', requestParallax, { passive: true });
  window.addEventListener('scroll', revealDriver, { passive: true });
  window.addEventListener('scroll', updateWeb, { passive: true });
  window.addEventListener('resize', requestParallax);
  window.addEventListener('resize', revealDriver);
  window.addEventListener('resize', updateWeb);
  const viewToggleEl = document.getElementById('viewToggle');
  if (viewToggleEl) {
    viewToggleEl.addEventListener('click', () => {
      requestParallax();
      revealDriver();
      updateWeb();
    });
  }
  updateParallax();
  revealDriver();
  updateWeb();
}

// Smooth scrolling is handled globally by Lenis (see top of file). The earlier
// custom wheel-lerp block was removed during the Development merge so the two
// smooth-scroll engines don't fight over the wheel event. The Works year-rail
// scroll-spy still works because it polls window.scrollY every frame.

// ---------- Klever: lazy-load + loop videos only while scrolled into view ----------
const lazyVideos = document.querySelectorAll('video[data-src]');

if (lazyVideos.length) {
  const updateLazyVideos = () => {
    lazyVideos.forEach((vid) => {
      const rect = vid.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < window.innerHeight;
      if (inView) {
        if (!vid.src) vid.src = vid.dataset.src;
        if (vid.paused) vid.play().catch(() => {});
      } else if (!vid.paused) {
        vid.pause();
      }
    });
  };
  window.addEventListener('scroll', updateLazyVideos, { passive: true });
  window.addEventListener('resize', updateLazyVideos);
  updateLazyVideos();
}


// ---------- Loading screen (home): red sheet → card carousel → 957 window → ASCII globe ----------
// Figma 1502:372 → 1502:397 → 1503:489. The name parts to the edges as the
// red comes up and runs up to the top; the name at 96px runs behind from the
// start, out of focus until the sheet lands; the red sheet turns a quarter clockwise as it shrinks into the
// centre, landing as the upright card 9; its neighbours slide out from behind it to
// either side, and only then does the drum of the four cards (9 · 5 · 957 · 7)
// start turning, upright: three turns (and on, if the page still needs it),
// then it brakes onto 957 just as the count reaches 100. On the way out it
// zooms into the 957 mark, which becomes a window onto the Home page; a grey ASCII globe comes up
// over it, turns half a turn and blows apart, and only then does the page come
// in: its title building out of pixel blocks, the rest of its type scrambling
// in, the hero clip arriving in pixel blocks top down. The count rides the turn
// and waits at HOLD on the page itself; MAX_MS stops a stalled asset from
// keeping anyone out.
const load = document.getElementById('load');

if (load && document.documentElement.classList.contains('is-loading')) {
  const countEl = document.getElementById('loadCount');
  const ring = document.getElementById('loadRing');
  const globeCanvas = document.getElementById('loadGlobe');
  const flood = document.getElementById('loadFlood');
  const marquee = load.querySelector('.load__marquee');
  const faces = Array.from(ring.querySelectorAll('.load__face'));

  const RED_MS = 1100;      // frame 1 holds before the sheet moves
  const FLY_MS = 1100;      // the sheet's quarter turn and shrink down to card 9
  const SPREAD_MS = 520;    // the side cards sliding out from behind card 9
  const SPREAD_FROM = RED_MS + FLY_MS;
  // the turn picks up while the side cards are still settling, so opening and
  // turning run on as one move rather than stop and start
  const SPIN_FROM = SPREAD_FROM + SPREAD_MS * 0.6;
  const SPEED = 300;        // deg/s once up to speed
  const SPIN_UP = 600;      // ms to get up to speed
  const LAND_DEG = 180;     // where 957 faces front (mod 360)
  const TURNS = 3;          // full turns before it lands: 3 and a half in all, onto 957
  const BRAKE_DEG = 270;    // how far before the landing it starts to brake
  const STOP_AT = TURNS * 360 + LAND_DEG - BRAKE_DEG;
  const FAN = 0.75;        // how far a card turns with its place on the drum
  const PART_MS = 120;      // the name parts to the edges almost as the screen comes up
  const LIFT_MS = PART_MS + 700; // …and runs straight on up to the top edge
  const MAX_MS = 10000;
  const HOLD = 92;
  const FULL_MS = 450;      // 100 on 957, a beat, before the way out
  const PORTAL_MS = 1150;   // the zoom into the 957 mark, through to the Home page
  const GLOBE_FROM = 700;   // the globe comes up as the page shows through
  const GLOBE_IN = 600;     // …growing in
  const TURN_MS = 1500;     // its half turn
  const BLAST_MS = 1600;    // then it blows apart, slowly
  const PAGE_AT = GLOBE_FROM + TURN_MS + BLAST_MS * 0.5; // the page's type scrambles in as it clears
  const CLIP_AT = PAGE_AT + 150; // the clip arrives in blocks
  const CLIP_MS = 1200;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  let ready = document.readyState === 'complete';
  window.addEventListener('load', () => { ready = true; }, { once: true });

  const cardUnit = () => Math.min(load.clientHeight / 963, load.clientWidth / 700);

  // the drum: four cards a quarter apart, 9 · 5 · 957 · 7. Each sits at its
  // place on the circle but turns only FAN of that angle, so the neighbours
  // still show at the sides — steep, narrow slivers just off card 9's edges
  // (a quarter turn would put them edge-on);
  // no two cards cut through each other at any point of the turn, and
  // a card going round the back shows its back, darker, so all four read as
  // they turn. Upright the whole way: the only turn is about the vertical axis.
  // spread opens the drum from card 9: the neighbours start tucked well in
  // behind it, slide out sideways flat, and only turn to their angle once
  // they've cleared its edges; the card behind joins once it's open.
  const wrap = (v) => ((v % 360) + 540) % 360 - 180;
  const rad = (d) => (d * Math.PI) / 180;
  const setSpin = (deg, spread = 1) => {
    const cu = cardUnit();
    const R = 230 * cu;   // the side cards rest ~24px off card 9's edges, a ~51px sliver each
    faces.forEach((face, i) => {
      const phi = wrap(i * 90 - deg) * spread;
      const x = R * Math.sin(rad(phi));
      // tucked in behind card 9 while it opens; the left card a little deeper
      // than the right, so the two never cross on their way out
      const tuck = i === 0 ? 0 : (1 - spread) * (i === 3 ? 130 : 110) * cu;
      const z = R * (Math.cos(rad(phi)) - 1) - tuck;
      const a = phi * FAN * spread * spread;
      face.style.transform = `translate3d(${x.toFixed(2)}px,0,${z.toFixed(2)}px) rotateY(${a.toFixed(2)}deg)`;
      face.style.opacity = spread >= 1 || i !== 2 ? '1' : '0';
      face.style.setProperty('--lit', (0.6 + 0.4 * Math.cos(rad(a))).toFixed(3));
    });
  };
  setSpin(0, 0);

  // ---- the Home page, held back while the loader runs ----
  // The type that will scramble in waits hidden; the logo fades in; the hero
  // clip sits under a dark curtain that will lift in blocks.
  const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const introTargets = [
    ...document.querySelectorAll('.nav__links > a, .nav__lang span, .nav__pill[data-contact-open]'),
    ...document.querySelectorAll('.hero__label, .hero__social-list span, .hero__lead'),
  ];
  introTargets.forEach((el) => { el.style.visibility = 'hidden'; });
  const navLogo = document.querySelector('.nav__logo');
  if (navLogo) navLogo.style.opacity = '0';
  const heroMedia = document.querySelector('.hero__media');
  const heroVideo = heroMedia && heroMedia.querySelector('video');
  const pixels = document.createElement('canvas');
  pixels.className = 'hero__pixels';
  pixels.setAttribute('aria-hidden', 'true');
  if (heroMedia) heroMedia.appendChild(pixels);

  // scramble in: every letter starts as a random one and settles left to right
  const scrambleIn = (el, delay) => {
    const text = el.textContent;
    const DUR = 650;
    const marks = Array.from(text, (c, i) => ({
      c,
      at: (i / Math.max(1, text.length)) * DUR * 0.6 + Math.random() * DUR * 0.4,
    }));
    const rand = (c) => {
      const r = SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
      return c === c.toLowerCase() && c !== c.toUpperCase() ? r.toLowerCase() : r;
    };
    setTimeout(() => {
      const t0 = performance.now();
      el.style.visibility = 'visible';
      const tick = (now) => {
        const t = now - t0;
        el.textContent = marks.map((m) => (/\s/.test(m.c) || t >= m.at ? m.c : rand(m.c))).join('');
        if (t < DUR) requestAnimationFrame(tick);
        else el.textContent = text;
      };
      requestAnimationFrame(tick);
    }, delay);
  };

  // the hero title builds itself out of pixel blocks with the rest of the page
  const heroTitle = document.querySelector('.hero__title');
  if (heroTitle) heroTitle.style.visibility = 'hidden';

  const revealPage = () => {
    if (heroTitle) pixelReveal(heroTitle, { duration: 1300 });
    if (navLogo) {
      navLogo.style.transition = 'opacity .6s ease';
      navLogo.style.opacity = '';
    }
    introTargets.forEach((el, i) => scrambleIn(el, i * 45));
  };

  // the clip in blocks, top to bottom: each block goes dark → a coarse pixel
  // of the current frame → the clip, its turn set by its row plus a little luck
  const revealClip = () => {
    if (!heroMedia) return;
    const w = heroMedia.clientWidth;
    const h = heroMedia.clientHeight;
    if (!w || !h) { pixels.remove(); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = Math.max(10, Math.round(w / 22));
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    pixels.width = Math.round(w * dpr);
    pixels.height = Math.round(h * dpr);
    const ctx = pixels.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const sctx = small.getContext('2d');
    const turn = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) turn.push((r / rows) * 0.72 + Math.random() * 0.2);
    pixels.classList.add('is-live');
    const t0 = performance.now();
    const tick = (now) => {
      const q = (now - t0) / CLIP_MS;
      if (heroVideo && heroVideo.readyState >= 2) sctx.drawImage(heroVideo, 0, 0, cols, rows);
      else { sctx.fillStyle = '#2a2a2a'; sctx.fillRect(0, 0, cols, rows); }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
      ctx.fillStyle = '#101010';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const local = (q - turn[r * cols + c]) / 0.12;
          if (local < 0) ctx.fillRect(c * cell, r * cell, cell, cell);
          else if (local >= 1) ctx.clearRect(c * cell, r * cell, cell, cell);
        }
      }
      if (q < 1.1) requestAnimationFrame(tick);
      else pixels.remove();
    };
    requestAnimationFrame(tick);
  };

  // ---- the ASCII globe ----
  // A sphere of mono characters in red: land (3D value noise on the sphere)
  // in o 0 O @, sea in . : ', both shaded by a light from the upper left. It grows in over the open page while turning half a turn about
  // its axis, then blows apart — letters fly out from the centre, flickering
  // to random ones as they go, each on its own luck.
  const hash3 = (x, y, z) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  const land = (x, y, z) => 0.6 * noise3(x * 1.7 + 9, y * 1.7 + 3, z * 1.7 + 5)
    + 0.3 * noise3(x * 3.4 + 1, y * 3.4 + 7, z * 3.4 + 2)
    + 0.1 * noise3(x * 6.8, y * 6.8, z * 6.8);
  // as in the reference: land in o 0 O @ from shade to light, sea in . : '
  const LAND = 'o0O@';
  const SEA = ".:'";

  const runGlobe = () => {
    const gctx = globeCanvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    globeCanvas.classList.add('is-on');
    globeCanvas.width = Math.round(vw * dpr);
    globeCanvas.height = Math.round(vh * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.textBaseline = 'middle';
    gctx.textAlign = 'center';
    const box = heroMedia && heroMedia.getBoundingClientRect();
    const cx = box && box.width ? box.left + box.width / 2 : vw / 2;
    const cy = box && box.width ? box.top + box.height / 2 : vh / 2;
    const R = Math.min(vw, vh) * 0.3;
    const t0 = performance.now();
    const tick = (now) => {
      const t = now - t0;
      const grow = 1 - Math.pow(1 - clamp01(t / GLOBE_IN), 3);
      const r = R * (0.35 + 0.65 * grow);
      const k = clamp01(t / TURN_MS);
      // half a turn, eased in; it keeps drifting on, slowing, while it blows
      // apart so the move never stops dead
      const q = clamp01((t - TURN_MS) / BLAST_MS);
      const rot = Math.PI * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) + 0.35 * (1 - Math.pow(1 - q, 2));
      // the blast: every letter breaks into a few specks that drift out from
      // the centre — each its own way and distance, easing out — and fade
      // evenly; a speck keeps its letter, so nothing flickers
      const fly = 1 - Math.pow(1 - q, 3);
      const fade = 1 - Math.pow(q, 1.8);   // holds its light, then lets go at the end
      const fs = Math.max(7, Math.min(16, R / 15));   // ~48 letters across
      const cw = fs * 0.62;
      const lh = fs * 1.05;
      const scale = r / R;
      gctx.clearRect(0, 0, vw, vh);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const SPECKS = q > 0 ? 4 : 1;
      gctx.font = `500 ${fs * scale}px "Geist Mono", "Roboto Mono", monospace`;
      for (let jj = 0, gy = -R; gy <= R; jj++, gy += lh) {
        for (let ii = 0, gx = -R; gx <= R; ii++, gx += cw) {
          const nx = gx / R, ny = gy / R;
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          const nz = Math.sqrt(1 - d);
          const px = nx * cr + nz * sr, pz = -nx * sr + nz * cr;
          const lit = clamp01(0.35 + 0.65 * (nz * 0.75 - nx * 0.3 - ny * 0.35));
          const isLand = land(px, ny, pz) > 0.53;
          const base = isLand ? LAND[Math.min(LAND.length - 1, Math.floor(lit * LAND.length))] : SEA[Math.min(SEA.length - 1, Math.floor(lit * SEA.length))];
          const a0 = (isLand ? 0.55 + 0.45 * lit : 0.4 + 0.35 * lit) * grow;
          const red = Math.round(185 + 70 * lit), green = Math.round(14 + 36 * lit), blue = Math.round(10 + 26 * lit);
          const len = Math.sqrt(d) || 0.001;
          for (let s = 0; s < SPECKS; s++) {
            let x = cx + gx * scale;
            let y = cy + gy * scale;
            let a = a0;
            let ch = base;
            if (q > 0) {
              const h1 = hash3(ii, jj, 11 + s), h2 = hash3(ii, jj, 23 + s), h3 = hash3(ii, jj, 37 + s);
              // out along the radius, turned up to ±35°, a share of the letters
              // flung far, most drifting a little way
              const ang = Math.atan2(ny / len, nx / len) + (h1 - 0.5) * 1.2;
              // the letter itself only drifts, so the globe thins from the inside
              // out; its specks are the ones flung wide
              const out = R * (0.1 + 1.6 * h2 * h2) * fly * (s === 0 ? 0.45 : 1);
              x += Math.cos(ang) * out;
              y += Math.sin(ang) * out;
              a *= fade * (0.6 + 0.4 * h3) * (s === 0 ? 1 : 0.8);
              if (s > 0) ch = h3 < 0.5 ? '.' : (isLand ? 'o' : ':');
            }
            if (a < 0.015) continue;
            gctx.fillStyle = `rgba(${red},${green},${blue},${a.toFixed(3)})`;
            gctx.fillText(ch, x, y);
          }
        }
      }
      if (t < TURN_MS + BLAST_MS) requestAnimationFrame(tick);
      else globeCanvas.remove();
    };
    requestAnimationFrame(tick);
  };

  const leave = () => {
    load.classList.add('is-out');
    document.documentElement.classList.remove('is-loading');
    if (lenis) lenis.start();

    // the way in to the Home page is a zoom into the 957 mark: the mark on the
    // front card becomes a window onto the page (a hole in the loader in its
    // shape, exactly where it's printed), and the whole loader — cards, type,
    // window and all — is scaled up about the mark, the mark drifting to the
    // middle of the screen as it comes. Slow to start,
    // then rushing in, until the window is all there is; the loader lets go
    // as the last of it passes.
    const card = faces[2].getBoundingClientRect();
    const mark = {
      x: card.left + card.width * (145 / 276),
      y: card.top + card.height * (437 / 550),
      w: card.width * (112 / 276),
    };
    mark.h = mark.w * (91 / 112);
    load.style.setProperty('--mw', `${mark.w}px`);
    load.style.setProperty('--mx', `${mark.x}px`);
    load.style.setProperty('--my', `${mark.y}px`);
    const AX = 15 / 112, AY = 20 / 91;  // a point inside the 9's stroke, in the mark's box
    const box = heroMedia && heroMedia.getBoundingClientRect();
    const C = box && box.width
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ZOOM = 240;                   // how far in it goes
    load.style.transformOrigin = '0 0';
    load.style.willChange = 'transform';
    // the mark stays white as the zoom gets going, then clears into the window
    // (the loader's own copy is cut away by the window, so this one sits just
    // outside it and is moved with it)
    const cover = document.createElement('div');
    cover.className = 'load-mark';
    cover.setAttribute('aria-hidden', 'true');
    const coverMark = document.createElement('img');
    coverMark.src = 'assets/load/mark-957.svg';
    coverMark.alt = '';
    Object.assign(coverMark.style, { left: `${mark.x}px`, top: `${mark.y}px`, width: `${mark.w}px` });
    cover.appendChild(coverMark);
    document.body.appendChild(cover);
    const t0 = performance.now();
    const zoom = (now) => {
      const k = clamp01((now - t0) / PORTAL_MS);
      const e = k * k * (3 - 2 * k);
      const s = Math.pow(ZOOM, Math.pow(k, 2.2));
      // it zooms about the middle of the mark, which drifts to the middle of
      // the screen; only over the last stretch does the zoom shift onto the
      // 9's stroke, so the screen ends up inside the window, not a counter
      const late = Math.pow(k, 3);
      const ax = mark.x + mark.w * (0.5 + (AX - 0.5) * late);
      const ay = mark.y + mark.h * (0.5 + (AY - 0.5) * late);
      const cx = ax + (C.x - ax) * e;
      const cy = ay + (C.y - ay) * e;
      const move = `translate(${cx - s * ax}px,${cy - s * ay}px) scale(${s})`;
      load.style.transform = move;
      cover.style.transform = move;
      const clear = clamp01((k - 0.12) / 0.38);
      cover.style.opacity = String(1 - clear * clear * (3 - 2 * clear));
      load.style.opacity = String(1 - clamp01((k - 0.7) / 0.3));
      if (k < 1) requestAnimationFrame(zoom);
      else {
        load.remove();
        cover.remove();
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }
    };
    requestAnimationFrame(zoom);

    setTimeout(runGlobe, GLOBE_FROM);
    setTimeout(revealPage, PAGE_AT);
    setTimeout(revealClip, CLIP_AT);
  };

  // the sheet in flight: in one move it turns a quarter clockwise, flat in its
  // own plane, and shrinks into the centre as the upright card 9, the turn and
  // the shrink on the same curve. The sheet keeps its own landscape box the
  // whole way (screen → 550 × 276) and the quarter turn stands it up; card 9's
  // art rides inside, turned back the other way, and comes up as it lands
  const lerp = (a, b, t) => a + (b - a) * t;
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const art = flood.querySelector('img');
  const fly = (k) => {
    const vw = load.clientWidth;
    const vh = load.clientHeight;
    const cu = cardUnit();
    const e = inOut(k);
    const w = lerp(vw, 550 * cu, e);
    const h = lerp(vh, 276 * cu, e);
    flood.style.width = `${w}px`;
    flood.style.height = `${h}px`;
    flood.style.transform = `translate(-50%,-50%) rotate(${90 * e}deg)`;
    flood.style.borderRadius = `${12 * cu * e}px`;  // square screen → the card's soft corners
    // the running name behind is out of focus while the sheet is in flight,
    // and comes sharp as it lands
    marquee.style.filter = `blur(${(14 * cu * (1 - k ** 3)).toFixed(2)}px)`;  // holds, then clears at the end
    art.style.width = `${h}px`;
    art.style.height = `${w}px`;
    art.style.opacity = clamp01((k - 0.7) / 0.25).toFixed(3);
  };

  const start = performance.now();
  let p = 0;
  let fullAt = 0;
  let stop = null;

  const step = (now) => {
    const elapsed = now - start;

    if (elapsed >= RED_MS) {
      const k = clamp01((elapsed - RED_MS) / FLY_MS);
      // the drum (folded, so only card 9 shows) fades in under the sheet's
      // last stretch, then takes over from it
      if (k >= 0.9) load.classList.add('is-landing');
      if (k < 1) fly(k);
      else if (!load.classList.contains('is-landed')) {
        load.classList.add('is-landed');
        marquee.style.filter = 'none';
      }
    }
    // the side cards slide out from behind card 9
    // smootherstep: eases in and out, so the cards glide out rather than snap
    const sk = clamp01((elapsed - SPREAD_FROM) / SPREAD_MS);
    const spread = sk * sk * sk * (sk * (sk * 6 - 15) + 10);

    // the drum: up to speed, then a steady turn — three turns, and on for as
    // many more as the page still needs
    const t = Math.max(0, elapsed - SPIN_FROM);
    const cruise = t < SPIN_UP ? (SPEED * t * t) / (2 * SPIN_UP * 1000) : SPEED * (t - SPIN_UP / 2) / 1000;

    const done = (ready && cruise >= STOP_AT) || elapsed >= MAX_MS;
    if (!stop && done && t > 0) {
      // brake onto the next 957 about BRAKE_DEG ahead (after three turns that's
      // three and a half in all), leaving at the speed it was going and
      // settling with none
      const from = cruise;
      const to = LAND_DEG + 360 * Math.ceil((from + BRAKE_DEG - 30 - LAND_DEG) / 360);
      const dist = to - from;
      const ms = Math.min(2400, Math.max(1000, (2 * dist / SPEED) * 1000));
      stop = { at: now, from, to, ms, p };
    }

    let deg = cruise;
    if (stop) {
      // Hermite from (from, SPEED) to (to, 0)
      const s = clamp01((now - stop.at) / stop.ms);
      const v = (SPEED * stop.ms) / 1000;
      deg = (2 * s ** 3 - 3 * s ** 2 + 1) * stop.from + (s ** 3 - 2 * s ** 2 + s) * v + (-2 * s ** 3 + 3 * s ** 2) * stop.to;
      // the count runs the rest of the way with the stop and hits 100 on landing
      p = stop.p + (100 - stop.p) * (1 - (1 - s) * (1 - s));
      if (s >= 1) p = 100;
    } else {
      // a third of the count before the turn, the rest of the way to HOLD with it
      const target = elapsed < SPIN_FROM
        ? 35 * (elapsed / SPIN_FROM)
        : 35 + (HOLD - 35) * Math.min(1, cruise / STOP_AT);
      p += (target - p) * 0.15;
    }
    setSpin(deg, spread);
    countEl.textContent = String(Math.round(p)).padStart(2, '0');

    if (p >= 100 && !fullAt) {
      fullAt = now;
      load.classList.add('is-full');
    }
    if (fullAt && now - fullAt >= FULL_MS) { leave(); return; }
    requestAnimationFrame(step);
  };

  if (lenis) lenis.stop();
  // on a timer rather than the frame loop, so it lands on cue even before the
  // first frames come through
  setTimeout(() => load.classList.add('is-part'), PART_MS);
  setTimeout(() => load.classList.add('is-lift'), LIFT_MS);
  requestAnimationFrame(step);
}
