// ---------- Tracking FX: an ASCII clip under square trackers ----------
// The clip is redrawn as ASCII — one character per cell, picked by brightness
// from a density ramp and tinted with the colour under it — over a dimmed copy
// of the clip, while a few white squares chase its brightest spots.
//
// Markup: a <video> and a <canvas> stacked in the same box. The video stays a
// real element underneath (the source for sampling); the canvas draws the
// characters and the squares over it. If the video is scaled up in CSS to fill
// its box, pass the same factor as `zoom` so the sampling lines up.
//
//   const fx = new TrackingFX(videoEl, canvasEl, { cell: 6, zoom: 1.8 });
//   fx.setEnabled(false);   // stop drawing (and playing) while it isn't seen

class TrackingFX {
  constructor(video, canvas, opts = {}) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = {
      cell: 16,            // grid pitch in CSS px
      zoom: 1,             // how far the clip is scaled up inside its box
      threshold: 0.12,     // brightness a cell needs before it gets a character
      ramp: ' .:-=+*#%@',  // dark → bright
      clipOpacity: 0.35,   // the clip left showing under the characters
      trackers: 4,
      squareScale: 1,      // tracker squares scale with this
      ...opts,
    };

    // the frame is sampled at one pixel per cell
    this.sample = document.createElement('canvas');
    this.sctx = this.sample.getContext('2d', { willReadFrequently: true });

    this.trackers = Array.from({ length: this.o.trackers }, () => ({
      x: 0, y: 0, tx: 0, ty: 0, s: 0, ts: 0, filled: false,
    }));
    this.nextRetarget = 0;
    this.enabled = true;
    this.visible = false;
    this.running = false;

    this.video.style.opacity = String(this.o.clipOpacity);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // only spend frames while the piece is on screen
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.sync(); })
      .observe(canvas);
  }

  setEnabled(on) {
    if (this.enabled === on) return;
    this.enabled = on;
    this.sync();
  }

  sync() {
    const go = this.enabled && this.visible;
    if (go && !this.running) {
      this.running = true;
      this.video.play().catch(() => {});
      requestAnimationFrame(this.frame);
    } else if (!go && this.running) {
      this.running = false;
      this.video.pause();
    }
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.cols = Math.ceil(r.width / this.o.cell);
    this.rows = Math.ceil(r.height / this.o.cell);
    this.sample.width = this.cols;
    this.sample.height = this.rows;
  }

  // the part of the clip the box actually shows (object-fit:cover, then zoom)
  crop() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const s = Math.max(this.w / vw, this.h / vh) * this.o.zoom;
    const cw = this.w / s, ch = this.h / s;
    return [(vw - cw) / 2, (vh - ch) / 2, cw, ch];
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const v = this.video;
    if (v.readyState < 2 || !this.cols) return;

    const [sx, sy, sw, sh] = this.crop();
    this.sctx.drawImage(v, sx, sy, sw, sh, 0, 0, this.cols, this.rows);
    const px = this.sctx.getImageData(0, 0, this.cols, this.rows).data;

    const { ctx, dpr } = this;
    const cell = this.o.cell;
    const ramp = this.o.ramp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = `500 ${Math.max(5, Math.round(cell * 1.1))}px "Roboto Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---------- ASCII ----------
    const bright = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const i = (row * this.cols + col) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum < this.o.threshold) continue;
        if (lum > 0.45) bright.push([col, row, lum]);
        const n = (lum - this.o.threshold) / (1 - this.o.threshold);
        const ch = ramp[Math.min(ramp.length - 1, 1 + Math.floor(n * (ramp.length - 1)))];
        // lift the colour so thin characters still read against the black
        const k = 255 / Math.max(r, g, b, 1);
        const lift = 0.6 + lum * 0.4;
        ctx.fillStyle = `rgb(${Math.min(255, r * k * lift + lum * 60) | 0},${Math.min(255, g * k * lift + lum * 60) | 0},${Math.min(255, b * k * lift + lum * 60) | 0})`;
        ctx.fillText(ch, col * cell + cell / 2, row * cell + cell / 2);
      }
    }

    // ---------- square trackers ----------
    if (now > this.nextRetarget) {
      this.retarget(bright);
      this.nextRetarget = now + 600 + Math.random() * 700;
    }
    const L = 0.16;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    this.trackers.forEach((tr) => {
      tr.x += (tr.tx - tr.x) * L; tr.y += (tr.ty - tr.y) * L; tr.s += (tr.ts - tr.s) * L;
      const x = Math.round(tr.x - tr.s / 2) + 0.5, y = Math.round(tr.y - tr.s / 2) + 0.5;
      if (tr.filled) {
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.fillRect(x, y, tr.s, tr.s);
      }
      ctx.strokeRect(x, y, tr.s, tr.s);
    });
  }

  // each square jumps to a fresh bright spot, kept apart from the others
  retarget(bright) {
    const cell = this.o.cell, k = this.o.squareScale;
    const pool = bright.sort((a, b) => b[2] - a[2]).slice(0, Math.max(30, bright.length * 0.3 | 0));
    const taken = [];
    this.trackers.forEach((tr) => {
      let pick = null;
      for (let tries = 0; tries < 12 && pool.length; tries++) {
        const c = pool[Math.floor(Math.random() * pool.length)];
        const x = c[0] * cell + cell / 2, y = c[1] * cell + cell / 2;
        if (taken.every(([ax, ay]) => Math.hypot(ax - x, ay - y) > 24 * k)) { pick = [x, y]; break; }
      }
      if (!pick) pick = [this.w * (0.35 + Math.random() * 0.3), this.h * (0.35 + Math.random() * 0.3)];
      taken.push(pick);
      tr.tx = pick[0]; tr.ty = pick[1];
      const big = Math.random() < 0.3;
      tr.ts = (big ? 34 + Math.random() * 20 : 10 + Math.random() * 12) * k;
      tr.filled = big && Math.random() < 0.6;
      if (!tr.s) { tr.x = tr.tx; tr.y = tr.ty; tr.s = tr.ts; }
    });
  }
}
