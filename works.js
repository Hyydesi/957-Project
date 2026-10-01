// PROJECTS is defined in projects.js (loaded before this file) — single source of truth.

// ---------- Hero: heading scrambles in on arrival ----------
// The nav's hover scramble (script.js), played once the page has opened to
// full screen: every
// letter starts as a random character and they settle left to right. Each
// letter sits in a box held at its final width while it scrambles, so the
// heading never reflows (Anton's letters differ a lot in width); the plain
// text goes back in once it's done.
(function heroScramble() {
  const title = document.querySelector('.whero__title');
  if (!title || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const text = title.textContent;
  const randomChar = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];

  const glyphs = [];
  title.textContent = '';
  [...text].forEach((ch) => {
    if (ch === ' ') { title.append(' '); return; }
    const span = document.createElement('span');
    span.className = 'whero__glyph';
    span.textContent = ch;
    title.appendChild(span);
    glyphs.push({ span, to: ch, end: 0, char: '' });
  });
  title.classList.add('is-scrambling');

  const run = () => {
    glyphs.forEach((g, i) => {
      g.span.style.width = `${g.span.getBoundingClientRect().width}px`;
      g.end = Math.floor(i * 1.6 + 10 + Math.random() * 10);
      g.char = randomChar();
    });
    let frame = 0;
    const step = () => {
      let done = 0;
      glyphs.forEach((g) => {
        if (frame >= g.end) { g.span.textContent = g.to; done++; return; }
        if (Math.random() < 0.5) g.char = randomChar();
        g.span.textContent = g.char;
      });
      title.classList.remove('is-scrambling'); // shown from the first random frame
      if (done < glyphs.length) { frame++; requestAnimationFrame(step); }
      else title.textContent = text;
    };
    step();
  };

  // start once the page fills the screen — after the transition from the
  // last page has grown it to full size (window.pageReady, page-transition.js)
  // — and the display face is in, so the letter boxes measure true
  Promise.all([
    window.pageReady || Promise.resolve(),
    document.fonts ? document.fonts.ready : null,
  ]).then(() => requestAnimationFrame(run));
})();

// ---------- Hero: stills flying out of the middle ----------
// Placeholder set from the existing assets — swap freely; any mix of portrait
// and landscape works, each card takes its image's own proportions.
const FLY_IMAGES = [
  'assets/project-1.jpg',
  'assets/project-2.jpg',
  'assets/project-3.jpg',
  'assets/project-4.jpg',
  'assets/covers/klever.jpg',
  'assets/covers/surfcash.jpg',
  'assets/covers/echo-verse.jpg',
  'assets/klever/chrome-k.jpg',
  'assets/klever/final-bg.jpg',
  'assets/klever/home-screen.jpg',
  'assets/klever/imac-screen.jpg',
  'assets/klever/features-screen.jpg',
  'assets/klever/sketch-1.jpg',
  'assets/klever/sketch-2.jpg',
  'assets/klever/social-phone.jpg',
  'assets/klever/token-utilities.jpg',
  'assets/klever/hero-banner.jpg',
  'assets/hero/reel-1.png',
];

