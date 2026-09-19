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

  randomChar() {
    return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
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
        if (!item.char || Math.random() < 0.5) item.char = this.randomChar();
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

document.querySelectorAll('.nav__links a, .menu-link').forEach((el) => {
  const scrambler = new ScrambleText(el);
  el.addEventListener('mouseenter', () => scrambler.run());
});

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

// ---------- Nav (works + project pages): hide while scrolling down, show again on the way up ----------
(function autoHideNav() {
  const nav = document.getElementById('nav');
  const menu = document.getElementById('menuOverlay');
  if (!nav || document.body.classList.contains('home')) return;
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

// ---------- Menu overlay ----------
const menuToggle = document.getElementById('menuToggle');
const menuOverlay = document.getElementById('menuOverlay');
const menuClose = document.getElementById('menuClose');

if (menuToggle && menuOverlay && menuClose) {
  menuToggle.addEventListener('click', () => {
    menuOverlay.classList.toggle('is-open');
  });

  menuClose.addEventListener('click', () => {
    menuOverlay.classList.remove('is-open');
  });

  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) menuOverlay.classList.remove('is-open');
  });

  menuOverlay.querySelectorAll('.menu-link').forEach((link) => {
    link.addEventListener('click', () => menuOverlay.classList.remove('is-open'));
  });
}

