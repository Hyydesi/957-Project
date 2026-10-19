// PROJECTS is defined in projects.js (loaded before this file) — single source of truth.

// ---------- Hero: heading builds itself out of pixel blocks on arrival ----------
// The site's heading reveal (pixelReveal, script.js), played once the page has
// opened to full screen — after the transition from the last page has grown
// it to full size (window.pageReady, page-transition.js) — and the display
// face is in, so the letters measure true.
(function heroReveal() {
  const title = document.querySelector('.whero__title');
  if (!title || typeof pixelReveal !== 'function') return;
  title.style.visibility = 'hidden';
  Promise.all([
    window.pageReady || Promise.resolve(),
    document.fonts ? document.fonts.ready : null,
  ]).then(() => pixelReveal(title, { duration: 1300 }));
})();

// ---------- Card strip (Figma 1539:249) ----------
// The projects as 780×448 cards in a row across a pinned
// screen, with the home grid's stills. The row is a loop: a turn of the
// wheel, a swipe, a drag, the arrows under it or the arrow keys move it a
// card at a time for ever, the projects coming round again and again (the
// list is laid out three times over so a card always wraps round well off
// screen); the dots under it jump straight to a project. The page itself
// doesn't scroll.
//
// As a skewed carousel (after React Bits Pro's Skewed Carousel): the cards
// sit side by side, one card's width apart, the one in the middle flat and
// full size; every card is turned about its own upright axis by how many
// steps it is from the middle — 60° a step, its inner side swinging back and
// its outer side forward, each seen through its own perspective — and shrunk
// to 85%, so the turned neighbours narrow and open the gaps. The turn follows
// the row continuously as it slides, and once the wheel or a swipe lets go
// the row settles with a card in the middle; two steps out a card has turned
// past its edge and shows its back, as in the reference. On arrival the first
// project comes in alone from the right edge, turned edge-on and facing round
// as it slides to the middle; then the cards after it fan out from behind
// it, the nearest first, growing and turning into place. Nothing stands to
// its left at first: the end of the loop only shows there once the row has
// gone all the way round, or is taken back.
//
// Behind it all, React Bits' Gradient ASCII (gradient-ascii.js) in the
// brand's reds, upside down: a soft glow rising from the bottom under a dark
// curve, drawn in characters that scramble under the cursor. With WebGL the cards are drawn on a canvas over
// it; the real cards stay on top, unseen, as the links. Without WebGL the
// real cards show.
(function cardStrip() {
  const section = document.getElementById('wStrip');
  const track = document.getElementById('wStripTrack');
  const glCanvas = document.getElementById('wStripGl');
  if (!section || !track || typeof PROJECTS === 'undefined') return;
  const sticky = section.querySelector('.wstrip__sticky');
  const bg = sticky.querySelector('.wstrip__bg');
  // the glow behind, in the brand's reds: from the edge of the shadow (the
  // brand red) through the near-white rim to the far reds of the sky
  if (bg && typeof window.GradientASCII === 'function') {
    window.GradientASCII(bg, {
      colors: ['#d80000', '#fff1ee', '#ff9a90', '#e01b12'],
      shape: 'horizon',
      // upside down: the glow rises from the bottom, the dark sits up top,
      // its curve reaching about 60% down the middle and 47% at the sides
      flip: true,
      lift: 0.28,
      bow: 0.14,
    });
  }
  const menu = document.getElementById('menuOverlay');
  const nameEl = sticky.querySelector('.wstrip__now');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COPIES = 3;
  const cards = [];
  for (let k = 0; k < COPIES; k++) {
    PROJECTS.forEach((p, pi) => {
      const a = document.createElement('a');
      a.className = 'wcard';
      a.href = p.href || '#';
      a.setAttribute('aria-label', `${p.name}, ${p.year}`);
      // the repeats are only there to fill the loop
      if (k) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
      const img = document.createElement('img');
      img.src = p.image || p.cover;
      img.alt = '';
      img.decoding = 'async';
      const cap = document.createElement('span');
      cap.className = 'wcard__cap';
      cap.innerHTML = `<span>${p.name}</span><span>${p.year}</span>`;
      a.append(img, cap);
      track.appendChild(a);
      cards.push({ el: a, img, project: pi });
    });
  }

  // layout, in px, from the CSS (the 1920×977 frame scaled by --u)
  let vw = 0, vh = 0, u = 1, cw = 0, ch = 0, gap = 0, left = 0, top = 0, persp = 1500, loop = 1;
  const measure = () => {
    vw = sticky.clientWidth;
    vh = sticky.clientHeight;
    cw = cards[0].el.offsetWidth;
    ch = cards[0].el.offsetHeight;
    const narrow = vw < 900;
    u = narrow ? vw / 430 : Math.min(vw / 1920, vh / 977);
    // closer than side by side: the turn still leaves a small gap
    gap = -0.2 * cw;
    left = (vw - cw) / 2;
    top = track.offsetTop;
    // each card's own perspective, four of its widths deep
    persp = cw * 4;
    loop = cards.length * (cw + gap);
  };
  // a card's resting x, brought round into the stretch of the loop centred
  // on the screen
  const wrap = (x) => {
    const lo = vw / 2 - loop / 2 - cw / 2;
    return lo + ((((x - lo) % loop) + loop) % loop);
  };

  // how a card sits for where its middle is: o counts the steps (card widths)
  // from the middle of the screen, n how many either way
  const TURN = 60;      // degrees turned a step from the middle
  const SHRINK = 0.85;  // scale of every card off the middle
  const place = (x) => {
    const o = (x + cw / 2 - vw / 2) / (cw + gap);
    const n = Math.abs(o);
    return {
      x,
      r: -o * TURN,
      s: 1 - (1 - SHRINK) * Math.min(1, n),
      n,
    };
  };

  // ---- the loop's position: wheel, swipe and keys move a target the row
  // glides after ----
  let target = 0, pos = 0, speed = 0, last = 0;
  const blocked = () => menu && menu.classList.contains('is-open');
  // once input lets go, the row settles with a card in the middle
  let snapT = 0;
  const snapSoon = (ms) => {
    clearTimeout(snapT);
    snapT = setTimeout(() => { target = Math.round(target / (cw + gap)) * (cw + gap); draw(); }, ms);
  };
  const pitch = () => cw + gap;
  const go = (dir) => {
    target = Math.round(target / pitch()) * pitch() + dir * pitch();
    draw();
  };
  // a turn of the wheel (or a trackpad swipe) moves one card; the rest of
  // that gesture is let go
  let acc = 0, lockUntil = 0;
  window.addEventListener('wheel', (e) => {
    if (blocked()) return;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= vh;
    const now = performance.now();
    if (now < lockUntil) { lockUntil = now + 140; return; }
    acc += d;
    if (Math.abs(acc) > 24) {
      go(Math.sign(acc));
      acc = 0;
      lockUntil = now + 480;
    }
  }, { passive: true });
  // dragging (a finger, or the mouse) carries the row with it; let go, it
  // moves on a card if flicked or dragged far enough, else settles back
  let drag = null;
  const dragStart = (x, y) => { drag = { x0: x, y0: y, x, base: target, t: performance.now(), v: 0, moved: false }; };
  const dragMove = (x, y) => {
    if (!drag || blocked()) return;
    if (!drag.moved && Math.abs(x - drag.x0) < 6) return;
    if (!drag.moved && Math.abs(y - drag.y0) > Math.abs(x - drag.x0)) { drag = null; return; }
    drag.moved = true;
    const now = performance.now();
    drag.v = (drag.x - x) / Math.max(8, now - drag.t);
    drag.x = x; drag.t = now;
    target = drag.base + (drag.x0 - x) * 1.2;
    draw();
  };
  const dragEnd = () => {
    if (!drag) return;
    const was = drag;
    drag = null;
    if (!was.moved) return;
    const moved = target - was.base;
    const dir = Math.abs(was.v) > 0.4 ? Math.sign(was.v) : Math.abs(moved) > pitch() * 0.25 ? Math.sign(moved) : 0;
    target = Math.round(was.base / pitch()) * pitch() + dir * pitch();
    draw();
    // a drag isn't a click on the card it ended over
    sticky.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true, once: true });
  };
  sticky.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  sticky.addEventListener('touchmove', (e) => dragMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  sticky.addEventListener('touchend', dragEnd);
  track.addEventListener('mousedown', (e) => { if (e.button === 0) { e.preventDefault(); dragStart(e.clientX, e.clientY); } });
  window.addEventListener('mousemove', (e) => { if (drag) dragMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', dragEnd);
  window.addEventListener('keydown', (e) => {
    if (blocked() || e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) go(1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) go(-1);
    else return;
    e.preventDefault();
  });
  // the arrows and the dots under the row
  const controls = sticky.querySelector('.wstrip__controls');
  const dots = [];
  if (controls) {
    controls.querySelector('[data-step="-1"]').addEventListener('click', () => go(-1));
    controls.querySelector('[data-step="1"]').addEventListener('click', () => go(1));
    const list = controls.querySelector('.wstrip__dots');
    PROJECTS.forEach((p, pi) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wstrip__dot';
      b.setAttribute('aria-label', p.name);
      // the nearest card of that project, whichever way round
      b.addEventListener('click', () => {
        const at = Math.round(target / pitch());
        const n = cards.length;
        const of = (k) => cards[((k % n) + n) % n].project;
        for (let d = 0; d <= n; d++) {
          if (of(at + d) === pi) { target = (at + d) * pitch(); break; }
          if (of(at - d) === pi) { target = (at - d) * pitch(); break; }
        }
        draw();
      });
      list.appendChild(b);
      dots.push(b);
    });
  }

  // ---- arrival: the first project slides in from the right, then the others
  // fan out from behind it ----
  const FLY_MS = 1500;                       // the first card's slide
  const OPEN_AT = 1050, OPEN_MS = 800, OPEN_STAGGER = 130;
  let arrive = still ? -1 : 0;   // 0 = waiting, -1 = done, else its start time
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  // where card i stands for its resting x, and how far it has appeared (0..1)
  const entrance = (i, x, now) => {
    if (arrive === -1) return { x, a: 1 };
    const mid = (vw - cw) / 2;
    const k = arrive === 0 ? 0 : now - arrive;
    if (i === 0) return { x: x + (vw + 40 - mid) * (1 - ease(k / FLY_MS)), a: 1, first: true };
    const step = Math.max(1, Math.round(Math.abs(x - mid) / (cw + gap)));
    const e = ease((k - OPEN_AT - (step - 1) * OPEN_STAGGER) / OPEN_MS);
    return { x: mid + (x - mid) * e, a: e };
  };

  let raf = 0;
  const frame = (now) => {
    raf = 0;
    const dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    const was = pos;
    pos += (target - pos) * (still ? 1 : 1 - Math.pow(1 - (drag ? 0.3 : 0.1), dt / 16.7));
    if (Math.abs(target - pos) < 0.05) pos = target;
    speed += (Math.abs(pos - was) / dt - speed) * 0.2;   // px per ms, smoothed

    const placed = cards.map((c, i) => {
      const xu = left + i * (cw + gap) - pos;
      const xw = wrap(xu);
      const en = entrance(i, xw, now);
      // the row starts at the first project: the end of the loop, brought
      // round to its left, stays away until the row is taken back past it
      if (xw < xu - 1) en.a *= Math.min(1, Math.max(0, -pos / ((cw + gap) * 0.6)));
      const t = place(en.x);
      // the first card comes in turned no further than edge-on
      if (en.first) t.r = Math.max(-84, Math.min(84, t.r));
      t.s *= 0.7 + 0.3 * en.a;
      t.a = en.a;
      // while fanning out, a card stays behind the ones already in place
      t.order = t.n + (1 - en.a) * 3;
      c.el.style.opacity = en.a < 1 ? en.a.toFixed(3) : '';
      c.el.style.visibility = en.a > 0.001 ? '' : 'hidden';
      c.el.style.transform = `translate3d(${t.x.toFixed(1)}px,0,0) perspective(${persp.toFixed(0)}px) rotateY(${t.r.toFixed(2)}deg) scale(${t.s.toFixed(4)})`;
      c.el.style.zIndex = 100 - Math.round(t.n * 10);
      return { c, t };
    });
    // the arrival is settled before the name, so the frame it ends on (the
    // last one before the loop sleeps) already shows the first project's
    const flying = arrive > 0 && now - arrive < Math.max(FLY_MS, OPEN_AT + OPEN_STAGGER * 3 + OPEN_MS);
    if (arrive > 0 && !flying) arrive = -1;
    paint(placed);
    name(placed);
    if (flying || pos !== target || speed > 0.002) raf = requestAnimationFrame(frame);
    else { speed = 0; last = 0; }
  };
  const draw = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // the name of the project nearest the middle, bottom-right, scrambling
  // over to the next as another takes the middle
  let shown = -1;
  const scramble = nameEl && typeof ScrambleText === 'function' ? new ScrambleText(nameEl) : null;
  const name = (placed) => {
    if (!nameEl || arrive > 0) return;
    let best = placed[0];
    placed.forEach((q) => { if (q.t.n < best.t.n) best = q; });
    const pi = best.c.project;
    if (pi === shown) return;
    shown = pi;
    dots.forEach((d, i) => d.classList.toggle('is-active', i === pi));
    const text = PROJECTS[pi].name;
    if (scramble && !still) {
      scramble.originalText = text;
      scramble.run();
    } else nameEl.textContent = text;
  };

  // ---- WebGL: the cards, over the glow ----
  let gl = null;
  if (glCanvas && !still) gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  let cardProg, cardBuf, aniso;
  const texFor = [];          // a texture per project, shared by its repeats
  const program = (vs, fs) => {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const pr = gl.createProgram();
    gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
    return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null;
  };
  const newTex = (mip) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mip && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  };
  if (gl) {
    // a card: its corners already placed in perspective (clip space, with w
    // for perspective-correct texturing)
    cardProg = program(`attribute vec4 p; attribute vec2 uv; varying vec2 v;
      void main(){ v = uv; gl_Position = p; }`, `precision mediump float;
      uniform sampler2D t; uniform float alpha; varying vec2 v;
      void main(){ gl_FragColor = texture2D(t, v) * alpha; }`);
    if (!cardProg) gl = null;
  }
  if (gl) {
    aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    cardBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cards.length * 4 * 6 * 4, gl.DYNAMIC_DRAW);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    PROJECTS.forEach((p, i) => { texFor[i] = newTex(true); });
  }

  // each project drawn as its card looks — still, caption — onto a
  // power-of-two canvas (so it can be mipmapped and stay clean as it turns
  // away), with a clear rim so the turned edges come out smooth
  const PAD = 2;
  let sized = '';
  const paintCard = (pi) => {
    if (!gl) return;
    const c = cards[pi];
    const img = c.img;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const TW = (cw + PAD * 2) * dpr > 1100 ? 2048 : 1024, TH = (ch + PAD * 2) * dpr > 1100 ? 2048 : 1024;
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const x = cv.getContext('2d');
    const sx = TW / (cw + PAD * 2), sy = TH / (ch + PAD * 2);
    x.setTransform(sx, 0, 0, sy, sx * PAD, sy * PAD);
    // the card's soft corners
    const rad = Math.max(6, 10 * u);
    x.beginPath();
    if (x.roundRect) x.roundRect(0, 0, cw, ch, rad); else x.rect(0, 0, cw, ch);
    x.clip();
    x.fillStyle = '#d9d9d9';
    x.fillRect(0, 0, cw, ch);
    if (img.complete && img.naturalWidth) {
      const k = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = cw / k, h = ch / k;
      x.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, cw, ch);
    }
    const capEl = c.el.querySelector('.wcard__cap');
    const cs = getComputedStyle(capEl);
    const [name, year] = [...capEl.children].map((s) => s.textContent.toUpperCase());
    x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    x.fillStyle = cs.color;
    x.textBaseline = 'bottom';
    x.shadowColor = 'rgba(0,0,0,.45)';
    x.shadowBlur = 8 * sx;
    x.shadowOffsetY = 1 * sy;
    x.textAlign = 'left';
    x.fillText(name, 16, ch - 14);
    x.textAlign = 'right';
    x.fillText(year, cw - 16, ch - 14);
    gl.bindTexture(gl.TEXTURE_2D, texFor[pi]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  const paintCards = () => PROJECTS.forEach((p, i) => paintCard(i));

  const sizeGl = () => {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(vw * dpr), h = Math.round(vh * dpr);
    if (`${w}x${h}` === sized) return;
    sized = `${w}x${h}`;
    glCanvas.width = w; glCanvas.height = h;
  };

  // a point on a card (dx, dy from its middle) to clip space, as the CSS 3D
  // stands it: scaled and turned (rotateY) about its middle, seen through
  // its own perspective from its middle, moved along to x
  const verts = new Float32Array(cards.length * 4 * 6);
  const corner = (o, t, dx, dy, s, v) => {
    const r = t.r * Math.PI / 180;
    const Z = -dx * t.s * Math.sin(r);
    const k = persp / (persp - Z);
    const px = t.x + cw / 2 + dx * t.s * Math.cos(r) * k;
    const py = top + ch / 2 + dy * t.s * k;
    const w = 1 / k;
    verts[o] = (px / vw * 2 - 1) * w;
    verts[o + 1] = (1 - py / vh * 2) * w;
    verts[o + 2] = 0;
    verts[o + 3] = w;
    verts[o + 4] = s;
    verts[o + 5] = v;
  };

  const paint = (placed) => {
    if (!gl) return;
    const W = glCanvas.width, H = glCanvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // the cards, furthest first
    const hw = cw / 2 + PAD, hh = ch / 2 + PAD;
    placed.forEach(({ t }, i) => {
      const o = i * 24;
      corner(o, t, -hw, -hh, 0, 1);
      corner(o + 6, t, hw, -hh, 1, 1);
      corner(o + 12, t, -hw, hh, 0, 0);
      corner(o + 18, t, hw, hh, 1, 0);
    });
    gl.useProgram(cardProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    const lp = gl.getAttribLocation(cardProg, 'p'), lu = gl.getAttribLocation(cardProg, 'uv');
    gl.enableVertexAttribArray(lp);
    gl.enableVertexAttribArray(lu);
    gl.vertexAttribPointer(lp, 4, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 24, 16);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const uAlpha = gl.getUniformLocation(cardProg, 'alpha');
    placed
      .map((q, i) => ({ i, n: q.t.n, order: q.t.order, a: q.t.a, pi: q.c.project }))
      .filter((q) => q.n < 3.2 && q.a > 0.001)
      .sort((a, b) => b.order - a.order)
      .forEach((q) => {
        gl.uniform1f(uAlpha, q.a);
        gl.bindTexture(gl.TEXTURE_2D, texFor[q.pi]);
        gl.drawArrays(gl.TRIANGLE_STRIP, q.i * 4, 4);
      });
    gl.disableVertexAttribArray(lp);
    gl.disableVertexAttribArray(lu);
    gl.disable(gl.BLEND);

    sticky.classList.add('is-gl');
  };

  let resizeT = 0;
  const refresh = () => {
    measure();
    sizeGl();
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { paintCards(); draw(); }, 120);
    draw();
  };
  measure();
  sizeGl();
  paintCards();
  draw();
  window.addEventListener('resize', refresh);
  // each still as it comes in, and the captions again once the face is in
  cards.slice(0, PROJECTS.length).forEach((c, i) => {
    if (!c.img.complete) c.img.addEventListener('load', () => { paintCard(i); draw(); }, { once: true });
  });
  if (document.fonts) document.fonts.ready.then(() => { measure(); paintCards(); draw(); });

  // fly in once the page has opened to full screen
  if (!still) {
    Promise.resolve(window.pageReady).then(() => {
      arrive = performance.now();
      draw();
    });
  }
})();
