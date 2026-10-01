// ---------- Footer wordmark heat map (hover) ----------
// The pointer warms the NINEFIVE / SEVEN marks like a thermal camera: heat
// builds where it moves, spreads a little and cools off once it leaves. Heat
// only shows inside the letters (a softened copy of their shape), and is read
// through a neon ramp, so the cooler rim of a warm patch runs indigo → pink →
// yellow and its hot core cyan → blue.
//
// Everything runs on a coarse grid (about 70 cells down the marks); the canvas
// is that small and CSS stretches it over them, so the browser's smoothing
// gives the soft, blurred look for free. Sizes below are fractions of the
// marks' height, so the effect reads the same on a phone and a wide screen.
(function footerHeat() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ROWS = 70;         // grid cells down the marks
  const SPREAD = 0.17;     // splat radius (sigma)
  const MASK_BLUR = 0.012; // how far the letter shape is softened
  const COOL = 0.972;      // heat kept per frame
  const DIFFUSE = 0.18;    // share of each cell traded with its neighbours per frame

  // neon ramp: [position, r, g, b]
  const STOPS = [
    [0.00, 58, 43, 217],
    [0.25, 255, 47, 110],
    [0.50, 255, 212, 71],
    [0.72, 59, 232, 224],
    [1.00, 31, 91, 255],
  ];
  const RAMP = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [p0, ...a] = STOPS[k];
    const [p1, ...b] = STOPS[k + 1];
    const f = Math.min(1, Math.max(0, (t - p0) / (p1 - p0)));
    for (let c = 0; c < 3; c++) RAMP[i * 3 + c] = a[c] + (b[c] - a[c]) * f;
  }

  // two passes of a separable box blur, in place
  function blur(src, w, h, r) {
    const tmp = new Float32Array(src.length);
    const pass = (from, to, horizontal) => {
      const n = horizontal ? w : h;
      const lines = horizontal ? h : w;
      for (let l = 0; l < lines; l++) {
        let sum = 0;
        const at = (i) => (horizontal ? l * w + i : i * w + l);
        for (let i = -r; i <= r; i++) sum += from[at(Math.min(n - 1, Math.max(0, i)))];
        for (let i = 0; i < n; i++) {
          to[at(i)] = sum / (2 * r + 1);
          sum += from[at(Math.min(n - 1, i + r + 1))] - from[at(Math.max(0, i - r))];
        }
      }
    };
    for (let k = 0; k < 2; k++) { pass(src, tmp, true); pass(tmp, src, false); }
  }

  // where an <img> actually paints inside its box (object-fit: contain on home)
  function paintedRect(img, box) {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    let x = r.left - box.left;
    let y = r.top - box.top;
    let w = r.width;
    let h = r.height;
    if (cs.objectFit === 'contain' && img.naturalWidth) {
      const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      const [px, py] = cs.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      x += (w - dw) * (isNaN(px) ? 0.5 : px);
      y += (h - dh) * (isNaN(py) ? 0.5 : py);
      w = dw;
      h = dh;
    }
    return { x, y, w, h };
  }

  function attach(name) {
    const imgs = [...name.querySelectorAll('img')];
    const canvas = document.createElement('canvas');
    canvas.className = 'sfooter__heat';
    canvas.setAttribute('aria-hidden', 'true');
    name.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let gw = 0, gh = 0, cell = 4, spread = 10;
    let mask = null, heat = null, next = null, frame = null;
    let pointer = null, last = null;
    let running = false;

    function build() {
      const box = name.getBoundingClientRect();
      const markH = Math.max(1, ...imgs.map((img) => paintedRect(img, box).h));
      cell = Math.min(4, Math.max(1, markH / ROWS));
      spread = SPREAD * markH / cell;
      gw = Math.max(1, Math.round(box.width / cell));
      gh = Math.max(1, Math.round(box.height / cell));
      canvas.width = gw;
      canvas.height = gh;

      // the letters' alpha at grid size, then softened
      const off = document.createElement('canvas');
      off.width = gw;
      off.height = gh;
      const octx = off.getContext('2d');
      imgs.forEach((img) => {
        if (!img.complete || !img.naturalWidth) return;
        const r = paintedRect(img, box);
        octx.drawImage(img, r.x / cell, r.y / cell, r.w / cell, r.h / cell);
      });
      const px = octx.getImageData(0, 0, gw, gh).data;
      mask = new Float32Array(gw * gh);
      for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] / 255;
      blur(mask, gw, gh, Math.max(1, Math.round(MASK_BLUR * markH / cell)));
      // full strength anywhere inside a stroke, however thin; only the
      // softened rim falls away
      for (let i = 0; i < mask.length; i++) {
        const t = Math.min(1, Math.max(0, (mask[i] - 0.08) / 0.42));
        mask[i] = t * t * (3 - 2 * t);
      }

      heat = new Float32Array(gw * gh);
      next = new Float32Array(gw * gh);
      frame = ctx.createImageData(gw, gh);
      ctx.clearRect(0, 0, gw, gh);
    }

    function splat(cx, cy, amount) {
      const r = Math.ceil(spread * 2.5);
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(gw - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(gh - 1, Math.ceil(cy + r));
      const k = 1 / (2 * spread * spread);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          const i = y * gw + x;
          heat[i] = Math.min(1.15, heat[i] + amount * Math.exp(-d * k));
        }
      }
    }

    function tick() {
      // warm along the path since the last frame, more the faster it moves
      if (pointer) {
        const from = last || pointer;
        const dist = Math.hypot(pointer.x - from.x, pointer.y - from.y);
        const steps = Math.max(1, Math.ceil(dist / (spread * 0.5)));
        const amount = Math.min(0.14, 0.03 + (dist / spread) * 0.06) / steps;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          splat(from.x + (pointer.x - from.x) * t, from.y + (pointer.y - from.y) * t, amount);
        }
        last = pointer;
      }

      // spread and cool
      let peak = 0;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x;
          const n = (heat[x > 0 ? i - 1 : i] + heat[x < gw - 1 ? i + 1 : i]
            + heat[y > 0 ? i - gw : i] + heat[y < gh - 1 ? i + gw : i]) / 4;
          const v = (heat[i] * (1 - DIFFUSE) + n * DIFFUSE) * COOL;
          next[i] = v;
          if (v > peak) peak = v;
        }
      }
      [heat, next] = [next, heat];

      // paint: heat inside the letters, read through the ramp
      const out = frame.data;
      for (let i = 0; i < heat.length; i++) {
        const m = mask[i];
        const v = Math.min(1, heat[i] * m);
        const o = i * 4;
        if (v < 0.01 || m < 0.02) { out[o + 3] = 0; continue; }
        const c = Math.round(v * 255) * 3;
        out[o] = RAMP[c];
        out[o + 1] = RAMP[c + 1];
        out[o + 2] = RAMP[c + 2];
        // fades in over the coolest stretch so the edge of a patch melts into
        // the mark, and out just past the letters' edges so the gaps stay dark
        const a = Math.min(1, (v - 0.01) / 0.12);
        out[o + 3] = a * a * (3 - 2 * a) * m * 255;
      }
      ctx.putImageData(frame, 0, 0);

      if (pointer || peak > 0.004) requestAnimationFrame(tick);
      else { running = false; ctx.clearRect(0, 0, gw, gh); }
    }

    const start = () => { if (!running) { running = true; requestAnimationFrame(tick); } };
    const toGrid = (e) => {
      const box = name.getBoundingClientRect();
      return { x: (e.clientX - box.left) / cell, y: (e.clientY - box.top) / cell };
    };

    name.addEventListener('pointermove', (e) => {
      if (!mask) return;
      pointer = toGrid(e);
      start();
    });
    name.addEventListener('pointerleave', () => { pointer = null; last = null; });

    // rebuild the letter shape whenever the band changes size (and once the
    // marks have loaded); any heat in flight starts over
    let queued = 0;
    const rebuild = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(build);
    };
    new ResizeObserver(rebuild).observe(name);
    imgs.forEach((img) => { if (!img.complete) img.addEventListener('load', rebuild, { once: true }); });
  }

  document.querySelectorAll('.sfooter__name').forEach(attach);
})();