// Each card lives at a point (x, y) on a plane and a depth z, and is drawn in
// perspective: the further away, the closer to the middle and the smaller.
// Depth counts down at a steady rate, so a card drifts out of the centre,
// speeds up and grows as it nears, and leaves past the edge of the screen;
// then it goes back to the far end with a new spot and the next image.
(function heroFly() {
  const layer = document.getElementById('wheroFly');
  if (!layer) return;

  const COUNT = 42;
  const FAR = 4.5;        // depth a card starts at
  const NEAR = 0.45;      // depth it's dropped at
  const SPEED = 0.48;     // depth units per second (~8.5s from far to near)
  const SIZE = 0.055;     // card width at depth 1, as a share of the hero's longer side
  const FADE_IN = 1.8;    // depth over which a new card fades in
  const FADE_OUT = 0.35;  // ...and a passing one fades out before it's dropped

  let w = 0, h = 0;
  let next = 0;
  const cards = [];

  const measure = () => { w = layer.clientWidth; h = layer.clientHeight; };

  // a spot spread evenly over the screen's shape (x and y are shares of
  // its half-width and half-height at depth 1), reaching well past the edges
  // so perspective doesn't bunch the field into the middle, and kept out of
  // a box round the centre where the heading sits
  function place(card, z) {
    let x, y;
    do {
      x = (Math.random() * 2 - 1) * 2.6;
      y = (Math.random() * 2 - 1) * 2.1;
    } while (Math.abs(x) < 0.42 && Math.abs(y) < 0.5);
    card.x = x;
    card.y = y;
    card.z = z;
    card.img.src = FLY_IMAGES[next++ % FLY_IMAGES.length];
  }

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'whero__card';
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    // size the card to the image once it has loaded; ~4:3 until then
    img.addEventListener('load', () => {
      card.ratio = img.naturalHeight / img.naturalWidth || 0.75;
    });
    el.appendChild(img);
    layer.appendChild(el);
    const card = { el, img, ratio: 0.75, x: 0, y: 0, z: FAR };
    // spread the first batch through the whole depth so the field starts full
    place(card, NEAR + (FAR - NEAR) * ((i + 0.5) / COUNT));
    cards.push(card);
  }

  // cards are laid out at their nearest size and only ever scaled down, so
  // the stills stay sharp
  function draw() {
    // cards are sized off the longer side, so a phone held upright doesn't
    // get tiny ones
    const unit = Math.max(w, h);
    const maxW = (SIZE * unit) / NEAR;
    cards.forEach((c) => {
      const s = NEAR / c.z;
      const cw = maxW;
      const ch = maxW * Math.min(1.5, Math.max(0.55, c.ratio));
      const sx = w / 2 + (c.x * w / 2) / c.z;
      const sy = h / 2 + (c.y * h / 2) / c.z;
      const fadeIn = Math.min(1, (FAR - c.z) / FADE_IN);
      const fadeOut = Math.min(1, (c.z - NEAR) / FADE_OUT);
      // size only changes on resize or a new image, so skip the layout otherwise
      const size = `${cw}x${ch}`;
      if (c.size !== size) {
        c.size = size;
        c.el.style.width = `${cw}px`;
        c.el.style.height = `${ch}px`;
      }
      c.el.style.transform = `translate3d(${sx - cw / 2}px, ${sy - ch / 2}px, 0) scale(${s})`;
      c.el.style.opacity = Math.max(0, Math.min(fadeIn, fadeOut));
      c.el.style.zIndex = Math.round((FAR - c.z) * 100);
    });
  }

  measure();
  addEventListener('resize', () => { measure(); draw(); });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    draw();
    return;
  }

  let last = 0;
  let raf = 0;
  const tick = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    cards.forEach((c) => {
      c.z -= SPEED * dt;
      if (c.z <= NEAR) place(c, FAR);
    });
    draw();
    raf = requestAnimationFrame(tick);
  };
  const play = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  // only run while the hero is on screen and the tab is visible
  let onScreen = true;
  const sync = () => (onScreen && !document.hidden ? play() : stop());
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(layer);
  document.addEventListener('visibilitychange', sync);
  sync();
})();
// ---------- Project showcase ----------
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// every project's stills in one run: its cover, its detail shots, its card
const shotsOf = (p) => [...new Set([p.cover, ...(p.shots || []), p.image].filter(Boolean))];
const SHOTS = PROJECTS.flatMap((p, pi) => shotsOf(p).map((src, n) => ({ src, pi, first: n === 0 })));

const wshowStrip = document.getElementById('wshowStrip');
const wshowInfo = document.getElementById('wshowInfo');
const wshowPreview = document.getElementById('wshowPreview');

