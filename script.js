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

// ---------- Live Vietnam clock ----------
const liveClock = document.getElementById('liveClock');

if (liveClock) {
  const clockFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const updateClock = () => {
    liveClock.textContent = clockFormatter.format(new Date());
  };

  updateClock();
  setInterval(updateClock, 1000);
}

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

// ---------- Pinned hero: hide once fully covered by the next section ----------
const heroPinned = document.getElementById('hero');
const heroSpacer = document.querySelector('.hero__spacer');
if (heroPinned && heroSpacer) {
  const updateHeroCover = () => {
    const spacerBottom = heroSpacer.getBoundingClientRect().bottom;
    heroPinned.classList.toggle('is-covered', spacerBottom <= 0);
  };
  window.addEventListener('scroll', updateHeroCover, { passive: true });
  window.addEventListener('resize', updateHeroCover);
  updateHeroCover();
}

// ---------- Nav exclusion blend: only while the hero is behind the nav ----------
// The hero itself is position:fixed (pinned), so its own rect never moves with
// scroll — track the hero__spacer instead, which holds the hero's scroll-flow position.
if (nav && heroSpacer) {
  const updateNavBlend = () => {
    const spacerBottom = heroSpacer.getBoundingClientRect().bottom;
    nav.classList.toggle('is-blend', spacerBottom > 64);
  };
  window.addEventListener('scroll', updateNavBlend, { passive: true });
  window.addEventListener('resize', updateNavBlend);
  updateNavBlend();
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

// ---------- Scroll-reveal paragraph (word-by-word, like reactbits ScrollReveal) ----------
const revealParagraphs = document.querySelectorAll('[data-scroll-reveal]');

if (revealParagraphs.length) {
  const FROM_COLOR = [85, 84, 84];
  const TO_COLOR = [255, 255, 255];

  revealParagraphs.forEach((p) => {
    Array.from(p.childNodes).forEach((node) => {
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
  });

  const updateScrollReveal = () => {
    revealParagraphs.forEach((p) => {
      const words = p.querySelectorAll('.sr-word');
      const n = words.length;
      const rect = p.getBoundingClientRect();
      const start = window.innerHeight * 0.9;
      const end = window.innerHeight * 0.35;
      const total = rect.height + (start - end);
      const scrolled = start - rect.top;
      const progress = Math.min(1, Math.max(0, scrolled / total));

      words.forEach((w, i) => {
        const wordStart = i / n;
        const local = Math.min(1, Math.max(0, (progress - wordStart) * n * 1.4));
        const mixed = FROM_COLOR.map((f, idx) => Math.round(f + (TO_COLOR[idx] - f) * local));
        w.style.color = `rgb(${mixed.join(',')})`;
        w.style.opacity = 0.4 + 0.6 * local;
        w.style.filter = `blur(${(1 - local) * 3}px)`;
      });
    });
  };

  window.addEventListener('scroll', updateScrollReveal, { passive: true });
  window.addEventListener('resize', updateScrollReveal);
  updateScrollReveal();
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
      // counter-translate the centre so it stays pinned at centre like nudot
      if (cfCenter) cfCenter.style.transform = `translateY(${(-fy).toFixed(2)}px)`;
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
      const head = `<header class="project__head"><span>${p.code}</span><span>${p.tags.join(', ')}</span></header>` +
        `<div class="project__img"><img src="${p.image}" alt="${p.code} project"></div>`;
      const inner = p.href ? `<a href="${p.href}" class="project__link">${head}</a>` : head;
      return `<article class="project" data-category="${p.category}" data-year="${p.year}">${inner}</article>`;
    }).join('');
  }

  const projects = worksGrid.querySelectorAll('.project');
  let activeCategory = 'all';
  let activeYear = null;

  const applyFilters = () => {
    projects.forEach((project) => {
      const categories = project.dataset.category.split(' ');
      const year = project.dataset.year;
      const matchesCategory = activeCategory === 'all' || categories.includes(activeCategory);
      const matchesYear = !activeYear || year === activeYear;
      project.classList.toggle('is-hidden', !(matchesCategory && matchesYear));
    });
  };

  categoryFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    categoryFilter.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeCategory = btn.dataset.filter;
    applyFilters();
  });

  yearFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const isAlreadyActive = btn.classList.contains('is-active');
    yearFilter.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
    if (isAlreadyActive) {
      activeYear = null;
    } else {
      btn.classList.add('is-active');
      activeYear = btn.dataset.year;
    }
    applyFilters();
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
}

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
