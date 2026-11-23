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
//     round the corner they run straight out to the screen's corners; as the
//     next card comes into view they swing onto the line between the two
//     cards, and halfway round they lie level between them
//   · it slides up over the Core as a bare dark screen.
//     Scrolling continues naturally; after a short lead-in the first card
//     peeks up from the foot of the screen, and from there it rises the rest
//     of the way by itself and snaps into place, where its edges and
//     keywords flicker on. Scrolling back up, it drops out of sight by
//     itself onto the bare screen
//   · a tick per service along the foot of the screen keeps count
//   · the room is seen through a lens that bends it toward the screen's
//     corners (a fisheye, as on a curved screen): the keywords are drawn in
//     and shrunk toward the corners, the middle — the card and a margin round
//     it — is left untouched and sharp. The edges stay straight
//   · hovering the open card while the room is at rest makes it lean toward
//     the pointer and reveals inspect frames in the signal dashes
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
  const GESTURE_GAP = 180;    // ms without a wheel tick that ends a gesture (trackpads coast)
  const LEAD = 0.55;          // share of the intro the screen stays bare before the first card shows
  const RISE_TIME = 0.9;      // s the first card takes to rise the rest of the way by itself
  const HYSTERESIS = 0.55;    // how far past halfway before the open service changes
  const AT_REST = 0.003;      // how close to its stop the room must be for hover (0.27°)
  const TILT_ANGLE = 10;      // degrees at the far edge of the card
  const TILT_PERSPECTIVE = 1400;
  const TILT_PULL = 0.085;
  const TILT_DAMPING = 0.8;
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
    const title = body.querySelector('.svc-card__title');
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
    return { card, body, title, kws, echoes, all: kws.concat(echoes), words, sizes: {}, shown: null };
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
  // the red light on the side walls, drawn in characters (svc-ascii.js) and
  // cut to the room's walls (styles.css)
  const glow = section.querySelector('.svc__glow');
  const asciiCanvas = glow && glow.querySelector('.svc__ascii');
  const ascii = asciiCanvas && window.createSvcAscii ? window.createSvcAscii(asciiCanvas) : null;

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
    for (let i = 0; i < N; i++) mark('svc__snap', i);
    mark('svc__snap svc__snap--end');
    document.documentElement.classList.add('svc-snap-native');
  }

  // ---- sizes -----------------------------------------------------------
  let W = 0, H = 0, step = 1, intro = 1;
  let dirty = true;               // the room needs drawing again even if the scroll hasn't moved
  let tiltDirty = false, tilt = null;
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
    resetTilt();
    signal?.clear();
    signal?.prepare(services[0].body);
    if (ascii) {
      ascii.resize(W, H);
      ascii.grid(card.left, card.top, card.bottom, H);
    }
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
  // corners (r is the distance from the eye, 1 at a corner). So the corners
  // draw in, and the card and everything near it are untouched. A keyword,
  // being small, is moved and shrunk as its middle would be, by a scale about
  // the eye in front of its own turn. The edges are left straight.
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
    // Hold the first card briefly, then give it a long scroll range to rise.
    // The longer intro is set on .svc-stage so this remains scroll-driven.
    const lead = intro * LEAD;
    const v =Math.round(1000 * Math.min(1, Math.max(0, (s - lead) / (intro - lead)))) / 1000;
    if (v !== reveal) {
      reveal = v;
      tickList.style.opacity = v;
    }
    // the edges and keywords wait for the card, and flicker on the moment it
    // lands: once what is left of its rise (eased, so the tail of the scroll
    // barely moves it) is under a pixel
    const on = H ? v > 0 && (1 - ease(v)) * (H - card.top) < 1 : v >= 0.99;
    if (on !== shown) {
      shown = on;
      room.classList.toggle('is-on', on);
      if (on) {
        open = Math.round(pos);
        showOpen(open);
        lightUp(open);
      } else {
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
  const turn = (a) => (Math.abs(a) < 0.00001 ? '' :
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

  // Project the face's CSS rotation before the room's wall turn so the
  // ceiling and floor lines continue to meet the four card corners.
  const cardCorner = (index, x, y, wallAngle) => {
    if (tilt?.index !== index) return toEye(x, y, wallAngle);
    const a = tilt.rx * Math.PI / 180, b = tilt.ry * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const X = x - ex, Y = y - ey;
    const qx = cb * X, qy = sa * sb * X + ca * Y, qz = -ca * sb * X + sa * Y;
    const scale = TILT_PERSPECTIVE / (TILT_PERSPECTIVE - qz);
    return toEye(ex + qx * scale, ey + qy * scale, wallAngle);
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
    // no size yet (loaded in a hidden or zero-size frame): the projection
    // would divide by a zero depth and write NaN into the edges, so wait —
    // dirty stays set, and the first real size draws everything
    if (!W || !H || !depth) return;
    // nothing to do while the room stands still
    const key = `${pos}|${reveal}`;
    const wallsMoved = key !== drawn || dirty;
    if (!wallsMoved && !tiltDirty) return;
    drawn = key;
    dirty = tiltDirty = false;
    const near = NEAR * depth;
    // during the intro the first card is still on its way up from below
    const rise = reveal < 1 ? (1 - ease(Math.max(0, reveal))) * (H - card.top) : 0;
    if (wallsMoved) {
      services.forEach((s, i) => {
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
      });
    }
    // the edges: wall j's right corners to wall j+1's left corners
    // only the joins beside the walls in view: with five services on a
    // square room's four walls, the far ones come round on top of the near
    let walls = '';
    lights.length = 0;
    joins.forEach((jn) => {
      if (Math.abs(jn.j + 0.5 - pos) > 1.5) {
        jn.pair.forEach((p) => { p.style.display = 'none'; });
        return;
      }
      const a0 = angle(jn.j), a1 = angle(jn.j + 1);
      const [t, b] = [card.top, card.bottom].map((y, n) => edge(jn.pair[n], y, a0, a1, near, jn.j));
      // the wall between the two edges: their ends, round (along the
      // screen's side, when they run off it)
      if (t && b) {
        const rim = t.rim && b.rim ? `L${xy(t.rim)}L${xy(b.rim)}` : '';
        walls += `M${xy(t.P)}L${xy(t.E)}${rim}L${xy(b.E)}L${xy(b.P)}Z`;
        // and the light on it (svc-ascii.js), its far end out at the screen's side
        const lit = Math.min(t.lit, b.lit);
        if (lit > 0.002) lights.push({ ft: t.far, nt: t.P, nb: b.P, fb: b.far, lit, id: jn.j });
      }
    });
    // the light shows only on those walls, so it keeps between the edges
    // and its rim goes round with them
    if (glow) glow.style.clipPath = walls ? `path('${walls}')` : 'inset(50%)';
    if (ascii) ascii.walls(lights);
  };
  // One edge. Its base is the straight line from wall j's card corner to wall
  // j+1's, cut where it passes behind the eye; on screen it runs from the end
  // in view (P) to where it leaves the screen (E). It is drawn straight, and
  // while the far end is out of sight E is pulled onto the screen's corner on
  // that side, so the four edges frame the card from corner to corner. As
  // the next card comes into view the pull lets go: the edge eases back onto
  // the room's own line, and between two cards on screen it is that line. The lens leaves the edges
  // alone, so they stay straight and reach the corners.
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
  const PULL = 0.25;   // how far out of sight (× the screen's width) the far end must be for the full pull
  const smooth = (t) => t * t * (3 - 2 * t);
  // how far a point lies outside the screen (0 inside it)
  const outside = (p) => Math.hypot(Math.max(0, -p[0], p[0] - W), Math.max(0, -p[1], p[1] - H));
  const edge = (path, y, a0, a1, near, j) => {
    const seg = clip(cardCorner(j, card.right, y, a0), cardCorner(j + 1, card.left, y, a1), near);
    if (!seg) { path.style.display = 'none'; return null; }
    let p = toScreen(seg[0]), f = toScreen(seg[1]);
    // A card swung so far round that it is about to be hidden (part of it
    // behind the eye) may still have its corner on screen. Its edge takes
    // that end as the far one and runs on past it toward the screen's edge,
    // all the way by the time the card goes: there is nothing left there to
    // meet, and until then the stretch beyond the corner lies behind the
    // card's own face. (A bare wall has no card: always all the way.)
    let gp = going(j, a0), gf = going(j + 1, a1);
    if (outside(p) > outside(f) || (outside(p) === outside(f) && gp > gf)) {
      [p, f] = [f, p];
      [gp, gf] = [gf, gp];
    }
    const shown = clip2(p, f, 0, 0, W, H);
    if (!shown) { path.style.display = 'none'; return null; }
    let [P, E] = shown;
    if (gf > 0 && !outside(f)) {
      const run = clip2(P, [P[0] + (f[0] - P[0]) * 1e4, P[1] + (f[1] - P[1]) * 1e4], 0, 0, W, H);
      if (run) E = [f[0] + (run[1][0] - f[0]) * gf, f[1] + (run[1][1] - f[1]) * gf];
    }
    // only as strong as the far end is out of sight (full while a card stands
    // square, none once both ends are on screen), and measured against the
    // nearer end too, so that when both ends are out of sight the pull has
    // died away before they could swap places
    const w = smooth(Math.min(1, (outside(f) - outside(p)) / (W * PULL)));
    const C = [E[0] < P[0] ? 0 : W, y === card.top ? 0 : H];
    const x1 = E[0] + (C[0] - E[0]) * w, y1 = E[1] + (C[1] - E[1]) * w;
    path.style.display = '';
    path.setAttribute('d', `M${P[0].toFixed(1)} ${P[1].toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`);
    // where it leaves the screen, the wall it bounds goes on to the screen's
    // corner on that side (it may leave through the top or the bottom)
    const atRim = x1 <= 0.5 || x1 >= W - 0.5 || y1 <= 0.5 || y1 >= H - 0.5;
    // the edge carried on to the screen's side (it may leave through the top
    // or the bottom first), for the far end of the light on its wall; that
    // light is as strong as the edge runs off the screen
    const run = x1 - P[0];
    const far = Math.abs(run) > 0.5 ? [C[0], P[1] + (y1 - P[1]) * (C[0] - P[0]) / run] : [x1, y1];
    return { P, E: [x1, y1], rim: atRim ? C : null, far, lit: Math.max(w, gf) };
  };
  const xy = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  // how far wall i's card is on its way to being hidden: 0 while it is well
  // in front of the eye, 1 once it is hidden (or there is no card)
  const GOING = 0.35;  // × the depth, before its hiding point, that it starts
  const going = (i, a) => {
    if (!services[i] || !services[i].shown) return 1;
    const v = nearest(card.left, card.right, a) / depth;
    return smooth(1 - Math.min(1, Math.max(0, (v - NEAR) / GOING)));
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
    // The empty lead-in is only for entering Service. On the way back up,
    // don't turn it into a second stop between the first card and The Core.
    if (aim < intro) { anchor = 0; return; }
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
  let lastWheel = 0;
  // The intro: once the first card peeks up from the foot of the screen on
  // the way down, it rises the rest of the way by itself and the room snaps
  // there; scrolling back up from it, it drops back out of sight the same
  // way, onto the bare screen. The wheel is shut off meanwhile, and only comes
  // back once the gesture that set it going has ended (a trackpad coasts on
  // for a while after the fingers lift), so the next move takes a fresh scroll.
  let rising = false;
  const riseIn = (up) => {
    rising = true;
    anchor = up ? 1 : 0;
    clearTimeout(wheelTimer);
    clearTimeout(settleTimer);
    snapping = performance.now() + 3000;
    smoothScroll.stop();
    const top = stageY();
    // down, it only has to go as far as the card is out of sight: the screen
    // stands still from there to the top of the stage, so the rest is a jump
    smoothScroll.scrollTo(top + (up ? intro : intro * LEAD), {
      duration: RISE_TIME,
      easing: (t) => t,   // the card's own rise eases already
      force: true,
      onComplete: () => {
        if (!up) smoothScroll.scrollTo(top, { immediate: true, force: true });
        snapping = 0;
        const release = () => {
          if (performance.now() - lastWheel < GESTURE_GAP) { setTimeout(release, 60); return; }
          rising = false;
          smoothScroll.start();
        };
        release();
      },
    });
  };

  if (!touch && smoothScroll) {
    window.addEventListener('wheel', () => {
      const t = performance.now();
      if (rising) { lastWheel = t; return; }
      // a fresh gesture counts from wherever the page rests now (it may have
      // been reloaded mid-way, or moved by the keys or the scrollbar)
      if (t - lastWheel > GESTURE_GAP && t >= snapping) anchor = nearestStop();
      lastWheel = t;
      snapping = 0; // the wheel takes over from a snap under way
      clearTimeout(wheelTimer);
      if (inView) wheelTimer = setTimeout(() => settle(true), WHEEL_IDLE);
    }, { passive: true });
    smoothScroll.on('scroll', () => {
      // outside the stops the page is free; remember which end it left by
      if (rising) return;
      const s = window.scrollY - stageY();
      const pts = stops();
      if (s <= 0) anchor = 0;
      else if (s >= pts[pts.length - 1]) anchor = pts.length - 1;
      if (s > intro * LEAD && s < intro - 2) {
        if (smoothScroll.direction > 0) { riseIn(true); return; }
        if (smoothScroll.direction < 0) { riseIn(false); return; }
      }
      clearTimeout(settleTimer);
      if (inView) settleTimer = setTimeout(() => settle(false), SETTLE_DELAY);
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

  // The pointer affects the open card only while the room is at rest.
  const canHover = matchMedia('(any-hover: hover)').matches;
  const signal = window.createSvcSignal?.(reduce || !canHover, services.map(({ body }) => body));
  let hover = null, titleHover = -1;
  if (canHover) {
    services.forEach(({ card }, index) => {
      const point = (event) => {
        if (event.pointerType !== 'touch') hover = { index, x: event.clientX, y: event.clientY };
      };
      const leave = (event) => {
        if (event.pointerType !== 'touch' && hover?.index === index) hover = null;
      };
      card.addEventListener('pointerenter', point);
      card.addEventListener('pointermove', point);
      card.addEventListener('pointerleave', leave);
      card.addEventListener('pointercancel', leave);
    });
  }

  const resetTilt = () => {
    if (!tilt) return;
    const { card, body } = services[tilt.index];
    body.style.removeProperty('transform');
    card.classList.remove('is-tilting');
    tilt = null;
    tiltDirty = true;
  };

  const updateTilt = (atRest, pointer, now) => {
    if (!atRest || reduce) { resetTilt(); return; }
    if (!pointer && !tilt) return;
    const service = services[open];
    if (tilt?.index !== open) {
      resetTilt();
      if (!pointer) return;
      tilt = { index: open, bounds: service.card.getBoundingClientRect(), x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0, time: now };
    }

    // The outer card supplies a stable hit area while its inner face tilts.
    const { left, top, width, height } = tilt.bounds;
    const normalize = (value, start, length) => Math.min(1, Math.max(-1, (value - start) / length * 2 - 1));
    const targetX = pointer ? normalize(pointer.x, left, width) : 0;
    const targetY = pointer ? normalize(pointer.y, top, height) : 0;
    const frames = Math.min(1.5, (now - tilt.time) * 0.06);
    const damping = TILT_DAMPING ** frames;
    tilt.time = now;
    tilt.vx = (tilt.vx + (targetX - tilt.x) * TILT_PULL * frames) * damping;
    tilt.vy = (tilt.vy + (targetY - tilt.y) * TILT_PULL * frames) * damping;
    tilt.x += tilt.vx * frames;
    tilt.y += tilt.vy * frames;
    if (!pointer && Math.max(Math.abs(tilt.x), Math.abs(tilt.y), Math.abs(tilt.vx), Math.abs(tilt.vy)) < 0.002) {
      resetTilt();
      return;
    }

    const rx = Math.round(-tilt.y * TILT_ANGLE * 1000) / 1000;
    const ry = Math.round(tilt.x * TILT_ANGLE * 1000) / 1000;
    if (rx === tilt.rx && ry === tilt.ry) return;
    tilt.rx = rx;
    tilt.ry = ry;
    service.body.style.transform = `perspective(${TILT_PERSPECTIVE}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    service.card.classList.toggle('is-tilting', rx !== 0 || ry !== 0);
    tiltDirty = true;
  };

  const lights = [];   // the walls the light is on (place() fills it)

  // ---- loop --------------------------------------------------------------
  let running = false;
  const tick = (now) => {
    if (!running) return;
    measure();
    const atRest = settled && Math.abs(pos - open) < AT_REST;
    const pointer = hover?.index === open ? hover : null;
    updateTilt(atRest, pointer, now);
    place();
    signal?.update(atRest ? services[open].body : null, pointer, now);
    const hovered = atRest && pointer ? open : -1;
    if (hovered !== titleHover) {
      titleHover = hovered;
      if (hovered >= 0 && !reduce && typeof pixelReveal === 'function') {
        const { title, body, card } = services[hovered];
        if (title && !title.dataset.pxBusy) pixelReveal(title, { duration: 900, replay: true, local: [card, body] });
      }
    }
    // the light wavers while the room is lit (held still with reduced motion)
    if (ascii && shown) ascii.draw(reduce ? 0 : now / 1000);
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
  const stop = () => {
    running = false;
    hover = null;
    titleHover = -1;
    resetTilt();
    signal?.clear();
  };

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
