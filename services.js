// ---------- Home: Our Service ----------
// One pinned stage (.svc-stage → sticky .svc). Scrolling through it walks a
// service position from 0 to N-1, and the services are the walls of a square
// room seen from its middle:
//   · the open service's card is the back wall; the next one hangs on the wall
//     to the right, the one before on the wall to the left, and each step of
//     scroll turns the view a quarter round. So the next card swings in from
//     the right, its near edge large and the whole card skewed by the angle,
//     and squares up as it reaches the middle
//   · two straight red lines join each card to the next (top corner to top
//     corner, bottom to bottom): the edges of the ceiling and the floor. With
//     the next card round the corner they run off toward the screen's corners,
//     which is the room in the Figma frame; halfway round they lie level
//   · it slides up over the Core as a new screen; the edges stay dark until it
//     lands (they run to the screen's corners, which its top edge would cut
//     short), then flicker on, and the first service's keywords with them.
//     Whatever glide carried the page in stops there, and the first service
//     holds for a little scroll (the lead) before the room turns, so it can be
//     read
//   · a tick per service along the foot of the screen keeps count
//   · the open service's keywords hang on its wall, three either side of the
//     card (above and below it on a phone), the two sides mirroring each
//     other in the same places for every service; they turn with the wall and
//     flicker on and off as the open service changes
// Cards and keywords are turned with CSS (a perspective about the eye); the
// lines go through the same projection here.
// After the last service the stage holds one more screen while Process slides
// up over it; the room darkens underneath.
// It snaps from one stop to the next (each service, then Process all the way
// up): the moment the wheel lets go, a push 15% of the way on commits
// to the next stop in that direction, anything less falls back. Through Lenis
// on the wheel, through CSS scroll-snap on touch.
(function ourService() {
  const stage = document.getElementById('svcStage');
  if (!stage) return;
  const section = stage.querySelector('.svc');
  const room = stage.querySelector('.svc__room');
  const items = [...stage.querySelectorAll('.svc-item')];
  const N = items.length;
  if (!N) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const SVG = 'http://www.w3.org/2000/svg';
  // script.js's Lenis (a top-level let, so not on window)
  const smoothScroll = typeof lenis !== 'undefined' ? lenis : null;
  const TURN = Math.PI / 2;   // the view turns a quarter round per service
  // how far the eye stands from the back wall, in card widths. 1.345 puts the
  // ceiling edges at the Figma frame's slope (~0.343 off the level). A phone
  // stands closer: from that far back the cards would swing clean off its
  // narrow screen halfway round, leaving only the empty corner
  const DEPTH = 1.345;
  const DEPTH_NARROW = 0.8;
  const NEAR = 0.04;          // anything closer to the eye than this (× the depth) is hidden
  const WHEEL_IDLE = 90;      // ms after the last wheel tick before snapping
  const SETTLE_DELAY = 140;   // ms of stillness before settling (keys, scrollbar)
  const SETTLE_TIME = 0.6;    // s the snap glide takes
  const PUSH = 0.15;          // share of the way to the next stop that commits to it
  const HOLD = 450;           // ms the first service holds after landing, at the least
  const GESTURE_GAP = 180;    // ms without a wheel tick that ends a gesture (trackpads coast)
  const HYSTERESIS = 0.55;    // how far past halfway before the open service changes

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  // the left wall's slots (the ceiling on a phone), top to bottom; the right
  // wall's (the floor) mirror them
  const SIDES = [['1', '2', '5'], ['3', '4', '6']];

  stage.style.setProperty('--n', N);

  const services = items.map((item, i) => {
    const card = item.querySelector('.svc-card');
    const kws = [...item.querySelectorAll('.svc-kw')].map((el) => ({
      el,
      wall: i,
      state: '',   // '', 'in', 'lit', 'out'
      side: SIDES[0].includes(el.dataset.slot) ? 0 : 1,
      row: SIDES.flat().indexOf(el.dataset.slot) % 3,   // 0 top, 1 middle, 2 bottom
      left: 0, right: 0, cx: 0, cy: 0,  // its resting box on the wall
      shown: null,
    }));
    return { card, kws, shown: null };
  });
  const heading = section.querySelector('.svc__heading');
  const ticks = items.map(() => {
    const t = document.createElement('li');
    section.querySelector('.svc__ticks').appendChild(t);
    return t;
  });
  // where we are: the ticks follow the open service
  const showOpen = (i) => {
    ticks.forEach((t, n) => t.classList.toggle('is-on', n === i));
  };
  showOpen(0);
  // the ceiling and floor edges: a pair for every join between two walls,
  // counting the bare walls before the first card and after the last
  const joins = [];
  for (let j = -1; j < N; j++) {
    const pair = [0, 1].map(() => {
      const l = document.createElementNS(SVG, 'line');
      room.appendChild(l);
      return l;
    });
    joins.push({ j, pair });
  }

  // one snap marker per service, for the touch scroll-snap
  if (touch || !smoothScroll) {
    for (let i = 0; i < N; i++) {
      const m = document.createElement('div');
      m.className = 'svc__snap';
      m.style.setProperty('--i', i);
      m.setAttribute('aria-hidden', 'true');
      stage.appendChild(m);
    }
    const end = document.createElement('div');
    end.className = 'svc__snap svc__snap--end';
    end.setAttribute('aria-hidden', 'true');
    stage.appendChild(end);
    document.documentElement.classList.add('svc-snap-native');
  }

  // ---- sizes -----------------------------------------------------------
  let W = 0, H = 0, step = 1, lead = 0;
  let ex = 0, ey = 0, depth = 1;   // the eye, straight in front of the card's centre
  let card = { left: 0, top: 0, right: 0, bottom: 0 };

  const readSizes = () => {
    W = section.clientWidth;
    H = section.clientHeight;
    const vh = (name, or) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) / 100 * window.innerHeight || or;
    step = vh('--step', H * 0.9);
    lead = vh('--lead', 0);
    const c = services[0].card;
    card = { left: c.offsetLeft, top: c.offsetTop, right: c.offsetLeft + c.offsetWidth, bottom: c.offsetTop + c.offsetHeight };
    ex = (card.left + card.right) / 2;
    ey = (card.top + card.bottom) / 2;
    depth = (W < 900 ? DEPTH_NARROW : DEPTH) * c.offsetWidth;
    room.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // every piece turns about the eye, wherever it sits on its wall
    services.forEach((s) => {
      s.card.style.transformOrigin = `${ex - card.left}px ${ey - card.top}px`;
      arrange(s);
    });
  };

  // ---- keyword places ----------------------------------------------------
  // The two sides mirror each other across the card, the same for every
  // service (the Figma frame, as shares of the card): three rows at 25%, 48%
  // and 71% down it, the top and bottom keyword close in beside it and the
  // middle one further out. On a phone the same figure is turned on its side:
  // above the card a keyword at each side close in and the middle one further
  // up, and the floor below mirrors it.
  const ROWS = [0.248, 0.4825, 0.712];   // keyword tops, as shares of the card's height
  const GAP_NEAR = 0.22, GAP_FAR = 0.417;        // gap to the card, as shares of its width
  const arrange = (s) => {
    const cw = card.right - card.left, ch = card.bottom - card.top;
    s.kws.forEach((k) => {
      const el = k.el;
      const w = el.offsetWidth, h = el.offsetHeight;
      const out = k.row === 1;   // the middle keyword stands further out
      let x, y;
      if (W < 900) {
        const gap = H * 0.018, rise = h + H * 0.02;
        x = k.row === 0 ? W * 0.25 - w / 2 : k.row === 1 ? W / 2 - w / 2 : W * 0.75 - w / 2;
        y = k.side === 0
          ? card.top - gap - h - (out ? rise : 0)
          : card.bottom + gap + (out ? rise : 0);
      } else {
        const gap = (out ? GAP_FAR : GAP_NEAR) * cw;
        x = k.side === 0 ? card.left - gap - w : card.right + gap;
        y = card.top + ROWS[k.row] * ch;
      }
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      k.left = x;
      k.right = x + w;
      k.cx = x + w / 2;
      k.cy = y + h / 2;
      el.style.transformOrigin = `${ex - x}px ${ey - y}px`;
    });
  };

  // ---- scroll position -------------------------------------------------
  let pos = 0;   // 0 … N-1
  let open = 0;
  let inView = false;
  let lit = false;     // the first service lights up once the room has landed
  let landed = null;   // pinned at the top of the screen, edges on
  let cover = -1;

  const measure = () => {
    const r = stage.getBoundingClientRect();
    pos = Math.min(N - 1, Math.max(0, (-r.top - lead) / step));
    inView = r.top < window.innerHeight && r.bottom > 0;
    // the edges switch on once the section has landed, off while it is still
    // sliding in (or back out, scrolling up)
    const down = r.top <= 0.5;
    if (down !== landed) {
      if (down && landed === false) catchLanding();
      landed = down;
      room.classList.toggle('is-on', down);
    }
    // how far Process has slid up over the room, over the stage's tail
    const k = Math.round(100 * Math.min(1, Math.max(0, (-r.top - lead - (N - 1) * step) / window.innerHeight))) / 100;
    if (k !== cover) {
      cover = k;
      section.style.setProperty('--svc-cover', k);
    }
    if (!lit && down && r.bottom > window.innerHeight * 0.5) {
      lit = true;
      open = Math.round(pos);
      showOpen(open);
      lightUp(open);
    }
  };

  // ---- the room --------------------------------------------------------
  // A point (x, y) on wall i, given in the section's pixels as it sits while
  // that wall is open, seen from the eye: [across, down, ahead].
  const angle = (i) => (i - pos) * TURN;
  const toEye = (x, y, a) => {
    const X = x - ex, c = Math.cos(a), s = Math.sin(a);
    return [X * c + depth * s, y - ey, -X * s + depth * c];
  };
  const toScreen = (p) => [ex + (depth * p[0]) / p[2], ey + (depth * p[1]) / p[2]];
  // how far ahead of the eye a span [x0, x1] of a wall reaches, at its nearest
  const nearest = (x0, x1, a) => Math.min(toEye(x0, 0, a)[2], toEye(x1, 0, a)[2]);
  // the same turn in CSS: about the eye, seen from it (rotateY runs the other way)
  const turn = (a) => (a === 0 ? '' :
    `perspective(${depth.toFixed(1)}px) translateZ(${depth.toFixed(1)}px) rotateY(${(-a * 180 / Math.PI).toFixed(3)}deg) translateZ(${(-depth).toFixed(1)}px)`);
  // a 3D segment cut where it passes behind the eye
  const clip = (p, q, near) => {
    if (p[2] < near && q[2] < near) return null;
    const cut = (a, b) => {
      const t = (near - a[2]) / (b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
    };
    if (p[2] < near) p = cut(p, q);
    else if (q[2] < near) q = cut(q, p);
    return [p, q];
  };

  const show = (o, el, on) => {
    if (o.shown === on) return;
    o.shown = on;
    el.style.visibility = on ? '' : 'hidden';
  };

  const place = () => {
    const near = NEAR * depth;
    for (let i = 0; i < N; i++) {
      const s = services[i];
      const a = angle(i);
      const facing = Math.abs(i - pos) < 1;
      const cardOn = facing && nearest(card.left, card.right, a) > near;
      show(s, s.card, cardOn);
      if (cardOn) s.card.style.transform = turn(a);
      s.kws.forEach((k) => {
        const on = facing && nearest(k.left, k.right, a) > near;
        show(k, k.el, on);
        if (on) k.el.style.transform = turn(a);
      });
    }
    // the edges: wall j's right corners to wall j+1's left corners
    joins.forEach((jn) => {
      const a0 = angle(jn.j), a1 = angle(jn.j + 1);
      [card.top, card.bottom].forEach((y, n) => {
        const l = jn.pair[n];
        const seg = clip(toEye(card.right, y, a0), toEye(card.left, y, a1), near);
        if (!seg) { l.style.display = 'none'; return; }
        const p = toScreen(seg[0]), q = toScreen(seg[1]);
        l.style.display = '';
        l.setAttribute('x1', p[0].toFixed(1)); l.setAttribute('y1', p[1].toFixed(1));
        l.setAttribute('x2', q[0].toFixed(1)); l.setAttribute('y2', q[1].toFixed(1));
      });
    });
  };

  // ---- keyword flicker -------------------------------------------------
  const setKw = (k, state, delay) => {
    k.state = state;
    const el = k.el;
    el.classList.remove('is-in', 'is-lit', 'is-out', 'is-glitch');
    if (state === 'in' || state === 'out') {
      el.style.setProperty('--d', `${delay.toFixed(2)}s`);
      void el.offsetWidth; // restart the animation
      el.classList.add(state === 'in' ? 'is-in' : 'is-out');
    } else if (state === 'lit') {
      el.classList.add('is-lit');
    }
  };
  services.forEach((s) => s.kws.forEach((k) => {
    k.el.addEventListener('animationend', (e) => {
      if (e.target !== k.el) return;
      if (k.state === 'in') setKw(k, 'lit');
      else if (k.state === 'out') setKw(k, '');
      else if (k.state === 'lit') k.el.classList.remove('is-glitch');
    });
  }));
  // a shuffled stagger, so the six never come or go in reading order
  const stagger = (kws, spread) => {
    const order = kws.map((_, i) => i).sort(() => Math.random() - 0.5);
    return order.map((_, n) => order.indexOf(n) * spread + rand(0, spread * 0.6));
  };
  const lightUp = (i) => {
    const kws = services[i].kws;
    const delays = stagger(kws, 0.09);
    kws.forEach((k, n) => setKw(k, reduce ? 'lit' : 'in', delays[n]));
  };
  const lightDown = (i) => {
    const kws = services[i].kws;
    const delays = stagger(kws, 0.04);
    kws.forEach((k, n) => {
      if (k.state === '' || k.state === 'out') return;
      setKw(k, reduce ? '' : 'out', delays[n]);
    });
  };
  const updateOpen = () => {
    if (!lit) return;
    if (Math.abs(pos - open) <= HYSTERESIS) return;
    const next = Math.round(pos);
    if (next === open) return;
    lightDown(open);
    open = next;
    showOpen(open);
    lightUp(open);
  };

  // now and then one lit keyword drops out for a blink
  let nextGlitch = 0;
  const glitch = (now) => {
    if (reduce || now < nextGlitch) return;
    nextGlitch = now + rand(2000, 4000);
    const on = services[open].kws.filter((k) => k.state === 'lit');
    if (!on.length) return;
    const el = pick(on).el;
    el.classList.remove('is-glitch');
    void el.offsetWidth;
    el.classList.add('is-glitch');
  };

  // ---- snap --------------------------------------------------------------
  // The stops: each service, then Process all the way up. As soon as the
  // wheel lets go (not when Lenis's glide finally dies away, a second later)
  // the page heads for a stop: judged on where the glide would land, a push
  // of PUSH of the way past the stop it last rested on carries on to the next
  // one in that direction, anything less falls back. Anything else that
  // scrolls (keys, the scrollbar) settles once the page is still. A snap
  // scrolls too, which keeps pushing the timers back, so it never re-triggers
  // itself.
  let anchor = 0;   // the stop the page last rested on
  let snapping = 0; // until when a snap is under way (its own scrolling mustn't re-judge it)
  let wheelTimer = 0;
  let settleTimer = 0;
  const stops = () => {
    const pts = [0];
    for (let i = 1; i < N; i++) pts.push(lead + i * step);
    pts.push(lead + (N - 1) * step + window.innerHeight);
    return pts;
  };
  const stageY = () => window.scrollY + stage.getBoundingClientRect().top;
  const settle = () => {
    if (!smoothScroll || performance.now() < snapping) return;
    const top = stageY();
    const pts = stops();
    const end = pts[pts.length - 1];
    const now = window.scrollY - top;
    const aim = (smoothScroll.targetScroll ?? window.scrollY) - top;
    if (aim <= 1) { anchor = 0; return; }
    if (aim >= end - 1) { anchor = pts.length - 1; return; }
    let i = 0;
    while (i < pts.length - 2 && aim >= pts[i + 1]) i++;
    const f = (aim - pts[i]) / (pts[i + 1] - pts[i]);
    const t = aim > pts[anchor]
      ? (f > PUSH ? i + 1 : i)
      : (f < 1 - PUSH ? i : i + 1);
    anchor = t;
    if (Math.abs(pts[t] - now) < 2 && Math.abs(pts[t] - aim) < 2) return;
    snapping = performance.now() + SETTLE_TIME * 1000 + 100;
    smoothScroll.scrollTo(top + pts[t], {
      duration: SETTLE_TIME,
      easing: (x) => 1 - Math.pow(1 - x, 3),
      onComplete: () => { snapping = 0; },
    });
  };
  // Landing: the glide that slid the section in would carry straight on into
  // the second service. So it stops where the section lands, the wheel is shut
  // off, and it only comes back once the first service has held for HOLD and
  // the gesture that brought the page here has ended (a trackpad coasts on for
  // a while after the fingers lift), so moving on takes a fresh scroll.
  let holding = false;
  let lastWheel = 0;
  const catchLanding = () => {
    if (!smoothScroll || touch || holding || performance.now() < snapping) return;
    const top = stageY();
    if ((smoothScroll.targetScroll ?? window.scrollY) - top <= 2) return; // it was stopping here anyway
    holding = true;
    anchor = 0;
    clearTimeout(wheelTimer);
    clearTimeout(settleTimer);
    smoothScroll.stop();
    smoothScroll.scrollTo(top, {
      duration: 0.35,
      force: true,
      easing: (x) => 1 - Math.pow(1 - x, 3),
    });
    const from = performance.now();
    const release = () => {
      const now = performance.now();
      if (now - from < HOLD || now - lastWheel < GESTURE_GAP) { setTimeout(release, 60); return; }
      holding = false;
      smoothScroll.start();
    };
    setTimeout(release, HOLD);
  };

  if (!touch && smoothScroll) {
    window.addEventListener('wheel', () => {
      lastWheel = performance.now();
      if (holding) return;
      snapping = 0; // the wheel takes over from a snap under way
      clearTimeout(wheelTimer);
      if (inView) wheelTimer = setTimeout(settle, WHEEL_IDLE);
    }, { passive: true });
    smoothScroll.on('scroll', () => {
      // outside the stops the page is free; remember which end it left by
      const s = window.scrollY - stageY();
      const pts = stops();
      if (s <= 0) anchor = 0;
      else if (s >= pts[pts.length - 1]) anchor = pts.length - 1;
      clearTimeout(settleTimer);
      if (inView && !holding) settleTimer = setTimeout(settle, SETTLE_DELAY);
    });
  }

  // ---- the footer's services ---------------------------------------------
  // Each one takes you to its stop, as a snap would.
  const go = (i) => {
    const y = stageY() + stops()[i];
    anchor = i;
    if (smoothScroll) {
      snapping = performance.now() + 2200;
      smoothScroll.scrollTo(y, { duration: 1.6, onComplete: () => { snapping = 0; } });
    } else {
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  };
  document.querySelectorAll('.sfooter__services li').forEach((li, i) => {
    if (i >= N) return;
    li.classList.add('is-link');
    li.setAttribute('role', 'link');
    li.tabIndex = 0;
    li.addEventListener('click', () => go(i));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i); }
    });
  });

  // ---- loop --------------------------------------------------------------
  let running = false;
  const frame = (now) => {
    if (!running) return;
    measure();
    place();
    updateOpen();
    glitch(now);
    requestAnimationFrame(frame);
  };
  const start = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  };
  const stop = () => { running = false; };

  const onResize = () => { readSizes(); measure(); place(); };
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? start() : stop()));
  }, { rootMargin: '10% 0px' }).observe(stage);

  section.classList.add('is-ready');
  readSizes();
  measure();
  place();
})();