wshowStrip.innerHTML = SHOTS.map((s, i) => {
  const p = PROJECTS[s.pi];
  return `<button type="button" class="wshow__thumb${s.first ? ' is-first' : ''}" data-i="${i}"${s.first ? ` id="project-${p.code.toLowerCase()}"` : ''} aria-label="${p.name}">
    <img src="${s.src}" alt="" loading="lazy">
  </button>`;
}).join('');
const thumbs = [...wshowStrip.children];

let activeShot = -1;
let activeProject = -1;

function showProject(pi) {
  const p = PROJECTS[pi];
  document.getElementById('wshowDesc').textContent = p.desc;
  document.getElementById('wshowName').textContent = p.name;
  document.getElementById('wshowYear').textContent = p.year;
  // a project without a case study yet gets a note in place of the link
  const old = document.getElementById('wshowVisit');
  const visit = document.createElement(p.href ? 'a' : 'span');
  visit.id = 'wshowVisit';
  visit.className = 'wshow__visit';
  if (p.href) { visit.href = p.href; visit.textContent = 'Visit →'; } else visit.textContent = 'Coming soon';
  old.replaceWith(visit);
  // restart the step-in
  wshowInfo.classList.remove('is-swap');
  void wshowInfo.offsetWidth;
  wshowInfo.classList.add('is-swap');
}

function setActive(i) {
  if (i === activeShot) return;
  if (thumbs[activeShot]) thumbs[activeShot].classList.remove('is-active');
  activeShot = i;
  thumbs[i].classList.add('is-active');
  wshowPreview.src = SHOTS[i].src;
  wshowPreview.alt = PROJECTS[SHOTS[i].pi].name;
  if (SHOTS[i].pi !== activeProject) {
    activeProject = SHOTS[i].pi;
    showProject(activeProject);
  }
}

// the still nearest the reading line, 55% down the screen, is the open one
const readingLine = () => innerHeight * 0.55;
function updateShowcase() {
  const line = readingLine();
  let best = 0;
  let bestD = Infinity;
  thumbs.forEach((t, i) => {
    const r = t.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - line);
    if (d < bestD) { bestD = d; best = i; }
  });
  setActive(best);
}

let showFrame = 0;
const queueShowcase = () => {
  if (!showFrame) showFrame = requestAnimationFrame(() => { showFrame = 0; updateShowcase(); });
};
addEventListener('scroll', queueShowcase, { passive: true });
addEventListener('resize', queueShowcase);
// stills change height as they load, which moves the ones below them
thumbs.forEach((t) => t.querySelector('img').addEventListener('load', queueShowcase, { once: true }));
updateShowcase();

// scroll so a still's centre sits on the reading line
const shotScrollY = (i) => {
  const r = thumbs[i].getBoundingClientRect();
  return r.top + r.height / 2 + scrollY - readingLine();
};
wshowStrip.addEventListener('click', (e) => {
  const t = e.target.closest('.wshow__thumb');
  if (t) glideTo(shotScrollY(Number(t.dataset.i)));
});

// ---------- Hero jump list ----------
// One entry per project; a click glides the strip to that project's first still.
const wheroList = document.getElementById('wheroList');
wheroList.innerHTML = PROJECTS.map((p, i) => `
  <li><a href="#project-${p.code.toLowerCase()}" data-index="${i}">
    <span>${p.name}</span><span>[${i + 1}]</span>
  </a></li>
`).join('');

wheroList.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  const pi = Number(link.dataset.index);
  glideTo(shotScrollY(SHOTS.findIndex((s) => s.pi === pi)));
});

// Our own tween rather than smooth scrollTo, so the glide has the same ease
// and pace with or without Lenis.
function glideTo(target) {
  const from = scrollY;
  const dist = target - from;
  const duration = Math.min(1400, 500 + Math.abs(dist) * 0.35);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const y = from + dist * easeInOut(t);
    if (typeof lenis !== 'undefined' && lenis) lenis.scrollTo(y, { immediate: true });
    else scrollTo(0, y);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
