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
      scramblers.forEach((sc) => sc.run());
    });
  });

  // ---------- Works: "VIEW" label that follows the cursor ----------
  const cursorView = document.createElement('div');
  cursorView.className = 'cursor-view';
  cursorView.textContent = 'VIEW';
  document.body.appendChild(cursorView);

  // list view: the hovered project's image follows the cursor instead of the pill
  const cursorImg = document.createElement('img');
  cursorImg.className = 'cursor-img';
  cursorImg.alt = '';
  document.body.appendChild(cursorImg);

  // full-width red line behind the hovered card, centred on its height.
  // appended INSIDE .works: the section is a stacking context (z-index:6 with
  // its own opaque backdrop), so overlays parked on <body> would paint under it
  const hoverLine = document.createElement('div');
  hoverLine.className = 'hover-line';
  worksGrid.closest('.works').appendChild(hoverLine);

  // document-space layout position: transform-free like offsetTop, but summed
  // through the offsetParent chain so positioned ancestors (.works is
  // position:relative) don't skew the numbers
  const layoutTop = (el) => {
    let t = 0;
    for (let n = el; n; n = n.offsetParent) t += n.offsetTop;
    return t;
  };
  const layoutLeft = (el) => {
    let l = 0;
    for (let n = el; n; n = n.offsetParent) l += n.offsetLeft;
    return l;
  };

  const positionHoverLine = (project) => {
    // layout values are transform-free, so mid-transition measurements don't
    // wobble the line. Segments run right up to the shrunken card's edges
    // (the card scales to .94 on hover), so the line always touches the card
    const HOVER_SCALE = 0.94;
    const w = project.offsetWidth;
    const centerX = layoutLeft(project) + w / 2;
    const centerY = layoutTop(project) - window.scrollY + project.offsetHeight / 2;
    const half = (w / 2) * HOVER_SCALE;
    hoverLine.style.top = `${centerY}px`;
    hoverLine.style.setProperty('--cutL', `${Math.max(0, centerX - half)}px`);
    hoverLine.style.setProperty('--cutR', `${Math.max(0, window.innerWidth - centerX - half)}px`);
  };

  let cvX = 0, cvY = 0, cvTargetX = 0, cvTargetY = 0, cvRaf = null, cvActive = false;
  let hoveredProject = null; // read by updateWeb: dims the other cards' threads

  const cvLoop = () => {
    cvX += (cvTargetX - cvX) * 0.2;
    cvY += (cvTargetY - cvY) * 0.2;
    cursorView.style.left = `${cvX}px`;
    cursorView.style.top = `${cvY}px`;
    cursorImg.style.left = `${cvX}px`;
    cursorImg.style.top = `${cvY}px`;
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
      if (worksGrid.classList.contains('is-list')) {
        // list view: the project image follows the cursor instead of the pill
        const src = project.querySelector('.project__img img')?.getAttribute('src');
        if (src && cursorImg.getAttribute('src') !== src) cursorImg.setAttribute('src', src);
        cursorImg.classList.add('is-visible');
      } else {
        cursorView.classList.add('is-visible');
      }
      if (!cvRaf) cvRaf = requestAnimationFrame(cvLoop);
      if (worksGrid.classList.contains('is-list')) {
        if (hoverLine.classList.contains('is-visible')) {
          // jumped straight from another card: reset instantly (no transition)
          // and replay the grow animation at the new position
          hoverLine.style.transition = 'none';
          hoverLine.classList.remove('is-visible');
          positionHoverLine(project);
          void hoverLine.offsetWidth; // flush so the reset applies before re-showing
          hoverLine.style.transition = '';
        } else {
          positionHoverLine(project);
        }
        hoverLine.classList.add('is-visible');
      }
    });
    project.addEventListener('mousemove', (e) => {
      cvTargetX = e.clientX;
      cvTargetY = e.clientY;
      if (!cvRaf) cvRaf = requestAnimationFrame(cvLoop);
      if (worksGrid.classList.contains('is-list')) {
        positionHoverLine(project); // row can shift under smooth scroll
      } else {
        hoverLine.classList.remove('is-visible');
      }
    });
    project.addEventListener('mouseleave', () => {
      cvActive = false;
      hoveredProject = null;
      updateWeb();
      cursorView.classList.remove('is-visible');
      cursorImg.classList.remove('is-visible');
      hoverLine.classList.remove('is-visible');
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

// ---------- Intro / landing: draggable image collage + Discover gate ----------
const intro = document.getElementById('intro');

if (intro && !document.documentElement.classList.contains('intro-seen')) {
  const track = document.getElementById('introTrack');
  const hint = document.getElementById('introHint');
  const enterBtn = document.getElementById('introEnter');

  // x = px along the strip, y = % from top, w/h = px (all at a 1440px reference width)
  const TILES = [
    { src: 'assets/project-1.jpg',          x:    0, y:  9, w: 320, h: 400 },
    { src: 'assets/img/img2.jpg',           x:  250, y: -7, w: 230, h: 290 },
    { src: 'assets/img/img 1.jpg',          x:  370, y: 54, w: 260, h: 320 },
    { src: 'assets/project-2.jpg',          x:  650, y: 17, w: 300, h: 380 },
    { src: 'assets/klever/hero-banner.jpg', x:  910, y:  2, w: 340, h: 220 },
    { src: 'assets/img/img 3.jpg',          x:  990, y: 61, w: 240, h: 300 },
    { src: 'assets/project-3.jpg',          x: 1290, y: 29, w: 280, h: 350 },
    { src: 'assets/img/img 5.jpg',          x: 1590, y:  7, w: 240, h: 300 },
    { src: 'assets/img/img 6.jpg',          x: 1610, y: 63, w: 260, h: 210 },
    { src: 'assets/project-4.jpg',          x: 1890, y: 21, w: 300, h: 380 },
    { src: 'assets/img/img 8.jpg',          x: 2210, y:  5, w: 260, h: 330 },
    { src: 'assets/img/img7.jpg',           x: 2230, y: 56, w: 240, h: 300 },
    { src: 'assets/works-hero.jpg',         x: 2530, y: 34, w: 320, h: 240 },
    { src: 'assets/img/img 9.jpg',          x: 2870, y: 11, w: 240, h: 300 },
    { src: 'assets/img/img10.jpg',          x: 2890, y: 61, w: 260, h: 280 },
    { src: 'assets/footer-photo.jpg',       x: 3190, y: 27, w: 300, h: 360 },
  ];
  const SET_W = 3560; // strip length before it repeats

  let scale = 1;
  let setWidth = SET_W;

  const buildTiles = () => {
    scale = Math.min(1, window.innerWidth / 1440);
    // keep tiles substantial on phones instead of shrinking them to stamps
    scale = Math.max(scale, 0.42);
    // never let one repeat be narrower than the viewport, or the loop would gap
    scale = Math.max(scale, window.innerWidth / SET_W);
    setWidth = SET_W * scale;

    // tall/narrow screens need the rows pushed further apart to fill the height
    const ySpread = window.innerWidth < 640 ? 1.3 : 1;

    track.innerHTML = '';
    track.style.width = `${setWidth * 2}px`;

    for (let copy = 0; copy < 2; copy++) {
      TILES.forEach((t) => {
        const fig = document.createElement('div');
        fig.className = 'intro__tile';
        fig.style.left = `${t.x * scale + copy * setWidth}px`;
        fig.style.top = `${t.y * ySpread}%`;
        fig.style.width = `${t.w * scale}px`;
        fig.style.height = `${t.h * scale}px`;

        const img = document.createElement('img');
        img.src = t.src;
        img.alt = '';
        img.loading = copy === 0 ? 'eager' : 'lazy';
        img.draggable = false;
        fig.appendChild(img);
        track.appendChild(fig);
      });
    }
  };

  buildTiles();

  // ---- entrance: tiles start on a ring around the centre, then fly outward ----
  const playEntrance = () => {
    const tiles = [...track.querySelectorAll('.intro__tile')];
    if (!tiles.length) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = -offset + vw / 2; // viewport centre expressed in track coords
    const cy = vh / 2;
    const N = tiles.length;
    const R_TIGHT = Math.min(vw, vh) * 0.06; // barely bigger than a dot
    const R_OPEN = Math.min(vw, vh) * 0.36;

    // where tile i sits on a ring of the given radius, spun by `turn` radians
    const ringPos = (tile, i, radius, turn) => {
      const x = parseFloat(tile.style.left) || 0;
      const y = ((parseFloat(tile.style.top) || 0) / 100) * vh;
      const w = parseFloat(tile.style.width) || 0;
      const h = parseFloat(tile.style.height) || 0;
      const a = (i / N) * Math.PI * 2 + turn;
      return {
        dx: cx + Math.cos(a) * radius - (x + w / 2),
        dy: cy + Math.sin(a) * radius - (y + h / 2),
      };
    };

    const SWELL = 1200; // ring grows
    const BREAK = 1500; // ring scatters into the collage

    // 1. clenched: a tiny ring of specks in the middle
    tiles.forEach((tile, i) => {
      const p = ringPos(tile, i, R_TIGHT, 0);
      tile.style.transition = 'none';
      tile.style.transform = `translate(${p.dx}px,${p.dy}px) scale(.05) rotate(-120deg)`;
      tile.style.opacity = '0';
    });

    void track.offsetWidth; // commit the tight ring before letting it grow

    // stills are small and dark while ringed — lift them so it reads
    track.classList.add('is-entering');

    // 2. the ring winds open, growing outward as it turns
    tiles.forEach((tile, i) => {
      const p = ringPos(tile, i, R_OPEN, 0.62);
      tile.style.transition =
        `transform ${SWELL}ms cubic-bezier(.4,0,.15,1),opacity .55s ease`;
      tile.style.transform = `translate(${p.dx}px,${p.dy}px) scale(.52) rotate(-24deg)`;
      tile.style.opacity = '1';
    });

    // 3. it breaks apart and every still slots into the collage
    setTimeout(() => {
      tiles.forEach((tile, i) => {
        const delay = (i % (N / 2)) * 26;
        tile.style.transition = `transform ${BREAK}ms cubic-bezier(.16,1,.3,1) ${delay}ms`;
        tile.style.transform = 'translate(0,0) scale(1) rotate(0deg)';
      });
      setTimeout(() => track.classList.remove('is-entering'), BREAK + 26 * (N / 2));
    }, SWELL - 120);
  };

  // ---- run the ring entrance once the first copy of the collage has decoded ----
  (() => {
    const imgs = [...track.querySelectorAll('.intro__tile img')].slice(0, TILES.length);
    const total = imgs.length || 1;
    let loaded = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('is-ready');
      playEntrance();
    };

    imgs.forEach((img) => {
      if (img.complete) {
        loaded++;
        return;
      }
      const done = () => {
        loaded++;
        if (loaded >= total) finish();
      };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });

    if (loaded >= total) finish();
    // never strand the visitor if an image stalls
    setTimeout(finish, 8000);
  })();

  let offset = -setWidth * 0.5; // start mid-strip so there's content both ways
  let target = offset;
  let dragging = false;
  let startX = 0;
  let startTarget = 0;
  let moved = false;
  let rafId = null;

  const wrap = (v) => ((v % setWidth) - setWidth) % setWidth; // keeps v in [-setWidth, 0)

  const render = () => {
    offset += (target - offset) * 0.09;
    if (Math.abs(target - offset) < 0.1) offset = target;
    const w = wrap(offset);
    track.style.transform = `translate3d(${w}px,0,0)`;
    if (offset !== target) {
      rafId = requestAnimationFrame(render);
    } else {
      rafId = null;
    }
  };

  const kick = () => { if (!rafId) rafId = requestAnimationFrame(render); };

  const nudgeHint = () => {
    if (hint && !hint.classList.contains('is-hidden')) hint.classList.add('is-hidden');
  };

  // wheel / trackpad — use whichever axis the user is actually moving
  intro.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    target -= delta;
    nudgeHint();
    kick();
  }, { passive: false });

  // pointer drag
  intro.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startTarget = target;
    intro.classList.add('is-dragging');
    intro.setPointerCapture(e.pointerId);
  });

  intro.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) { moved = true; nudgeHint(); }
    target = startTarget + dx;
    kick();
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    intro.classList.remove('is-dragging');
    if (e.pointerId != null && intro.hasPointerCapture?.(e.pointerId)) {
      intro.releasePointerCapture(e.pointerId);
    }
  };
  intro.addEventListener('pointerup', endDrag);
  intro.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    const ratio = setWidth ? offset / setWidth : 0;
    buildTiles();
    offset = ratio * setWidth;
    target = offset;
    kick();
  });

  // lock the page behind the intro
  document.documentElement.classList.add('intro-open');
  if (typeof lenis !== 'undefined' && lenis) lenis.stop();

  let dismissed = false;
  const dismissIntro = () => {
    if (dismissed) return;
    dismissed = true;

    intro.classList.add('is-leaving');
    document.documentElement.classList.remove('intro-open');
    if (typeof lenis !== 'undefined' && lenis) lenis.start();
    try { sessionStorage.setItem('957IntroSeen', '1'); } catch (e) {}

    // the hero video is behind the intro — make sure it's rolling on reveal
    const heroVideo = document.querySelector('.hero__bg-video');
    if (heroVideo) heroVideo.play().catch(() => {});

    setTimeout(() => {
      intro.remove();
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    }, 800);
  };

  enterBtn.addEventListener('click', dismissIntro);
  // a click that wasn't a drag anywhere on the collage also enters
  intro.addEventListener('click', (e) => {
    if (moved || e.target.closest('.intro__enter')) return;
    dismissIntro();
  });
  window.addEventListener('keydown', (e) => {
    if (dismissed) return;
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') dismissIntro();
  });

  render();
}
