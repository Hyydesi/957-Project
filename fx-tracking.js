// ---------- Tracking FX: the Core's ASCII butterfly ----------
// The clip in the Core's centre slot is redrawn as ASCII — one character per
// cell, tinted with the colour under it — keyed off its own flat background,
// with three red-tagged inspect boxes that hop between bright spots on the
// wings. Ported from the "The Core Bird Lab" artifact (settings saved
// 22/10/2026); the numbers below are that lab's JSON, so retune there and copy
// the new values back rather than editing them by feel.
//
// How it sits in the page:
// · the <video> (.cf__panel-video) stays the source — script.js still sets its
//   playback rate from the scroll speed and its --cf-rise / --cf-lag / --cf-tilt
//   from the scroll; it is just made invisible (styles.css), and this reads
//   those three values back to place the drawing. Under reduced motion
//   script.js swaps the video for a still canvas of the same class; that is
//   sampled the same way.
// · the drawing is a square "clip" (as wide as the slot allows, at most 56vh)
//   that follows the butterfly round the frame, rendered off-screen and then
//   laid into the slot raised, kicked and banked like the old clip was. The
//   inspect boxes, their tags and leader lines are drawn after that, upright.
// · only runs while the slot is on screen.

const CORE_ASCII = {
  // characters
  cell: 6,                 // grid pitch in CSS px
  ramp: ' .:-=+*#%@',      // dark → bright; the first is an empty cell
  threshold: 0.09,         // brightness a keyed cell needs before it gets a character
  flicker: 12.5,           // times a second each cell scrambles to a random character
  scrambleMix: 1,          // share of cells that scramble on each beat
  liftBase: 0.7,           // how far a cell's colour is lifted so thin glyphs still read
  clipOpacity: 0.2,        // the keyed clip left showing under the characters
  // inspect boxes (the Signal Cards "saved" hybrid follow, a bright wing spot as the cursor)
  boxes: 3,
  spawnDist: 370,          // px the followed spot has to travel to drop the head box
  retargetMin: 0.3, retargetMax: 0.5,  // s between hops to a new bright spot (each hop drops a box)
  boxMinW: 50, boxMaxW: 120, boxMinH: 50, boxMaxH: 120,
  snap: 20,                // box position/size grid, px
  stiff: 5, damp: 0.6,     // spring the boxes slide on
  borderW: 0.5, lineW: 1, appearDur: 0.4, labelSize: 8,
  ink: '#d80000', inkText: '#ffffff',  // tag colour "red"
  // camera and key
  camSmooth: 2.5,          // /s the crop drifts toward the butterfly
  keyThreshold: 0.06, keySoft: 0.06,   // distance from the corner colour that counts as subject
  clipSize: 0.56,          // clip side as a share of the viewport height (never wider than the slot)
  keepMargin: 0.1,         // room kept between the butterfly and the clip's edge
  edgeFade: 0.01,          // characters fade out over this share of the clip at its edges
  // halo round the butterfly
  haloSize: 1.6, strayDensity: 0.25, strayAlpha: 0.5,
  trail: 0.15,             // s a cell the butterfly just left takes to fade out
};