// ---------- Hero stage: the image grows to fill the screen, then the about copy rises over it ----------
// One pinned stage, three beats driven by how far the page has scrolled into it
// (frames 1 → 4 of the Figma storyboard):
//   1. the image grows from its slot under the heading to the full viewport
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
  const copy = heroStage.querySelector('.hero__about');
  const copyText = heroStage.querySelector('.hero__about-text');
  const anchor = document.getElementById('about');
  const fxBox = heroMedia.querySelector('.hero__fx');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = fxBox && !reduceMotion && typeof TrackingFX !== 'undefined'
    ? new TrackingFX(fxBox.querySelector('video'), fxBox.querySelector('canvas'),
      { cell: 5, zoom: 1.8, trackers: 4, squareScale: 0.8 })
    : null;

  // scroll distance of each beat, as a share of the viewport height
  const GROW_H = 0.9;
  const GROW_W = 0.9;
  const MID_WIDTH = 1 / 3;        // beat 1 ends 640 wide in the 1920 frame
  const START_RADIUS = 16 / 1920; // corner radius in the slot, per px of width
  const MID_RADIUS = 60 / 1920;   // …and once it's a full-height column
  const INTRO_DRIFT = 183 / 977;  // how far the block has risen by the end of beat 1, per px of height
  const FX_FADE = 0.35;           // share of beat 1 over which the FX clip fades off
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
  let start = { w: 0, h: 0, top: 0 };
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
    start = { w: s.width, h: s.height, top: s.top - box.top };
    drift = INTRO_DRIFT * vh;
    // far enough that the buttons have cleared the top edge by the end of beat 2
    introExit = intro.lastElementChild.getBoundingClientRect().bottom - box.top + 40;

    // the ASCII clip stays the size of the slot while the image opens around it
    if (fxBox) {
      fxBox.style.setProperty('--fx-w', `${start.w}px`);
      fxBox.style.setProperty('--fx-h', `${start.h}px`);
      if (fx) fx.resize();
    }

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
    const r0 = Math.max(8, vw * START_RADIUS);
    const r1 = Math.max(20, vw * MID_RADIUS);
    heroMedia.style.width = `${w}px`;
    heroMedia.style.height = `${h}px`;
    heroMedia.style.transform = `translate3d(${(vw - w) / 2}px,${top}px,0)`;
    heroMedia.style.borderRadius = `${b > 0 ? lerp(r1, 0, b) : lerp(r0, r1, a)}px`;

    // the FX clip gives way to the clip behind it early in the first beat
    if (fxBox) {
      const fxOpacity = 1 - clamp01(y / (growH * FX_FADE));
      fxBox.style.opacity = fxOpacity;
      if (fx) fx.setEnabled(fxOpacity > 0);
    }

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
  const measure = () => {
    const maxW = (c) => Math.max(...c.words.map((w) => w.offsetWidth));
    ranges = {
      l: Math.max(0, L.col.offsetWidth - maxW(L)),
      r: Math.max(0, R.col.offsetWidth - maxW(R)),
    };
    const ul = L.col.querySelector('ul');
    fieldH = ul ? ul.offsetHeight : 0;
  };
  measure();
  window.addEventListener('resize', measure);

  // place every word on the wave immediately (nudot's ensureInit)
  L.words.forEach((w, i) => { L.cur[i] = waveX(i, 0, ranges.l); w.style.transform = `translateX(${L.cur[i]}px)`; });
  R.words.forEach((w, i) => { R.cur[i] = -waveX(i, 0, ranges.r); w.style.transform = `translateX(${R.cur[i]}px)`; });

  // centre image follows the focused row (nudot: thumb.src = focused data-image)
  const panelImg = document.getElementById('cfPanelImg');
  let currentSrc = panelImg ? panelImg.getAttribute('src') : '';
  L.words.forEach((w) => { if (w.dataset.image) { const im = new Image(); im.src = w.dataset.image; } });
  const setPanelImage = (word) => {
    const src = word && word.dataset.image;
    if (panelImg && src && src !== currentSrc) { currentSrc = src; panelImg.src = src; }
  };

  // ---- nudot-style pinned entrance -------------------------------------
  // The section is sticky inside a tall .cf-stage. The first P_WIPE of the
  // pinned scroll drives a bottom-up clip-path curtain (nudot's
  // setDarkWrapperReveal: inset(H% 0 0 0) -> inset(0)); the remaining scroll
  // drives the wave.
  const stage = document.getElementById('cfStage');
  const P_WIPE = 0.30;   // entrance curtain finishes here
  const P_EXIT = 0.70;   // wave finishes here; remaining scroll dissolves out
                         // (earlier so the corefield is still fading while Works rises)
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const stageActive = () => stage && window.innerWidth >= 720;

  let scrollProgress = 0;
  const updateProgress = () => {
    if (stageActive()) {
      const r = stage.getBoundingClientRect();
      const total = Math.max(1, r.height - window.innerHeight);
      const p = clamp01(-r.top / total);
      const wipe = easeInOutCubic(clamp01(p / P_WIPE));
      corefieldEl.style.clipPath = `inset(${((1 - wipe) * 100).toFixed(2)}% 0 0 0)`;
      corefieldEl.classList.toggle('is-revealed', wipe > 0.45);
      // wave runs between the curtain and the exit
      scrollProgress = clamp01((p - P_WIPE) / (P_EXIT - P_WIPE));
      // exit: dissolve the whole field out so it hands off to Works without a
      // hard cut (and hides the empty tail once the last row is centred)
      const exit = easeInOutCubic(clamp01((p - P_EXIT) / (1 - P_EXIT)));
      corefieldEl.style.opacity = (1 - exit).toFixed(3);
    } else {
      corefieldEl.style.clipPath = 'none';
      corefieldEl.style.opacity = '1';
      const rect = corefieldEl.getBoundingClientRect();
      const vh = window.innerHeight;
      scrollProgress = clamp01((vh - rect.top) / (vh + rect.height));
      const inView = rect.top < vh * 0.65 && rect.bottom > vh * 0.35;
      corefieldEl.classList.toggle('is-revealed', inView);
    }
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // ---- per-frame update (nudot's _ipWave.update) ------------------------
  let smoothP = 0;
  let lastFocused = -1;
  const tick = () => {
    smoothP += (scrollProgress - smoothP) * SMOOTH;
    const p = smoothP;

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
    } else {
      cfField.style.transform = 'none';
      if (cfCenter) cfCenter.style.transform = 'none';
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
      setPanelImage(L.words[focused]);
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


// ---------- Loading screen (home): dial → wordmark → split reveal ----------
const load = document.getElementById('load');

if (load && document.documentElement.classList.contains('is-loading')) {
  const countEl = document.getElementById('loadCount');
  const slot = document.getElementById('loadSlot');

  const MIN_MS = 4200; // long enough for the dial, the wordmark and the split to read
  const MAX_MS = 10000; // never strand the visitor behind one stalled asset
  const HOLD = 92;     // where the count waits on the page itself
  const SHOT_MS = 260; // how fast the stills swap once the wordmark is open

  // the stills that ride out of the gap, straight from the shared project list
  const SHOT_RUN = 10; // how many flash past once the wordmark splits open
  const pool = (typeof PROJECTS !== 'undefined' ? PROJECTS : [])
    .map((p) => p.image)
    .filter(Boolean);

  // a random run — the pool is smaller than the run, so stills repeat by design
  for (let i = 0; pool.length && i < SHOT_RUN; i += 1) {
    const img = document.createElement('img');
    img.src = pool[Math.floor(Math.random() * pool.length)];
    img.alt = '';
    if (i === 0) img.className = 'is-on';
    slot.appendChild(img);
  }

  let shotIndex = 0;
  let shotTimer = null;
  const cycleShots = () => {
    if (shotTimer || slot.children.length < 2) return;
    shotTimer = setInterval(() => {
      const imgs = slot.children;
      imgs[shotIndex].classList.remove('is-on');
      shotIndex = (shotIndex + 1) % imgs.length;
      imgs[shotIndex].classList.add('is-on');
    }, SHOT_MS);
  };

  let phase = '';
  const setPhase = (next) => {
    if (phase === next) return;
    phase = next;
    load.classList.remove('is-clock', 'is-mark', 'is-split');
    load.classList.add(next);
    if (next === 'is-split') cycleShots();
  };

  let ready = document.readyState === 'complete';
  window.addEventListener('load', () => { ready = true; }, { once: true });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(shotTimer);

    load.classList.add('is-done');
    document.documentElement.classList.remove('is-loading');
    if (lenis) lenis.start();

    setTimeout(() => {
      load.remove();
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    }, 800);
  };

  const start = performance.now();
  let p = 0;

  const step = (now) => {
    const elapsed = now - start;
    // the count never outruns the clock, and never stalls past MAX_MS
    const capped = HOLD * Math.min(1, elapsed / MIN_MS);
    const target = (ready && elapsed >= MIN_MS) || elapsed >= MAX_MS ? 100 : capped;

    p += (target - p) * 0.1;
    if (target === 100 && p > 99.5) p = 100;

    load.style.setProperty('--p', p.toFixed(2));
    countEl.textContent = String(Math.round(p)).padStart(2, '0');

    if (p < 55) setPhase('is-clock');
    else if (p < 65) setPhase('is-mark');
    else setPhase('is-split');

    if (p >= 100) finish();
    else requestAnimationFrame(step);
  };

  if (lenis) lenis.stop();
  setPhase('is-clock');
  requestAnimationFrame(step);
}
