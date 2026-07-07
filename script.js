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