class TrackingFX {
  constructor(panel, canvas, opts = {}) {
    this.panel = panel;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = { ...CORE_ASCII, ...opts };
    this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // off-screen: the clip square, a 96px analysis frame, one pixel per cell, the keyed under-layer
    this.clip = document.createElement('canvas');
    this.cctx = this.clip.getContext('2d');
    this.ana = document.createElement('canvas');
    this.ana.width = this.ana.height = 96;
    this.actx = this.ana.getContext('2d', { willReadFrequently: true });
    this.smp = document.createElement('canvas');
    this.sctx = this.smp.getContext('2d', { willReadFrequently: true });
    this.under = document.createElement('canvas');
    this.uctx = this.under.getContext('2d');

    this.bg = null; this.cam = null; this.zoom = 1;
    this.cells = null; this.trailA = null;
    this.centroid = null; this.birdR = { x: 1, y: 1 };
    this.boxes = []; this.focus = null; this.t = 0;
    this.visible = false; this.running = false; this.last = 0;

    this.frame = this.frame.bind(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.sync(); })
      .observe(canvas);
  }

  // the video, or the still canvas script.js puts in its place under reduced motion
  source() { return this.panel.querySelector('.cf__panel-video'); }

  sync() {
    if (this.visible && !this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    } else if (!this.visible) {
      this.running = false;
    }
  }

  resize() {
    // the canvas covers the section; the clip is sized from the slot's layout
    // width (not its rect: the slot drifts on a transform)
    const box = this.canvas.parentElement;
    const r = { width: box.offsetWidth, height: box.offsetHeight };
    const slotW = this.panel.offsetWidth;
    if (!r.width || !r.height || !slotW) return;
    const o = this.o;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    // no wider than the slot, so it lines up with the column between the words
    this.clipPx = Math.max(40, Math.round(Math.min(window.innerHeight * o.clipSize, slotW)));
    this.cols = this.rows = Math.max(4, Math.ceil(this.clipPx / o.cell));
    this.clip.width = this.clip.height = Math.round(this.clipPx * this.dpr);
    this.smp.width = this.under.width = this.cols;
    this.smp.height = this.under.height = this.rows;
    this.cells = null;
    this.trailA = new Float32Array(this.cols * this.rows);
    this.boxes = []; this.focus = null;
  }

  // 1 where the subject is, 0 on the background (the mean of the first frame's corners)
  key(r, g, b, a) {
    if (a < 128 || !this.bg) return 0;
    const d = Math.hypot(r - this.bg[0], g - this.bg[1], b - this.bg[2]) / 441;
    return Math.min(1, Math.max(0, (d - this.o.keyThreshold) / Math.max(0.001, this.o.keySoft)));
  }

  // centroid and bounds of the subject, in source px, from a 96 × 96 read
  analyse(src, vw, vh) {
    const A = this.actx;
    A.clearRect(0, 0, 96, 96);
    A.drawImage(src, 0, 0, 96, 96);
    const px = A.getImageData(0, 0, 96, 96).data;
    if (!this.bg) {
      const corners = [0, 95, 95 * 96, 96 * 96 - 1].map((i) => i * 4);
      this.bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + px[i + c], 0) / 4);
    }
    let sx = 0, sy = 0, sw = 0, minX = 96, minY = 96, maxX = 0, maxY = 0;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 4;
      const a = this.key(px[i], px[i + 1], px[i + 2], px[i + 3]);
      if (a < 0.5) continue;
      sx += x * a; sy += y * a; sw += a;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (sw < 2) return null;
    const kx = vw / 96, ky = vh / 96;
    return {
      x: (sx / sw + 0.5) * kx, y: (sy / sw + 0.5) * ky,
      rx: (maxX - minX + 1) / 2 * kx, ry: (maxY - minY + 1) / 2 * ky,
      x0: minX * kx, x1: (maxX + 1) * kx, y0: minY * ky, y1: (maxY + 1) * ky,
    };
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const src = this.source();
    if (!src || !this.cols) return;
    const vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
    if (!vw || (src.readyState !== undefined && src.readyState < 2)) return;
    this.t += dt;

    // where script.js has put the clip this frame: the slot's centre (it drifts
    // with the field), raised, kicked, and lowered while it flies in
    const st = src.style;
    const num = (name) => parseFloat(st.getPropertyValue(name)) || 0;
    const pr = this.panel.getBoundingClientRect(), cr = this.canvas.getBoundingClientRect();
    const xf = {
      cx: pr.left - cr.left + pr.width / 2,
      // desktop: the middle of the pinned section (= the screen); phones: the slot's centre
      cy: (window.innerWidth >= 720 ? this.h / 2 : pr.top - cr.top + pr.height / 2)
        + num('--cf-rise') + num('--cf-lag') + num('--cf-enter'),
      ang: num('--cf-tilt') * Math.PI / 180,
      half: this.clipPx / 2,
    };

    this.drawClip(src, vw, vh, dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(xf.cx, xf.cy);
    ctx.rotate(xf.ang);
    ctx.drawImage(this.clip, -xf.half, -xf.half, this.clipPx, this.clipPx);
    ctx.restore();
    // inspect boxes: the bright reading inside goes into the (banked) clip, the frames upright on top
    this.stepBoxes(dt);
    const rects = this.boxRects(xf);
    this.drawLens(rects, xf);
    ctx.save();
    ctx.translate(xf.cx, xf.cy);
    ctx.rotate(xf.ang);
    ctx.drawImage(this.lensLayer, -xf.half, -xf.half, this.clipPx, this.clipPx);
    ctx.restore();
    this.drawFrames(rects);
  }

  // the clip square: camera, characters, halo
  drawClip(src, vw, vh, dt) {
    const o = this.o, ctx = this.cctx, cp = this.clipPx, cell = o.cell, cols = this.cols, rows = this.rows;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cp, cp);

    // camera: drift toward the butterfly, but never let it past the margin; back off the
    // zoom (fast) when the wings spread too wide for it, creep back (slow) when they fold
    const found = this.analyse(src, vw, vh);
    let zTarget = 1;
    if (found) {
      const need = Math.max(found.x1 - found.x0, found.y1 - found.y0) / Math.max(0.2, 1 - 2 * o.keepMargin);
      zTarget = Math.max(1, Math.min(1, Math.min(vw, vh) / need));
    }
    this.zoom += (zTarget - this.zoom) * (1 - Math.exp(-dt * (zTarget < this.zoom ? 20 : 1.5)));
    const cropW = vw / this.zoom, cropH = vh / this.zoom;
    const target = found ? { x: found.x, y: found.y } : (this.cam || { x: vw / 2, y: vh / 2 });
    if (!this.cam) this.cam = { ...target };
    else {
      const f = 1 - Math.exp(-dt * o.camSmooth);
      this.cam.x += (target.x - this.cam.x) * f; this.cam.y += (target.y - this.cam.y) * f;
    }
    const contain = (c, lo, hi, half) => (hi - lo > half * 2 ? (lo + hi) / 2 : Math.min(Math.max(c, hi - half), lo + half));
    if (found) {
      this.cam.x = contain(this.cam.x, found.x0, found.x1, cropW / 2 * (1 - 2 * o.keepMargin));
      this.cam.y = contain(this.cam.y, found.y0, found.y1, cropH / 2 * (1 - 2 * o.keepMargin));
    }
    const sx = this.cam.x - cropW / 2, sy = this.cam.y - cropH / 2;
    if (found) {
      this.centroid = { x: (found.x - sx) / cropW * cols, y: (found.y - sy) / cropH * rows };
      this.birdR = { x: Math.max(2, found.rx / cropW * cols), y: Math.max(2, found.ry / cropH * rows) };
    }

    // one pixel per cell
    const sc = this.sctx;
    sc.clearRect(0, 0, cols, rows);
    sc.drawImage(src, sx, sy, cropW, cropH, 0, 0, cols, rows);
    const px = sc.getImageData(0, 0, cols, rows).data;

    const ramp = o.ramp, n = cols * rows;
    if (!this.cells || this.cells.length !== n) this.cells = Array.from({ length: n }, () => ({ a: 0, lum: 0, r: 0, g: 0, b: 0, show: 0, idx: 0 }));
    const cells = this.cells;
    const decay = o.trail > 0 ? Math.exp(-dt / o.trail) : 0;
    const c0 = this.centroid || { x: cols / 2, y: rows / 2 };
    const hx = this.birdR.x * o.haloSize, hy = this.birdR.y * o.haloSize;
    const flick = this.still ? 0 : o.flicker;
    const t = this.t, fadeCells = o.edgeFade * cols;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col, p = i * 4;
        const r = px[p], g = px[p + 1], b = px[p + 2];
        let a = this.key(r, g, b, px[p + 3]);
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        // a cell the butterfly just left fades out instead of switching off
        if (o.trail > 0) { this.trailA[i] = Math.max(a, this.trailA[i] * decay); a = this.trailA[i]; }
        const ef = fadeCells > 0 ? Math.min(1, Math.min(col, row, cols - 1 - col, rows - 1 - row) / fadeCells) : 1;
        a *= ef;
        const ce = cells[i];
        ce.a = a; ce.lum = lum; ce.r = r; ce.g = g; ce.b = b;
        let show = 0, nGlyph = 0;
        if (a > 0.04 && lum >= o.threshold) { show = a; nGlyph = (lum - o.threshold) / (1 - o.threshold); }
        // stray characters in an ellipse round the butterfly
        const d = Math.hypot((col + 0.5 - c0.x) / hx, (row + 0.5 - c0.y) / hy);
        if (d < 1 && o.strayDensity > 0) {
          const fall = 1 - d;
          const epoch = Math.floor(t * Math.max(flick, 0.5) + rnd(i, 3) * 7);
          if (rnd(i, epoch, 11) < o.strayDensity * fall) {
            const v = o.strayAlpha * fall * 0.7;
            if (v > show) { show = v; nGlyph = 0.1 + rnd(i, epoch, 12) * 0.5; }
          }
        }
        show *= ef;
        if (show < 0.03) { ce.show = 0; continue; }
        let idx = Math.min(ramp.length - 1, 1 + Math.floor(Math.min(1, Math.max(0, nGlyph)) * (ramp.length - 1)));
        // scramble: any character but the empty one, each cell on its own beat
        if (flick > 0) {
          const ep = Math.floor(t * flick + rnd(i, 5) * 7);
          if (rnd(i, ep, 17) < o.scrambleMix) idx = 1 + Math.floor(rnd(i, ep, 19) * (ramp.length - 1));
        }
        ce.show = show; ce.idx = idx;
      }
    }

    // the keyed clip, faintly, under the characters
    if (o.clipOpacity > 0) {
      const img = this.uctx.createImageData(cols, rows);
      for (let i = 0; i < n; i++) { const ce = cells[i]; img.data.set([ce.r, ce.g, ce.b, Math.round(ce.a * 255)], i * 4); }
      this.uctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = o.clipOpacity;
      ctx.drawImage(this.under, 0, 0, cp, cp);
      ctx.globalAlpha = 1;
    }

    ctx.font = `500 ${Math.max(3, cell * 1.1)}px "Roboto Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const ce = cells[i];
      if (!ce.show) continue;
      ctx.globalAlpha = ce.show;
      ctx.fillStyle = this.color(ce);
      ctx.fillText(ramp[ce.idx], (i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + cell / 2);
    }
    ctx.globalAlpha = 1;
  }

  // the colour under a cell, lifted so thin characters still read on the black
  color(ce) {
    const k = 255 / Math.max(ce.r, ce.g, ce.b, 1);
    const lift = this.o.liftBase + ce.lum * (1 - this.o.liftBase);
    const ch = (v) => Math.min(255, v * k * lift + ce.lum * 60) | 0;
    return `rgb(${ch(ce.r)},${ch(ce.g)},${ch(ce.b)})`;
  }

  // ---------- inspect boxes ----------
  // The head box springs after a bright spot on the wings; every hop to a new
  // spot (or a long enough travel) drops it where it is and slides a new head
  // out of it; the oldest box goes. Clip-space px.
  boxSize(n) {
    const o = this.o, q = o.snap;
    const w = o.boxMinW + (o.boxMaxW - o.boxMinW) * rnd(97, n, 21);
    const h = o.boxMinH + (o.boxMaxH - o.boxMinH) * rnd(97, n, 22);
    return { w: Math.max(q * 2, Math.round(w / q) * q), h: Math.max(q * 2, Math.round(h / q) * q) };
  }

  // centred on the spot, snapped, never past the clip's edge
  boxAt(cx, cy, size) {
    const q = this.o.snap, cp = this.clipPx;
    const x = Math.min(Math.max(0, cx - size.w / 2), Math.max(0, cp - size.w));
    const y = Math.min(Math.max(0, cy - size.h / 2), Math.max(0, cp - size.h));
    return { x: Math.floor(x / q) * q, y: Math.floor(y / q) * q };
  }

  // a bright keyed cell, at least 40px from the last spot
  brightSpot(prev) {
    const cells = this.cells || [], cols = this.cols, cell = this.o.cell;
    const bright = [];
    for (let i = 0; i < cells.length; i++) { const ce = cells[i]; if (ce.a > 0.5 && ce.lum > 0.3) bright.push([i % cols, Math.floor(i / cols), ce.lum]); }
    const pool = bright.sort((a, b) => b[2] - a[2]).slice(0, Math.max(30, bright.length * 0.3 | 0));
    for (let tries = 0; tries < 12 && pool.length; tries++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const p = { x: c[0] * cell + cell / 2, y: c[1] * cell + cell / 2 };
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 40) return p;
    }
    return null;
  }

  stepBoxes(dt) {
    const o = this.o;
    if (!this.centroid || o.boxes <= 0) { this.boxes = []; return; }
    // under reduced motion the boxes are placed once and stay
    if (!this.focus || (!this.still && this.t >= this.nextFocus)) {
      const p = this.brightSpot(this.focus);
      if (p) {
        if (this.focus) this.forceSpawn = true;
        this.focus = p;
        this.nextFocus = this.t + o.retargetMin + (o.retargetMax - o.retargetMin) * Math.random();
      }
    }
    const cur = this.focus || { x: this.centroid.x * o.cell, y: this.centroid.y * o.cell };
    if (!this.boxes.length) {
      this.spawnN = 0;
      const size = this.boxSize(this.spawnN++), p = this.boxAt(cur.x, cur.y, size);
      this.boxes.push({ ...p, ...size, vx: 0, vy: 0, tx: p.x, ty: p.y, born: this.t });
      this.anchor = cur;
    }
    const head = this.boxes[0];
    ({ x: head.tx, y: head.ty } = this.boxAt(cur.x, cur.y, head));
    if ((this.forceSpawn || Math.hypot(cur.x - this.anchor.x, cur.y - this.anchor.y) >= o.spawnDist) && o.boxes > 1) {
      this.forceSpawn = false;
      const size = this.boxSize(this.spawnN++), p = this.boxAt(cur.x, cur.y, size);
      this.boxes.unshift({ x: head.x, y: head.y, ...size, vx: head.vx, vy: head.vy, tx: p.x, ty: p.y, born: this.t });
      this.anchor = cur;
    }
    this.boxes.length = Math.min(this.boxes.length, o.boxes);
    const k = o.stiff, c = 2 * o.damp * k;
    this.boxes.forEach((b) => {
      b.vx += ((b.tx - b.x) * k * k - b.vx * c) * dt;
      b.vy += ((b.ty - b.y) * k * k - b.vy * c) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
    });
  }

  // boxes in slot space, upright, centred where their clip-space box lands once the clip
  // is banked; they grow from the top-left corner; lx, ly = clip-space corner for the tag
  boxRects(xf) {
    const o = this.o;
    return this.boxes.map((b) => {
      const k = o.appearDur > 0 ? Math.min(1, (this.t - b.born) / o.appearDur) : 1;
      const g = 1 - (1 - k) * (1 - k);
      const c = toSlot(xf, b.x + b.w / 2, b.y + b.h / 2);
      return { x: Math.round(c.x - b.w / 2), y: Math.round(c.y - b.h / 2), w: Math.round(b.w * g), h: Math.round(b.h * g), lx: b.x, ly: b.y };
    });
  }

  // the brighter, bolder reading inside each box, drawn in clip space (so it banks with
  // the butterfly) and clipped to the upright box carried back into the clip
  drawLens(rects, xf) {
    const o = this.o, cell = o.cell, cols = this.cols, cells = this.cells, ramp = o.ramp;
    if (!this.lensLayer) { this.lensLayer = document.createElement('canvas'); this.lctx = this.lensLayer.getContext('2d'); }
    const L = this.lensLayer, ctx = this.lctx;
    if (L.width !== this.clip.width) { L.width = this.clip.width; L.height = this.clip.height; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.clipPx, this.clipPx);
    if (!cells) return;
    ctx.font = `700 ${Math.max(3, cell * 1.25)}px "Roboto Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of rects) {
      if (r.w <= 0 || r.h <= 0) continue;
      const poly = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => toClip(xf, x, y));
      ctx.save();
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath(); ctx.clip();
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
      const c1 = Math.max(0, Math.floor(Math.min(...xs) / cell)), c2 = Math.min(cols - 1, Math.floor(Math.max(...xs) / cell));
      const r1 = Math.max(0, Math.floor(Math.min(...ys) / cell)), r2 = Math.min(this.rows - 1, Math.floor(Math.max(...ys) / cell));
      for (let row = r1; row <= r2; row++) for (let col = c1; col <= c2; col++) {
        const ce = cells[row * cols + col];
        if (!ce || ce.a < 0.05) continue;
        ctx.globalAlpha = Math.min(1, (0.35 + ce.lum * 0.8) * ce.a);
        ctx.fillStyle = this.color({ ...ce, lum: Math.min(1, ce.lum + 0.25) });
        ctx.fillText(ramp[Math.min(ramp.length - 1, ce.idx + 1) || ramp.length - 1], col * cell + cell / 2, row * cell + cell / 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // frames, tags and leader lines, upright in the slot
  drawFrames(rects) {
    const o = this.o, ctx = this.ctx;
    if (!rects.length) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = o.ink; ctx.lineWidth = o.lineW; ctx.globalAlpha = 0.9;
    for (let i = 0; i < rects.length - 1; i++) {
      const [p, q] = nearestCorners(rects[i], rects[i + 1]);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = `500 ${o.labelSize}px "Roboto Mono", monospace`;
    const bw = o.borderW;
    for (const r of rects) {
      ctx.strokeStyle = o.ink; ctx.lineWidth = bw;
      // drawn inside the box, so the border never grows it
      if (r.w > bw && r.h > bw) ctx.strokeRect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw);
      // the tag shows from the first frame, while the box is still growing
      const label = `${Math.round(r.lx)}, ${Math.round(r.ly)}`;
      const pad = 4, lw = ctx.measureText(label).width + pad * 2, lh = o.labelSize + 5;
      ctx.fillStyle = o.ink; ctx.fillRect(r.x, r.y, lw + bw, lh + bw);
      ctx.fillStyle = o.inkText; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + bw + pad, r.y + bw + lh / 2 + 0.5);
    }
  }
}

