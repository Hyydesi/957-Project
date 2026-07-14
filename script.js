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
const themedSections = document.querySelectorAll('[data-theme]');

if (nav && themedSections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        nav.setAttribute('data-theme', entry.target.dataset.theme);
      }
    });
  }, { rootMargin: '-80px 0px -85% 0px', threshold: 0 });

  themedSections.forEach((section) => navObserver.observe(section));
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

// ---------- Core keyword field (float, highlight cycle, parallax) ----------
const cfField = document.getElementById('cfField');

if (cfField) {
  const cfWords = Array.from(cfField.querySelectorAll('.cf__word'));

  // random float timing per word
  cfWords.forEach((w) => {
    w.style.setProperty('--dur', `${5 + Math.random() * 3}s`);
    w.style.setProperty('--delay', `${-Math.random() * 5}s`);
  });

  // stagger index per column (for the fan-out entrance)
  ['left', 'right'].forEach((side) => {
    cfField.querySelectorAll(`.cf__col--${side} li`).forEach((li, i) => {
      li.style.setProperty('--i', i);
    });
  });

  // reveal (fan out) when the section scrolls into view; replays on re-entry
  const corefieldEl = cfField.closest('.corefield');
  const updateReveal = () => {
    const rect = corefieldEl.getBoundingClientRect();
    const vh = window.innerHeight;
    // in view when the section overlaps the middle band of the viewport
    const inView = rect.top < vh * 0.65 && rect.bottom > vh * 0.35;
    corefieldEl.classList.toggle('is-revealed', inView);
  };
  window.addEventListener('scroll', updateReveal, { passive: true });
  window.addEventListener('resize', updateReveal);
  updateReveal();

  // cycle a highlighted word on each side
  const leftWords = Array.from(cfField.querySelectorAll('.cf__col--left .cf__word'));
  const rightWords = Array.from(cfField.querySelectorAll('.cf__col--right .cf__word'));
  let prevLeft = null;
  let prevRight = null;

  const pick = (arr, prev) => {
    let next;
    do { next = arr[Math.floor(Math.random() * arr.length)]; } while (next === prev && arr.length > 1);
    return next;
  };

  const cycleHighlight = () => {
    if (prevLeft) prevLeft.classList.remove('is-active');
    if (prevRight) prevRight.classList.remove('is-active');
    prevLeft = pick(leftWords, prevLeft);
    prevRight = pick(rightWords, prevRight);
    prevLeft.classList.add('is-active');
    prevRight.classList.add('is-active');
  };

  cycleHighlight();
  let cycleTimer = setInterval(cycleHighlight, 1900);

  // subtle parallax toward cursor
  let targetX = 0, targetY = 0, curX = 0, curY = 0, rafId = null;

  const animateParallax = () => {
    curX += (targetX - curX) * 0.06;
    curY += (targetY - curY) * 0.06;
    cfField.style.transform = `translate(${curX}px, ${curY}px)`;
    if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
      rafId = requestAnimationFrame(animateParallax);
    } else {
      rafId = null;
    }
  };

  corefieldEl.addEventListener('mousemove', (e) => {
    const rect = corefieldEl.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * -24;
    targetY = ((e.clientY - rect.top) / rect.height - 0.5) * -16;
    if (!rafId) rafId = requestAnimationFrame(animateParallax);
  });
  corefieldEl.addEventListener('mouseleave', () => {
    targetX = 0; targetY = 0;
    if (!rafId) rafId = requestAnimationFrame(animateParallax);
  });
}

// ---------- Works: category filter ----------
const categoryFilter = document.getElementById('categoryFilter');
const yearFilter = document.getElementById('yearFilter');
const worksGrid = document.getElementById('worksGrid');

if (categoryFilter && yearFilter && worksGrid) {
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
  cursorView.textContent = 'VIEW ↗';
  document.body.appendChild(cursorView);

  // full-width red line behind the hovered card, centred on its height
  const hoverLine = document.createElement('div');
  hoverLine.className = 'hover-line';
  document.body.appendChild(hoverLine);

  const positionHoverLine = (project) => {
    const rect = project.getBoundingClientRect();
    hoverLine.style.top = `${rect.top + rect.height / 2}px`;
  };

  let cvX = 0, cvY = 0, cvTargetX = 0, cvTargetY = 0, cvRaf = null, cvActive = false;

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
      // snap to the cursor on entry so it doesn't fly in from the corner
      cvX = cvTargetX = e.clientX;
      cvY = cvTargetY = e.clientY;
      // list view keeps the original solid red pill (no blending)
      cursorView.classList.toggle('is-red', worksGrid.classList.contains('is-list'));
      cursorView.classList.add('is-visible');
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
      cursorView.classList.remove('is-visible');
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
      // offsetTop/offsetHeight are layout values (transforms excluded),
      // so no feedback loop with the offsets we apply
      const center = project.offsetTop - window.scrollY + project.offsetHeight / 2;
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
      const top = project.offsetTop - window.scrollY;
      const p = Math.max(0, Math.min(1, (start - top) / (start - end)));
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic: fast entry, soft landing
      project.style.setProperty('--rev', `${((1 - eased) * REV_DISTANCE).toFixed(1)}px`);
      project.style.setProperty('--revo', eased.toFixed(3));
    });
  };

  window.addEventListener('scroll', requestParallax, { passive: true });
  window.addEventListener('scroll', revealDriver, { passive: true });
  window.addEventListener('resize', requestParallax);
  window.addEventListener('resize', revealDriver);
  const viewToggleEl = document.getElementById('viewToggle');
  if (viewToggleEl) {
    viewToggleEl.addEventListener('click', () => {
      requestParallax();
      revealDriver();
    });
  }
  updateParallax();
  revealDriver();
}

// ---------- Smooth wheel scrolling (Lenis-style lerp), home page only ----------
if (document.getElementById('hero') && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
  let ssTarget = window.scrollY;
  let ssCurrent = window.scrollY;
  let ssRaf = null;

  const ssMax = () => document.documentElement.scrollHeight - window.innerHeight;

  const ssStep = () => {
    ssCurrent += (ssTarget - ssCurrent) * 0.11;
    if (Math.abs(ssTarget - ssCurrent) < 0.5) {
      ssCurrent = ssTarget;
      ssRaf = null;
    } else {
      ssRaf = requestAnimationFrame(ssStep);
    }
    window.scrollTo({ top: ssCurrent, behavior: 'instant' });
  };

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch zoom
    const overlay = document.getElementById('menuOverlay');
    if (overlay && overlay.classList.contains('is-open')) return;
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 33;
    else if (e.deltaMode === 2) delta *= window.innerHeight;
    ssTarget = Math.max(0, Math.min(ssMax(), ssTarget + delta));
    if (!ssRaf) ssRaf = requestAnimationFrame(ssStep);
  }, { passive: false });

  // resync when scrolled by other means (keyboard, scrollbar drag, anchor links)
  window.addEventListener('scroll', () => {
    if (!ssRaf) {
      ssTarget = window.scrollY;
      ssCurrent = ssTarget;
    }
  }, { passive: true });
}
