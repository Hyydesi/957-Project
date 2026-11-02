// ---------- Footer studio number: spelled in characters, click to break it apart ----------
// The 9 5 7 are drawn in random characters that keep changing and lean away from
// the pointer. Over them a small hint follows the pointer; a click makes the
// characters burst apart, drop to the floor of the strip and climb back into the
// numbers.
//
// Each lit pixel of the digit SVGs (28 x 34) is one character, so the shape
// reads the same at every size. The SVGs stay in the page to hold the layout and
// to show if this never runs. With reduced motion the characters simply stand still.
(function footerDigits() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CHARS = '0123456789#@&%+ABCDEFGHJKLMNPQRSTUVXYZ';
  const SCATTER_MS = 650;  // numbers to cloud
  const STAGGER_MS = 300;  // the latest character starts this much after the first
  const PAUSE_MS = 200;    // the cloud hangs for a moment before it drops
  const FALL_MS = 1100;
  const FORM_MS = 1000;
  const PUSH_RADIUS = 110; // how far the pointer reaches, in px
  const PUSH = 16;

  const randChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function attach(strip) {
    const footer = strip.closest('.sfooter');
    const hint = footer.querySelector('.sfooter__react-hint');
    const imgs = [...strip.querySelectorAll('img')];
    const canvas = document.createElement('canvas');
    canvas.className = 'sfooter__digits-canvas';
    strip.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, font = 10, minX = 0, gravity = 1;
    let parts = [];
    let phase = 'held';  // held, scatter, fall, form
    let phaseStart = 0;
    let raf = 0, lastTime = 0;
    let visible = false;
    let pointer = null;  // client coordinates, only while a mouse is over the strip
    let hintX = 0, hintY = 0;

    // read the numbers off the SVGs at their current size and place one character
    // on each lit pixel; rows cropped by the floor of the strip are left out
    function build() {
      if (imgs.some((img) => !img.complete || !img.naturalWidth)) return false;
      const box = strip.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = box.width;
      H = box.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gravity = H / 450;
      parts = [];

      imgs.forEach((img) => {
        const r = img.getBoundingClientRect();
        const cols = img.naturalWidth;
        const rows = img.naturalHeight;
        const unit = r.width / cols;
        const stride = unit < 5 ? 2 : 1;  // small screens: half as many, so they stay legible
        font = Math.round(unit * stride * 1.35);

        const off = document.createElement('canvas');
        off.width = cols;
        off.height = rows;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, cols, rows);
        const px = octx.getImageData(0, 0, cols, rows).data;

        for (let y = 0; y < rows; y++) {
          const ty = r.top - box.top + (y + 0.5) * unit;
          if (ty > H) break;
          for (let x = 0; x < cols; x += stride) {
            if (px[(y * cols + x) * 4 + 3] < 128) continue;
            const tx = r.left - box.left + (x + 0.5) * unit;
            parts.push({ ch: randChar(), x: tx, y: ty, tx, ty, fx: tx, fy: ty, sx: tx, sy: ty, vx: 0, vy: 0, delay: Math.random(), floor: 0 });
          }
        }
      });

      minX = (parseFloat(getComputedStyle(strip).paddingLeft) || 0) + font;  // clear of the rail
      return parts.length > 0;
    }

    function startScatter(e, now) {
      const box = strip.getBoundingClientRect();
      const cx = e.clientX - box.left;
      const cy = e.clientY - box.top;
      const reach = Math.min(H * 0.4, 130);
      parts.forEach((p) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * reach;
        // the ones nearest the click get thrown furthest
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const kick = Math.max(0, 1 - d / (reach * 3)) * reach;
        p.fx = p.x;
        p.fy = p.y;
        p.sx = clamp(p.x + Math.cos(angle) * dist + (dx / d) * kick, minX, W - font);
        p.sy = clamp(p.y + Math.sin(angle) * dist + (dy / d) * kick, font, H - font);
        p.floor = H - font * 0.7 - Math.random() ** 2 * font * 2.5;  // a low heap, not a line
      });
      phase = 'scatter';
      phaseStart = now;
    }

    function startFall(now) {
      parts.forEach((p) => {
        p.vx = (Math.random() - 0.5) * font * 0.5;
        p.vy = Math.random() * font * 0.2;
      });
      phase = 'fall';
      phaseStart = now;
    }

    function startForm(now) {
      parts.forEach((p) => { p.fx = p.x; p.fy = p.y; });
      phase = 'form';
      phaseStart = now;
    }

    function step(now, dt) {
      const elapsed = now - phaseStart;

      if (phase === 'scatter') {
        parts.forEach((p) => {
          const t = clamp((elapsed - p.delay * STAGGER_MS) / SCATTER_MS, 0, 1);
          const ease = 1 - (1 - t) ** 3;
          p.x = p.fx + (p.sx - p.fx) * ease;
          p.y = p.fy + (p.sy - p.fy) * ease;
          if (Math.random() < 0.05) p.ch = randChar();
        });
        if (elapsed >= SCATTER_MS + STAGGER_MS + PAUSE_MS) startFall(now);
      } else if (phase === 'fall') {
        parts.forEach((p) => {
          p.vy += gravity * dt;
          p.x = clamp(p.x + p.vx * dt, minX, W - font);
          p.y += p.vy * dt;
          if (p.y >= p.floor) {
            p.y = p.floor;
            p.vy *= -0.28;
            p.vx *= 0.8;
          }
          if (Math.random() < 0.02) p.ch = randChar();
        });
        if (elapsed >= FALL_MS) startForm(now);
      } else if (phase === 'form') {
        parts.forEach((p) => {
          const t = clamp((elapsed - p.delay * STAGGER_MS) / FORM_MS, 0, 1);
          const ease = 1 - (1 - t) ** 3;
          p.x = p.fx + (p.tx - p.fx) * ease;
          p.y = p.fy + (p.ty - p.fy) * ease;
          if (Math.random() < 0.02) p.ch = randChar();
        });
        if (elapsed >= FORM_MS + STAGGER_MS) phase = 'held';
      } else {
        const box = strip.getBoundingClientRect();
        const mx = pointer ? pointer.x - box.left : 0;
        const my = pointer ? pointer.y - box.top : 0;
        parts.forEach((p) => {
          if (pointer) {
            const dx = p.x - mx;
            const dy = p.y - my;
            const d = Math.hypot(dx, dy) || 1;
            if (d < PUSH_RADIUS) {
              const force = (1 - d / PUSH_RADIUS) ** 2 * PUSH * dt;
              p.x += (dx / d) * force;
              p.y += (dy / d) * force;
            }
          }
          p.x += (p.tx - p.x) * Math.min(1, 0.1 * dt);
          p.y += (p.ty - p.y) * Math.min(1, 0.1 * dt);
          if (Math.random() < 0.01) p.ch = randChar();
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = `${font}px 'Geist Mono', 'Roboto Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      parts.forEach((p) => ctx.fillText(p.ch, p.x, p.y));
    }

    function placeHint(snap) {
      const box = footer.getBoundingClientRect();
      const w = hint.offsetWidth;
      const left = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
      const x = clamp(pointer.x - box.left - w / 2, left + 8, box.width - w - 8);
      const y = pointer.y - box.top - hint.offsetHeight - 14;
      hintX = snap ? x : hintX + (x - hintX) * 0.22;
      hintY = snap ? y : hintY + (y - hintY) * 0.22;
      hint.style.transform = `translate3d(${hintX}px,${hintY}px,0)`;
    }

    function tick(now) {
      raf = 0;
      const dt = Math.min(2.5, (now - lastTime) / 16.67);
      lastTime = now;
      if (pointer && hint) placeHint(false);
      step(now, dt);
      draw();
      if (visible) raf = requestAnimationFrame(tick);
    }

    function run() {
      if (raf) return;
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    }

    // place the characters whenever the strip changes size (and once the SVGs
    // have loaded); anything in flight starts over
    function layout() {
      if (!build()) return;
      phase = 'held';
      strip.classList.add('is-chars');
      draw();
    }
    new ResizeObserver(layout).observe(strip);
    imgs.forEach((img) => { if (!img.complete) img.addEventListener('load', layout, { once: true }); });
    // a still frame won't redraw itself once the site's font arrives
    if (document.fonts) document.fonts.ready.then(() => { if (parts.length) draw(); });

    if (still) return;

    strip.addEventListener('click', (e) => {
      if (phase !== 'held' || !parts.length) return;
      startScatter(e, performance.now());
    });

    strip.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      pointer = { x: e.clientX, y: e.clientY };
      if (hint) {
        placeHint(true);
        hint.classList.add('is-on');
      }
    });
    strip.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
    });
    strip.addEventListener('pointerleave', () => {
      pointer = null;
      if (hint) hint.classList.remove('is-on');
    });

    // only alive while it's on screen
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) run();
    }).observe(strip);
  }

  document.querySelectorAll('.sfooter__digits').forEach(attach);
})();