// clip space ↔ slot space (the clip is centred at xf.cx, xf.cy and banked by xf.ang)
function toSlot(xf, qx, qy) {
  const dx = qx - xf.half, dy = qy - xf.half, c = Math.cos(xf.ang), s = Math.sin(xf.ang);
  return { x: xf.cx + dx * c - dy * s, y: xf.cy + dx * s + dy * c };
}
function toClip(xf, px, py) {
  const dx = px - xf.cx, dy = py - xf.cy, c = Math.cos(xf.ang), s = Math.sin(xf.ang);
  return { x: xf.half + dx * c + dy * s, y: xf.half - dx * s + dy * c };
}

// the two closest corners of two boxes, for the leader line between them
function nearestCorners(a, b) {
  const ca = [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]];
  const cb = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
  let best = null, bd = Infinity;
  for (const p of ca) for (const q of cb) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = [p, q]; } }
  return best;
}

// seeded noise per cell and beat, so a scramble or a stray holds still between beats
function rnd(a, b, c = 0) {
  const h = (v) => {
    let x = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  };
  return (h(h(h(a | 0) ^ (b | 0)) ^ (c | 0)) % 100003) / 100003;
}

(function coreAscii() {
  const panel = document.querySelector('#cfField .cf__panel');
  const canvas = document.getElementById('cfPanelAscii');
  if (panel && canvas) new TrackingFX(panel, canvas);
})();
