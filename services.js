// ---------- Home: Our Service ----------
// One pinned stage (.svc-stage → sticky .svc). Scrolling through it walks a
// service position from 0 to N-1, and the services are the walls of a square
// room seen from its middle:
//   · the open service's card is the back wall; the next one hangs on the wall
//     to the right, the one before on the wall to the left, and each step of
//     scroll turns the view a quarter round. So the next card swings in from
//     the right, its near edge large and the whole card skewed by the angle,
//     and squares up as it reaches the middle
//   · a line joins each card to the next (top corner to top corner, bottom
//     to bottom): the edges of the ceiling and the floor. With the next card
//     round the corner they sweep off to the screen's corners in a soft
//     curve, leaving the card almost level and steepening as they go, the
//     way the room's edges run in the Figma frame; as the next card comes
//     into view they straighten, and halfway round they lie level between
//     the two cards
//   · it slides up over the Core as a bare dark screen.
//     Whatever glide carried the page in stops there; the next scroll (the
//     intro) brings the first card up from the foot of the screen, and once it
//     is in place the edges flicker on, and its keywords with them
//   · a tick per service along the foot of the screen keeps count
//   · the room is seen through a lens that bends it toward the screen's
//     corners (a fisheye, as on a curved screen): the edges and the keywords
//     are drawn bent, the middle — the card and a margin round it — is left
//     untouched and sharp
//   · on a mouse, hovering the open card while the room is at rest turns it
//     into a slab of brushed gunmetal that leans toward the cursor on a
//     spring, with a light that follows it: drawn with WebGL over the card
//     (svc-metal.js), or, without WebGL, faked in CSS on the card itself
//   · the open service's keywords hang on its wall, three either side of the
//     card (above and below it on a phone), the two sides mirroring each
//     other in the same places for every service. Echoes of the same six words
//     keep popping up at random around them, filling the two sides, and every
//     one of them twitches at random; all of it turns with the wall and
//     flickers on and off as the open service changes
// Cards and keywords are turned with CSS (a perspective about the eye); the
// lines go through the same projection here.
// After the last service the stage holds one more screen while Process slides
// up over it; the room darkens underneath.
// It snaps from one stop to the next (the bare screen, each service, then
// Process all the way up), one stop per scroll: the moment the wheel lets go,
// a push 15% of the way on commits to the next stop in that direction,
// anything less falls back. Through Lenis on the wheel, through CSS
// scroll-snap on touch.
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
  const HOLD = 450;           // ms the bare screen holds after landing, at the least
  const GESTURE_GAP = 180;    // ms without a wheel tick that ends a gesture (trackpads coast)
  const HYSTERESIS = 0.55;    // how far past halfway before the open service changes
  const AT_REST = 0.003;      // how close to its stop the room must be for the metal (0.27°)
  const TILT = 10;            // deg the hovered card leans toward the cursor, at most
  const TILT_PERSP = 1400;    // px, the perspective it leans under (svc-metal.js's and the CSS's)
  const SPRING = 0.085;       // how hard the slab is pulled toward its lean, per frame
  const DAMP = 0.8;           // how much of its swing it keeps, per frame (some overshoot)
  const SLABS = 10;           // slices behind a hovered card, 2px apart: its thickness
  const LENS = 0.07;          // how far the lens pulls in at the very corners, as a share of the distance from the middle
  const ECHOES = 8;           // echoes per side (none on a phone)

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  // the left wall's slots (the ceiling on a phone), top to bottom; the right
  // wall's (the floor) mirror them
  const SIDES = [['1', '2', '5'], ['3', '4', '6']];

  stage.style.setProperty('--n', N);

  const kwOf = (el, i, extra) => ({
    el, wall: i,
    state: '',   // '', 'in', 'lit', 'out'
    left: 0, right: 0, top: 0, bottom: 0, cx: 0, cy: 0,  // its resting box on the wall
    shown: null,
    ...extra,
  });
  const services = items.map((item, i) => {
    const card = item.querySelector('.svc-card');
    const body = card.querySelector('.svc-card__body');
    const list = item.querySelector('.svc-kws');
    const kws = [...list.querySelectorAll('.svc-kw')].map((el) => kwOf(el, i, {
      side: SIDES[0].includes(el.dataset.slot) ? 0 : 1,
      row: SIDES.flat().indexOf(el.dataset.slot) % 3,   // 0 top, 1 middle, 2 bottom
    }));
    const words = kws.map((k) => k.el.textContent.trim());
    // the echoes: copies of the six words, recycled as they pop in and out
    const echoes = reduce ? [] : [0, 1].flatMap((side) => Array.from({ length: ECHOES }, () => {
      const el = document.createElement('li');
      el.className = 'svc-kw svc-kw--echo';
      el.setAttribute('aria-hidden', 'true');
      list.appendChild(el);
      return kwOf(el, i, { side, echo: true, dieAt: 0, nextAt: 0 });
    }));
    return { card, body, kws, echoes, all: kws.concat(echoes), words, sizes: {}, shown: null };
  });
  const tickList = section.querySelector('.svc__ticks');
  const ticks = items.map(() => {
    const t = document.createElement('li');
    tickList.appendChild(t);
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
      const l = document.createElementNS(SVG, 'path');
      room.appendChild(l);
      return l;
    });
    joins.push({ j, pair });
  }

  // the snap markers, for the touch scroll-snap: the bare screen, each
  // service, Process all the way up
  if (touch || !smoothScroll) {
    const mark = (cls, i) => {
      const m = document.createElement('div');
      m.className = cls;
      if (i != null) m.style.setProperty('--i', i);
      m.setAttribute('aria-hidden', 'true');
      stage.appendChild(m);
    };
    mark('svc__snap svc__snap--start');
    for (let i = 0; i < N; i++) mark('svc__snap', i);
    mark('svc__snap svc__snap--end');
    document.documentElement.classList.add('svc-snap-native');
  }

  // ---- sizes -----------------------------------------------------------
  let W = 0, H = 0, step = 1, intro = 1;
  let dirty = true;               // the room needs drawing again even if the scroll hasn't moved
  let ex = 0, ey = 0, depth = 1;   // the eye, straight in front of the card's centre
  let card = { left: 0, top: 0, right: 0, bottom: 0 };

  const readSizes = () => {
    W = section.clientWidth;
    H = section.clientHeight;
    const vh = (name, or) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) / 100 * window.innerHeight || or;
    step = vh('--step', H * 0.9);
    intro = vh('--intro', H * 0.7);
    const c = services[0].card;
    card = { left: c.offsetLeft, top: c.offsetTop, right: c.offsetLeft + c.offsetWidth, bottom: c.offsetTop + c.offsetHeight };
    ex = (card.left + card.right) / 2;
    ey = (card.top + card.bottom) / 2;
    depth = (W < 900 ? DEPTH_NARROW : DEPTH) * c.offsetWidth;
    room.setAttribute('viewBox', `0 0 ${W} ${H}`);
    lens();
    dirty = true;
    if (metalGL) { metalGL.resize(W, H); glOff(true); }
    // every piece turns about the eye, wherever it sits on its wall
    services.forEach((s) => {
      s.card.style.transformOrigin = `${ex - card.left}px ${ey - card.top}px`;
      arrange(s);
      // the old scatter no longer fits: let the echoes start afresh
      s.echoes.forEach((e) => { if (e.state !== '') setKw(e, ''); e.nextAt = 0; });
      // each word's size as an echo, measured once here rather than as it pops up
      if (s.echoes.length) {
        const probe = s.echoes[0].el;
        s.words.forEach((w) => {
          probe.textContent = w;
          s.sizes[w] = [probe.offsetWidth, probe.offsetHeight];
        });
        probe.textContent = '';
      }
    });
  };


  // ---- the lens ----------------------------------------------------------
  // A fisheye, as the reference's `c * (1 + k r²)`, worked out rather than
  // filtered (a filter over the whole room re-ran on every flicker): each
  // point is drawn pulled in toward the eye by LENS × t², where t climbs from
  // nothing just outside the card's farthest corner to 1 at the screen's
  // corners (r is the distance from the eye, 1 at a corner). So straight
  // edges bow, the corners draw in, and the card and everything near it are
  // untouched. The edges are bent point by point; a keyword, being small, is
  // moved and shrunk as its middle would be, by a scale about the eye in
  // front of its own turn.
  let lensFrom = 1;
  const lens = () => {
    const R = (x, y) => Math.hypot((x - ex) / (W / 2), (y - ey) / (H / 2)) / Math.SQRT2;
    lensFrom = Math.min(0.9, Math.max(R(card.left, card.top), R(card.right, card.bottom)) + 0.05);
  };
  // how much the lens keeps of a point's distance from the eye (1: all of it)
  const lensK = (x, y) => {
    const r = Math.hypot((x - ex) / (W / 2), (y - ey) / (H / 2)) / Math.SQRT2;
    const t = Math.min(1.6, (r - lensFrom) / (1 - lensFrom));
    return t > 0 ? 1 - LENS * t * t : 1;
  };
  // a point as the lens shows it; b fades the bend (0 none, 1 all of it)
  const warp = (x, y, b) => {
    const f = 1 - (1 - lensK(x, y)) * b;
    return [ex + (x - ex) * f, ey + (y - ey) * f];
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
  const put = (k, x, y, ww, hh) => {
    const el = k.el;
    const w = ww ?? el.offsetWidth, h = hh ?? el.offsetHeight;
    el.style.left = `${x.toFixed(1)}px`;
    el.style.top = `${y.toFixed(1)}px`;
    k.left = x; k.right = x + w;
    k.top = y; k.bottom = y + h;
    k.cx = x + w / 2; k.cy = y + h / 2;
    el.style.transformOrigin = `${ex - x}px ${ey - y}px`;
  };
  const arrange = (s) => {
    const cw = card.right - card.left, ch = card.bottom - card.top;
    s.kws.forEach((k) => {
      const w = k.el.offsetWidth, h = k.el.offsetHeight;
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
      put(k, x, y);
    });
  };

  // ---- echoes ------------------------------------------------------------
  // Copies of the open service's six words pop up at random on its walls,
  // live a moment and flicker out, and come back somewhere else. They keep to
  // the side frames — between the screen's edge (or the room's corner) and
  // the card, as tall as the card — and never land on one another or on the
  // six. A phone has none: its ceiling and floor only hold the six.
  const frame = (side) => {
    if (W < 900) {
      // clear of the fixed nav
      const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64) + 12;
      return side === 0
        ? { x0: W * 0.03, x1: W * 0.97, y0: top, y1: card.top - 8 }
        : { x0: W * 0.03, x1: W * 0.97, y0: card.bottom + 8, y1: H - 56 }; // clear of the ticks
    }
    const pad = W * 0.012;
    return side === 0
      ? { x0: Math.max(W * 0.02, ex - depth * 0.97), x1: card.left - pad, y0: card.top, y1: card.bottom }
      : { x0: card.right + pad, x1: Math.min(W * 0.98, ex + depth * 0.97), y0: card.top, y1: card.bottom };
  };
  // the room every keyword keeps around it: on a desktop a good breath, in
  // keyword heights (so it scales with the type), on a phone just a sliver
  const gaps = (h) => (W < 900 ? [6, 6] : [h * 1.6, h * 1.1]);
  const clear = (s, me, x0, y0, x1, y1, gx, gy) => s.all.every((k) => k === me
    || (k.echo && k.state === '')
    || x1 + gx <= k.left || x0 - gx >= k.right || y1 + gy <= k.top || y0 - gy >= k.bottom);
  const spawn = (s, e, now) => {
    const word = pick(s.words);
    const size = s.sizes[word];
    if (!size) return;
    const [w, h] = size;
    const f = frame(e.side);
    if (f.x1 - f.x0 < w || f.y1 - f.y0 < h) { e.nextAt = now + 800; return; }
    const [gx, gy] = gaps(h);
    for (let n = 0; n < 20; n++) {
      const x = rand(f.x0, f.x1 - w), y = rand(f.y0, f.y1 - h);
      if (!clear(s, e, x, y, x + w, y + h, gx, gy)) continue;
      e.el.textContent = word;
      put(e, x, y, w, h);
      e.el.style.transform = chip(e, angle(e.wall));
      setKw(e, 'in', 0);
      e.dieAt = now + rand(450, 1900);
      return;
    }
    e.nextAt = now + rand(100, 400);   // no room just now; try again shortly
  };
  let settled = false;   // the open service is at rest, so echoes may come
  // a phone keeps to the six: three on the ceiling, three on the floor
  const echo = (now) => {
    const s = services[open];
    if (!s.echoes.length || W < 900) return;
    s.echoes.forEach((e) => {
      if (e.state === 'lit' && now >= e.dieAt) {
        setKw(e, 'out', 0);
        e.nextAt = now + rand(120, 1300);
      } else if (e.state === '' && settled && now >= e.nextAt) {
        spawn(s, e, now);
      }
    });
  };

  // ---- scroll position -------------------------------------------------
  let pos = 0;      // 0 … N-1
  let open = 0;
  let inView = false;
  let landed = null;   // pinned at the top of the screen
  let shown = null;    // the card is in place (the edges and keywords on)
  let reveal = -1;
  let cover = -1;

  // (read first thing in the frame, before anything is written, so the page
  // has it to hand and nothing is laid out again for it)
  const measure = () => {
    const r = stage.getBoundingClientRect();
    const s = -r.top;
    pos = Math.min(N - 1, Math.max(0, (s - intro) / step));
    inView = r.top < window.innerHeight && r.bottom > 0;
    const down = r.top <= 0.5;
    if (down !== landed) {
      if (down && landed === false) catchLanding();
      landed = down;
    }
    // the intro: the first card rises from the foot of the screen
    const v = Math.round(1000 * Math.min(1, Math.max(0, s / intro))) / 1000;
    if (v !== reveal) {
      reveal = v;
      tickList.style.opacity = v;
    }
    const on = v >= 1;
    if (on !== shown) {
      shown = on;
      room.classList.toggle('is-on', on);
      if (on) {
        open = Math.round(pos);
        showOpen(open);
        lightUp(open);
      } else if (landed !== null) {
        lightDown(open);
      }
    }
    settled = on && Math.abs(pos - open) < 0.02;
    // how far Process has slid up over the room, over the stage's tail
    const k = Math.round(100 * Math.min(1, Math.max(0, (s - intro - (N - 1) * step) / window.innerHeight))) / 100;
    if (k !== cover) {
      cover = k;
      section.style.setProperty('--svc-cover', k);
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

  // The lean of the hovered card (the WebGL slab's, or the CSS stand-in's),
  // and where it puts a corner of the card on screen: turned about the middle
  // of the face as rotateX(rx) rotateY(ry) under TILT_PERSP, as the slab is,
  // so the edges can stay on its corners while it leans.
  const lean3 = { rx: 0, ry: 0, card: -1 };
  const setLean = (rx, ry, i) => {
    if (rx === lean3.rx && ry === lean3.ry && i === lean3.card) return;
    lean3.rx = rx; lean3.ry = ry; lean3.card = i;
    dirty = true;
  };
  const leaned = (x, y) => {
    const a = (lean3.rx * Math.PI) / 180, b = (lean3.ry * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const X = x - ex, Y = y - ey;
    const qx = cb * X, qy = sa * sb * X + ca * Y, qz = -ca * sb * X + sa * Y;
    const k = TILT_PERSP / (TILT_PERSP - qz);
    return [ex + qx * k, ey + qy * k];
  };

  // a keyword's transform: its wall's turn, then the lens about the eye
  const chip = (k, a) => {
    const e = toEye(k.cx, k.cy, a);
    const p = e[2] > 1 ? toScreen(e) : null;
    const f = p ? lensK(p[0], p[1]) : 1;
    return (f < 0.9995 ? `scale(${f.toFixed(4)}) ` : '') + turn(a);
  };
  let drawn = '';
  const place = () => {
    // nothing to do while the room stands still
    const key = `${pos}|${reveal}`;
    if (key === drawn && !dirty) return;
    drawn = key;
    dirty = false;
    const near = NEAR * depth;
    // during the intro the first card is still on its way up from below
    const rise = reveal < 1 ? (1 - ease(Math.max(0, reveal))) * (H - card.top) : 0;
    for (let i = 0; i < N; i++) {
      const s = services[i];
      const a = angle(i);
      const facing = Math.abs(i - pos) < 1;
      const cardOn = facing && nearest(card.left, card.right, a) > near;
      show(s, s.card, cardOn);
      if (cardOn) s.card.style.transform = rise ? `translate3d(0,${rise.toFixed(1)}px,0)` : turn(a);
      s.all.forEach((k) => {
        const on = facing && nearest(k.left, k.right, a) > near;
        show(k, k.el, on);
        if (on) k.el.style.transform = chip(k, a);
      });
    }
    // the edges: wall j's right corners to wall j+1's left corners
    // only the joins beside the walls in view: with five services on a
    // square room's four walls, the far ones come round on top of the near
    joins.forEach((jn) => {
      if (Math.abs(jn.j + 0.5 - pos) > 1.5) {
        jn.pair.forEach((p) => { p.style.display = 'none'; });
        return;
      }
      const a0 = angle(jn.j), a1 = angle(jn.j + 1);
      [card.top, card.bottom].forEach((y, n) => edge(jn.pair[n], y, a0, a1, near, jn.j));
    });
  };
  // One edge. Its base is the straight line from wall j's card corner to wall
  // j+1's, cut where it passes behind the eye; on screen it runs from the end
  // in view (P) to where it leaves the screen (E). It is drawn as a soft curve
  // between those two: a quadratic whose control point sits KX of the way
  // from P to E across and only KY of the way up or down, so it leaves the
  // card nearly level and steepens toward the screen's corner (with the Figma
  // slope of ~0.34, ~0.14 at the card and ~0.45 at the corner). The curve is
  // only as strong as the far end is out of sight — as the next card comes
  // into view the edge straightens, and between two cards on screen it is a
  // plain straight line. A phone keeps them straight: there is too little
  // room between the card and the screen's side for a curve.
  const KX = 0.355, KY = 0.146;
  const EDGE_STEPS = 24;
  const smooth = (t) => t * t * (3 - 2 * t);
  const clip2 = (p, q, x0, y0, x1, y1) => {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    let t0 = 0, t1 = 1;
    for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
      if (pp === 0) { if (qq < 0) return null; continue; }
      const r = qq / pp;
      if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
  };
  // how far a point lies outside the screen (0 inside it)
  const outside = (p) => Math.hypot(Math.max(0, -p[0], p[0] - W), Math.max(0, -p[1], p[1] - H));
  const edge = (path, y, a0, a1, near, j) => {
    const seg = clip(toEye(card.right, y, a0), toEye(card.left, y, a1), near);
    if (!seg) { path.style.display = 'none'; return; }
    let p = toScreen(seg[0]), f = toScreen(seg[1]);
    // the leaning card's corners, where it leans to
    if (lean3.card >= 0) {
      if (j === lean3.card) p = leaned(card.right, y);
      if (j + 1 === lean3.card) f = leaned(card.left, y);
    }
    if (outside(p) > outside(f)) [p, f] = [f, p];
    const shown = clip2(p, f, 0, 0, W, H);
    if (!shown) { path.style.display = 'none'; return; }
    const [P, E] = shown;
    // measured against the nearer end too, so that when both ends are out
    // of sight the curve has died away before they could swap places
    const w = W < 900 ? 0 : Math.min(1, (outside(f) - outside(p)) / (W * 0.5));
    const kx = 0.5 + (KX - 0.5) * w, ky = 0.5 + (KY - 0.5) * w;
    const K = [P[0] + (E[0] - P[0]) * kx, P[1] + (E[1] - P[1]) * ky];
    // through the lens, point by point; an end that is a card's corner stays
    // put (the card isn't bent), the bend coming in over the first stretch
    const atP = outside(p) === 0, atE = outside(f) === 0;
    let d = '';
    for (let i = 0; i <= EDGE_STEPS; i++) {
      const t = i / EDGE_STEPS, u = 1 - t;
      const x = u * u * P[0] + 2 * u * t * K[0] + t * t * E[0];
      const y = u * u * P[1] + 2 * u * t * K[1] + t * t * E[1];
      const b = (atP ? smooth(Math.min(1, t / 0.3)) : 1) * (atE ? smooth(Math.min(1, u / 0.3)) : 1);
      const q = warp(x, y, b);
      d += `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }
    path.style.display = '';
    path.setAttribute('d', d);
  };

  // ---- keyword flicker -------------------------------------------------
  // Every flicker is quick and never quite the same: a random length, and
  // the twitches pick one of three patterns.
  const GLITCHES = ['svcGlitch', 'svcGlitchB', 'svcGlitchC'];
  const setKw = (k, state, delay) => {
    k.state = state;
    const el = k.el;
    el.classList.remove('is-in', 'is-lit', 'is-out', 'is-glitch');
    if (state === 'in' || state === 'out') {
      el.style.setProperty('--d', `${delay.toFixed(2)}s`);
      el.style.setProperty('--dur', `${rand(state === 'in' ? 0.2 : 0.15, state === 'in' ? 0.34 : 0.26).toFixed(2)}s`);
      el.classList.add(state === 'in' ? 'is-in' : 'is-out');
    } else if (state === 'lit') {
      el.classList.add('is-lit');
    }
  };
  services.forEach((s) => s.all.forEach((k) => {
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
    const s = services[i];
    const delays = stagger(s.kws, 0.06);
    s.kws.forEach((k, n) => setKw(k, reduce ? 'lit' : 'in', delays[n]));
    const now = performance.now();
    s.echoes.forEach((e) => { e.nextAt = now + rand(250, 1500); });
  };
  const lightDown = (i) => {
    const s = services[i];
    const delays = stagger(s.all, 0.02);
    s.all.forEach((k, n) => {
      if (k.state === '' || k.state === 'out') return;
      setKw(k, reduce ? '' : 'out', delays[n]);
    });
  };
  const updateOpen = () => {
    if (!shown) return;
    if (Math.abs(pos - open) <= HYSTERESIS) return;
    const next = Math.round(pos);
    if (next === open) return;
    lightDown(open);
    open = next;
    showOpen(open);
    lightUp(open);
  };

  // every few hundred ms one or two of whatever is lit twitches
  let nextGlitch = 0;
  const glitch = (now) => {
    if (reduce || now < nextGlitch) return;
    nextGlitch = now + rand(180, 750);
    const on = services[open].all.filter((k) => k.state === 'lit' && !k.el.classList.contains('is-glitch'));
    for (let n = Math.random() < 0.35 ? 2 : 1; n > 0 && on.length; n--) {
      const el = on.splice((Math.random() * on.length) | 0, 1)[0].el;
      el.style.setProperty('--g-name', pick(GLITCHES));
      el.style.setProperty('--g-dur', `${rand(0.14, 0.32).toFixed(2)}s`);
      el.classList.add('is-glitch');
    }
  };

  // ---- snap --------------------------------------------------------------
  // The stops: the bare screen, each service, then Process all the way up. As
  // soon as the wheel lets go (not when Lenis's glide finally dies away, a
  // second later) the page heads for a stop: judged on where the glide would
  // land, a push of PUSH of the way past the stop it last rested on carries on
  // to the next one in that direction, anything less falls back, and one
  // scroll never goes more than one stop. Anything else that moves the page
  // (keys, the scrollbar, a reload part-way down) settles on the nearest stop
  // once the page is still. A snap under way is never judged again until it
  // has finished, or the wheel takes over.
  let anchor = 0;   // the stop the page last rested on
  let snapping = 0; // while a snap is under way (until its end, or a safety timeout)
  let wheelTimer = 0;
  let settleTimer = 0;
  const stops = () => {
    const pts = [0];
    for (let i = 0; i < N; i++) pts.push(intro + i * step);
    pts.push(intro + (N - 1) * step + window.innerHeight);
    return pts;
  };
  const stageY = () => window.scrollY + stage.getBoundingClientRect().top;
  // the stop nearest where the page is now
  const nearestStop = () => {
    const s = window.scrollY - stageY();
    const pts = stops();
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p - s) < Math.abs(pts[best] - s)) best = i; });
    return best;
  };
  const settle = (byWheel) => {
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
    let t;
    if (byWheel) {
      t = aim > pts[anchor]
        ? (f > PUSH ? i + 1 : i)
        : (f < 1 - PUSH ? i : i + 1);
      t = Math.max(anchor - 1, Math.min(anchor + 1, t));
    } else {
      t = f < 0.5 ? i : i + 1;
    }
    anchor = t;
    if (Math.abs(pts[t] - now) < 2 && Math.abs(pts[t] - aim) < 2) return;
    snapping = performance.now() + 3000;
    smoothScroll.scrollTo(top + pts[t], {
      duration: SETTLE_TIME,
      easing: ease,
      onComplete: () => { snapping = 0; },
    });
  };
  // Landing: the glide that slid the section in would carry straight on past
  // the bare screen. So it stops where the section lands, the wheel is shut
  // off, and it only comes back once the screen has held for HOLD and the
  // gesture that brought the page here has ended (a trackpad coasts on for a
  // while after the fingers lift), so bringing the card up takes a fresh scroll.
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
    smoothScroll.scrollTo(top, { duration: 0.35, force: true, easing: ease });
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
      const t = performance.now();
      // a fresh gesture counts from wherever the page rests now (it may have
      // been reloaded mid-way, or moved by the keys or the scrollbar)
      if (!holding && t - lastWheel > GESTURE_GAP && t >= snapping) anchor = nearestStop();
      lastWheel = t;
      if (holding) return;
      snapping = 0; // the wheel takes over from a snap under way
      clearTimeout(wheelTimer);
      if (inView) wheelTimer = setTimeout(() => settle(true), WHEEL_IDLE);
    }, { passive: true });
    smoothScroll.on('scroll', () => {
      // outside the stops the page is free; remember which end it left by
      const s = window.scrollY - stageY();
      const pts = stops();
      if (s <= 0) anchor = 0;
      else if (s >= pts[pts.length - 1]) anchor = pts.length - 1;
      clearTimeout(settleTimer);
      if (inView && !holding) settleTimer = setTimeout(() => settle(false), SETTLE_DELAY);
    });
  }

  // ---- the footer's services ---------------------------------------------
  // Each one takes you to its stop, as a snap would.
  const go = (i) => {
    const y = stageY() + stops()[i + 1];
    anchor = i + 1;
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

  // ---- the metal card ----------------------------------------------------
  // Only the open card, only on a mouse, only while the room is at rest. The
  // cursor sets where the card should lean; the loop eases it there (and back
  // to flat once the cursor leaves) and moves the highlight with it.
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let hovered = -1;
  const lean = { x: 0, y: 0, tx: 0, ty: 0, mx: 50, my: 30 };
  if (canHover) {
    services.forEach((s, i) => {
      s.card.addEventListener('pointermove', (e) => {
        hovered = i;
        // the card's resting box (the room is pinned and still whenever the
        // metal is on), so it maps the cursor steadily without asking the page
        const r = { left: card.left, top: card.top, width: card.right - card.left, height: card.bottom - card.top };
        const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        lean.tx = (u - 0.5) * 2;
        lean.ty = (v - 0.5) * 2;
        lean.mx = u * 100;
        lean.my = v * 100;
      });
      s.card.addEventListener('pointerleave', () => { if (hovered === i) hovered = -1; });
    });
  }
  // The WebGL slab: printed off the open card as the cursor comes onto it,
  // shown over it while the card steps aside, leaning on a spring (so it
  // carries on a touch and settles), and handed back once it is flat again.
  // If the room starts to turn it is dropped at once.
  const metalCanvas = section.querySelector('.svc__metal');
  const metalGL = canHover && metalCanvas && window.createSvcMetal ? window.createSvcMetal(metalCanvas) : null;
  // without it, the CSS stand-in: the card's own slices, finish and sheen
  if (canHover && !metalGL) {
    const layer = (cls, i) => {
      const el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      if (i != null) el.style.setProperty('--i', i);
      return el;
    };
    services.forEach(({ body }) => {
      for (let n = SLABS; n >= 1; n--) body.prepend(layer('svc-card__slab', n));
      body.insertBefore(layer('svc-card__metal'), body.querySelector('.svc-card__bar'));
      body.appendChild(layer('svc-card__shine'));
    });
  }
  let glCard = -1;   // the card the slab is standing in for
  const swing = { x: 0, y: 0, vx: 0, vy: 0 };
  const glOff = (cut) => {
    if (glCard < 0) return;
    services[glCard].card.classList.remove('is-gl');
    metalCanvas.classList.toggle('is-cut', !!cut);
    metalCanvas.classList.remove('is-on');
    glCard = -1;
    setLean(0, 0, -1);
  };
  // The metal waits until the room has truly stopped: a snap's last stretch
  // still turns the card a degree or two, which would shift it sideways
  // under the slab. (settled is looser, for the echoes.)
  const atRest = () => settled && Math.abs(pos - open) < AT_REST;
  const shineGL = () => {
    if (!atRest()) {
      if (glCard >= 0) { glOff(true); swing.x = swing.y = swing.vx = swing.vy = 0; }
      return;
    }
    const want = hovered === open ? open : -1;
    if (want >= 0 && glCard !== want) {
      glOff(true);
      // printed off the card standing square, whatever trace of a turn it
      // still has, so the slab lands where the room's edges meet it
      const c = services[want].card;
      const turned = c.style.transform;
      c.style.transform = 'none';
      metalGL.prepare(c, section);
      c.style.transform = turned;
      metalGL.draw(-swing.y * TILT, swing.x * TILT, lean.mx / 100, lean.my / 100);
      glCard = want;
      metalCanvas.classList.remove('is-cut');
      metalCanvas.classList.add('is-on');
      services[want].card.classList.add('is-gl');
    }
    if (glCard < 0) return;
    const tx = want >= 0 && !reduce ? lean.tx : 0, ty = want >= 0 && !reduce ? lean.ty : 0;
    swing.vx = (swing.vx + (tx - swing.x) * SPRING) * DAMP;
    swing.vy = (swing.vy + (ty - swing.y) * SPRING) * DAMP;
    swing.x += swing.vx;
    swing.y += swing.vy;
    setLean(-swing.y * TILT, swing.x * TILT, glCard);
    metalGL.draw(lean3.rx, lean3.ry, lean.mx / 100, lean.my / 100);
    const still = Math.max(Math.abs(swing.x), Math.abs(swing.y), Math.abs(swing.vx), Math.abs(swing.vy)) < 0.002;
    if (want < 0 && still) glOff(false);
  };

  let metal = -1;
  let leaning = -1;   // the card still easing back to flat, if any
  const shine = () => {
    if (metalGL) { shineGL(); return; }
    const on = hovered === open && atRest() ? open : -1;
    if (on !== metal) {
      if (metal >= 0) services[metal].card.classList.remove('is-metal');
      if (on >= 0) services[on].card.classList.add('is-metal');
      metal = on;
    }
    const tx = on >= 0 && !reduce ? lean.tx : 0, ty = on >= 0 && !reduce ? lean.ty : 0;
    lean.x += (tx - lean.x) * 0.12;
    lean.y += (ty - lean.y) * 0.12;
    if (on >= 0) leaning = on;
    if (leaning < 0) return;
    const b = services[leaning].body;
    if (Math.abs(lean.x) < 0.001 && Math.abs(lean.y) < 0.001 && on < 0) {
      ['--svc-rx', '--svc-ry', '--svc-sheen'].forEach((p) => b.style.removeProperty(p));
      leaning = -1;
      setLean(0, 0, -1);
      return;
    }
    setLean(-lean.y * TILT, lean.x * TILT, leaning);
    b.style.setProperty('--svc-ry', `${(lean.x * TILT).toFixed(2)}deg`);
    b.style.setProperty('--svc-rx', `${(-lean.y * TILT).toFixed(2)}deg`);
    b.style.setProperty('--svc-sheen', `${(lean.x * 25).toFixed(1)}deg`);
    b.style.setProperty('--svc-mx', `${lean.mx.toFixed(1)}%`);
    b.style.setProperty('--svc-my', `${lean.my.toFixed(1)}%`);
  };

  // ---- loop --------------------------------------------------------------
  let running = false;
  const tick = (now) => {
    if (!running) return;
    measure();
    shine();     // before place(), so the edges meet the card where it leans this frame
    place();
    updateOpen();
    glitch(now);
    echo(now);
    requestAnimationFrame(tick);
  };
  const start = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
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
