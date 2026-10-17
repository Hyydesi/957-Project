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
// The projects as 960×552 cards in a row across a pinned screen, with the
// home grid's stills. The row is a loop: the wheel, a swipe or the arrow keys
// carry it sideways for ever, the projects coming round again and again (the
// list is laid out three times over so a card always wraps round well off
// screen). The page itself doesn't scroll.
//
// Perspective, as in the reference: the cards stand in real 3D, each placed
// by where its middle sits on the screen — flat and nearest at the middle,
// and toward either edge set further back and turned so its outer side
// recedes, with a clear gap kept between neighbours. On arrival the cards on
// screen come in from the right one after another; starting far off to the
// right, they start deep and turned, and come forward and straighten as they
// slide into place.
//
// With WebGL the still behind is typed out live as ASCII from its source
// picture (assets/works/bg-block.jpg): each square of a fine grid gets a
// character for how bright the picture is there and takes its colour; the
// picture beneath sways slowly, a band of light sweeps across now and then,
// and characters keep swapping — more as the row speeds by. The whole
// screen — that and the cards — is drawn into one picture and shown through a fisheye: the middle untouched, and
// toward the screen's two side edges the picture squeezed sideways and pulled
// taller, as if the screen bulged toward the viewer there, so a card bends as
// it slides into either edge; the faster the row moves, the wider and
// stronger the bend. The real cards stay on top, unseen, as the links.
// Without WebGL the real cards and the plain still show.
(function cardStrip() {
  const section = document.getElementById('wStrip');
  const track = document.getElementById('wStripTrack');
  const glCanvas = document.getElementById('wStripGl');
  if (!section || !track || typeof PROJECTS === 'undefined') return;
  const sticky = section.querySelector('.wstrip__sticky');
  const bg = sticky.querySelector('.wstrip__bg');
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
      cards.push({ el: a, img, project: pi, lead: 0 });
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
    gap = narrow ? 12 : 14 * u;
    left = narrow ? (vw - cw) / 2 : 43 * u;
    top = track.offsetTop;
    persp = parseFloat(getComputedStyle(track).perspective) || 1500 * u;
    loop = cards.length * (cw + gap);
  };
  // a card's resting x, brought round into the stretch of the loop centred
  // on the screen
  const wrap = (x) => {
    const lo = vw / 2 - loop / 2 - cw / 2;
    return lo + ((((x - lo) % loop) + loop) % loop);
  };

  // how a card sits for where its middle is: n is -1 at the left edge, 0 in
  // the middle, 1 at the right edge (and beyond, off screen)
  const DEPTH = 560;   // design px back at the edge
  const TURN = 30;     // degrees turned at the edge
  const TUCK = -0.1;   // share of a card's width it's moved along: out from the
                       // middle, to make room for a turned card's nearer inner
                       // side, so a small gap stays between neighbours
  const place = (x) => {
    const n = (x + cw / 2 - vw / 2) / (vw / 2);
    const f = Math.min(1.6, Math.pow(Math.abs(n), 1.35));
    const s = Math.sign(n);
    return {
      x: x - s * cw * TUCK * f,
      z: -DEPTH * u * f,
      r: s * TURN * Math.min(1.2, f),
      n: Math.abs(n),
    };
  };

  // ---- the loop's position: wheel, swipe and keys move a target the row
  // glides after ----
  let target = 0, pos = 0, speed = 0, last = 0;
  const blocked = () => menu && menu.classList.contains('is-open');
  window.addEventListener('wheel', (e) => {
    if (blocked()) return;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= vh;
    target += d;
    draw();
  }, { passive: true });
  let touch = null;
  sticky.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, t: performance.now(), v: 0 };
  }, { passive: true });
  sticky.addEventListener('touchmove', (e) => {
    if (!touch || blocked()) return;
    const t = e.touches[0];
    const dx = touch.x - t.clientX, dy = touch.y - t.clientY;
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const now = performance.now();
    touch.v = d / Math.max(8, now - touch.t);
    touch.x = t.clientX; touch.y = t.clientY; touch.t = now;
    target += d * 1.3;
    draw();
  }, { passive: true });
  sticky.addEventListener('touchend', () => {
    // a flick carries on
    if (touch) target += touch.v * 320;
    touch = null;
    draw();
  });
  window.addEventListener('keydown', (e) => {
    if (blocked() || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const step = cw + gap;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) target += step;
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) target -= step;
    else return;
    e.preventDefault();
    draw();
  });

  // ---- arrival: each card on screen starts off to the right, further the
  // later it comes, and eases in on its own clock ----
  const FLY_MS = 1700, STAGGER = 170;
  let arrive = still ? -1 : 0;   // 0 = waiting, -1 = done, else its start time
  let leads = false;
  const settle = (t) => 1 - Math.pow(1 - t, 4);
  const setLeads = () => {
    const rest = cards.map((c, i) => wrap(left + i * (cw + gap) - pos));
    const on = cards.map((c, i) => i)
      .filter((i) => rest[i] > -cw * 1.6 && rest[i] < vw + cw * 0.5)
      .sort((a, b) => rest[a] - rest[b]);
    cards.forEach((c) => { c.lead = 0; c.rank = -1; });
    on.forEach((i, k) => {
      cards[i].rank = k;
      cards[i].lead = vw * (1.25 + k * 0.32) - rest[i];
    });
    leads = true;
  };
  const offsetFor = (c, now) => {
    if (arrive === -1 || c.rank < 0) return 0;
    if (arrive === 0) return c.lead;
    const k = Math.min(1, Math.max(0, (now - arrive - c.rank * STAGGER) / FLY_MS));
    return c.lead * (1 - settle(k));
  };

  let raf = 0;
  const frame = (now) => {
    raf = 0;
    const dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    const was = pos;
    pos += (target - pos) * (still ? 1 : 1 - Math.pow(1 - 0.085, dt / 16.7));
    if (Math.abs(target - pos) < 0.05) pos = target;
    speed += (Math.abs(pos - was) / dt - speed) * 0.2;   // px per ms, smoothed
    if (arrive !== -1 && !leads) setLeads();

    const placed = cards.map((c, i) => {
      const x = wrap(left + i * (cw + gap) - pos) + offsetFor(c, now);
      const t = place(x);
      c.el.style.transform = `translate3d(${t.x.toFixed(1)}px,0,${t.z.toFixed(1)}px) rotateY(${t.r.toFixed(2)}deg)`;
      c.el.style.zIndex = 100 - Math.round(t.n * 40);
      return { c, t };
    });
    paint(placed, now);
    name(placed);

    const flying = arrive > 0 && now - arrive < FLY_MS + STAGGER * cards.length;
    if (arrive > 0 && !flying) arrive = -1;
    // with the live type the loop never sleeps (the browser pauses it while
    // the tab is hidden)
    if (flying || pos !== target || speed > 0.002 || (gl && bgReady)) raf = requestAnimationFrame(frame);
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
    const text = PROJECTS[pi].name;
    if (scramble && !still) {
      scramble.originalText = text;
      scramble.run();
    } else nameEl.textContent = text;
  };

  // ---- WebGL: the still and the cards into one picture, then that picture
  // through the fisheye ----
  let gl = null;
  if (glCanvas && bg && !still) gl = glCanvas.getContext('webgl', { alpha: false, antialias: false });
  let bgProg, cardProg, eyeProg, quad, cardBuf, fbo, fboTex, bgTex, glyphTex, aniso;
  // the characters, faintest to densest; slot 0 is a blank
  const RAMP = " .'-=+xX#S08";
  const SLOTS = 16;
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
    const full = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
    // the still as live ASCII: a grid of cells, each the character for how
    // bright the (cover-cropped, slowly swaying) source is at its middle, in
    // the source's colour, over a faint blur of the source; then dimmed the
    // way the plain still is: 45% of it over the page's #101010, under a 15%
    // black. The band of sky across the top (behind the heading and the nav)
    // is typed fainter, at about half
    bgProg = program(full, `precision mediump float;
      uniform sampler2D t; uniform sampler2D glyphs;
      uniform vec2 crop; uniform vec2 res; uniform vec2 cell;
      uniform float time; uniform float go;
      varying vec2 v;
      const float COUNT = ${RAMP.length.toFixed(1)};
      const float SLOTS = ${SLOTS.toFixed(1)};
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 cover(vec2 q){ return (q - 0.5) * crop + 0.5; }
      void main(){
        vec2 frag = v * res;
        vec2 id = floor(frag / cell);
        vec2 inCell = fract(frag / cell);
        vec2 c = (id + 0.5) * cell / res;
        // the picture under the type sways, rows drifting side to side
        float sway = sin(c.y * 9.0 + time * 0.7) * (0.004 + 0.012 * go)
                   + sin(c.y * 23.0 - time * 1.3) * 0.0025;
        vec3 col = texture2D(t, cover(c + vec2(sway, 0.0))).rgb;
        float l = clamp((dot(col, vec3(0.299, 0.587, 0.114)) - 0.1) * 1.55, 0.0, 1.0);
        // now and then a soft band of light sweeps across
        float band = sin((c.x * 0.6 + (1.0 - c.y)) * 3.0 - time * 0.9);
        l = clamp(l + smoothstep(0.82, 1.0, band) * 0.28 * step(0.05, l), 0.0, 1.0);
        float idx = floor(l * (COUNT - 1.0) + 0.5);
        // every square swaps its character now and then, more as the row moves
        float h = hash(id);
        float tick = floor(time * (1.2 + h * 3.0 + go * 14.0) + h * 10.0);
        float r = hash(id + tick * 0.37);
        if (idx > 0.5 && r > 0.8 - go * 0.35) {
          idx = clamp(idx + (r > 0.9 ? 1.0 : -1.0) * (1.0 + floor(hash(id * 1.7 + tick) * 2.0)), 1.0, COUNT - 1.0);
        }
        float ink = texture2D(glyphs, vec2((idx + inCell.x) / SLOTS, inCell.y)).a;
        vec3 tint = clamp(col * 1.7, 0.0, 1.0);
        vec3 under = texture2D(t, cover(v), 5.0).rgb * 0.3;
        // the top band, behind the heading and the nav, fades to about half
        float sky = 1.0 - 0.5 * smoothstep(0.5, 0.72, v.y);
        vec3 ascii = under + tint * ink * sky;
        gl_FragColor = vec4(mix(vec3(16.0 / 255.0), ascii, 0.45) * 0.85, 1.0);
      }`);
    // a card: its corners already placed in perspective (clip space, with w
    // for perspective-correct texturing)
    cardProg = program(`attribute vec4 p; attribute vec2 uv; varying vec2 v;
      void main(){ v = uv; gl_Position = p; }`, `precision mediump float;
      uniform sampler2D t; varying vec2 v;
      void main(){ gl_FragColor = texture2D(t, v); }`);
    eyeProg = program(full, `precision mediump float;
      uniform sampler2D t; uniform float edge; uniform float squeeze; uniform float bulge;
      varying vec2 v;
      void main(){
        float x = v.x * 2.0 - 1.0;
        float ax = abs(x);
        // 0 across the middle, rising to 1 at the very edge
        float e = smoothstep(1.0 - edge, 1.0, ax);
        // sideways: across the edge band, sample further out than we are, so
        // the picture is squeezed toward the edge — easing in from the band's
        // inner side and pinned at the screen's edge, so nothing runs off it
        float s = clamp((ax - (1.0 - edge)) / edge, 0.0, 1.0);
        float sx = ax < 1.0 - edge ? x : sign(x) * ((1.0 - edge) + edge * (s + squeeze * s * s * (1.0 - s)));
        // and up and down: sample nearer the middle line, so the picture grows
        // taller toward the edge, as if it came closer
        float sy = (v.y - 0.5) * (1.0 - bulge * e * e) + 0.5;
        vec4 c = texture2D(t, vec2(sx * 0.5 + 0.5, sy));
        gl_FragColor = vec4(c.rgb * (1.0 - 0.25 * e), 1.0);
      }`);
    if (!bgProg || !cardProg || !eyeProg) gl = null;
  }
  if (gl) {
    aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    cardBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cards.length * 4 * 6 * 4, gl.DYNAMIC_DRAW);
    fbo = gl.createFramebuffer();
    fboTex = newTex(false);
    bgTex = newTex(true);
    glyphTex = newTex(true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    PROJECTS.forEach((p, i) => { texFor[i] = newTex(true); });
  }

  // each project drawn as its card looks — still, caption — onto a
  // power-of-two canvas (so it can be mipmapped and stay clean as it turns
  // away), with a clear rim so the turned edges come out smooth
  const PAD = 2;
  let bgReady = false, sized = '';
  const paintCard = (pi) => {
    if (!gl) return;
    const c = cards[pi];
    const img = c.img;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const TW = (cw + PAD * 2) * dpr > 1100 ? 2048 : 1024, TH = TW / 2;
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const x = cv.getContext('2d');
    const sx = TW / (cw + PAD * 2), sy = TH / (ch + PAD * 2);
    x.setTransform(sx, 0, 0, sy, sx * PAD, sy * PAD);
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

  // the characters in a row, one to a slot, white on clear, in the site's mono
  const paintGlyphs = () => {
    if (!gl) return;
    const cv = document.createElement('canvas');
    cv.width = 64 * SLOTS; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `700 84px ${getComputedStyle(document.documentElement).getPropertyValue('--font-nav') || 'monospace'}`;
    [...RAMP].forEach((ch, i) => x.fillText(ch, i * 64 + 32, 68));
    gl.bindTexture(gl.TEXTURE_2D, glyphTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const sizeGl = () => {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(vw * dpr), h = Math.round(vh * dpr);
    if (`${w}x${h}` === sized) return;
    sized = `${w}x${h}`;
    glCanvas.width = w; glCanvas.height = h;
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const fullQuad = (pr) => {
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
  };

  // a point on a card (dx, dy from its middle) to clip space, as the CSS 3D
  // stands it: rotateY(r) about its middle, moved to (x, z), seen through the
  // track's perspective from the strip's middle
  const verts = new Float32Array(cards.length * 4 * 6);
  const corner = (o, t, dx, dy, s, v) => {
    const r = t.r * Math.PI / 180;
    const X = t.x + cw / 2 + dx * Math.cos(r);
    const Z = t.z - dx * Math.sin(r);
    const k = persp / (persp - Z);
    const px = vw / 2 + (X - vw / 2) * k;
    const py = top + ch / 2 + dy * k;
    const w = 1 / k;
    verts[o] = (px / vw * 2 - 1) * w;
    verts[o + 1] = (1 - py / vh * 2) * w;
    verts[o + 2] = 0;
    verts[o + 3] = w;
    verts[o + 4] = s;
    verts[o + 5] = v;
  };

  const paint = (placed, time) => {
    if (!gl || !bgReady) return;
    const W = glCanvas.width, H = glCanvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glyphTex);
    gl.uniform1i(gl.getUniformLocation(bgProg, 'glyphs'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(gl.getUniformLocation(bgProg, 't'), 0);
    const sa = srcAspect, va = vw / vh;
    gl.uniform2f(gl.getUniformLocation(bgProg, 'crop'), va < sa ? va / sa : 1, va < sa ? 1 : sa / va);
    gl.uniform2f(gl.getUniformLocation(bgProg, 'res'), W, H);
    // a character cell 13×22 design px (never under 8px tall; 11px on phones),
    // in canvas px
    const cellH = (vw < 900 ? 11 : Math.max(8, 22 * u)) * (W / vw);
    gl.uniform2f(gl.getUniformLocation(bgProg, 'cell'), cellH * 0.6, cellH);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'time'), (time || 0) / 1000);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'go'), Math.min(1, speed / 2.5));
    fullQuad(bgProg);

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
    placed
      .map((q, i) => ({ i, n: q.t.n, pi: q.c.project }))
      .filter((q) => q.n < 3)
      .sort((a, b) => b.n - a.n)
      .forEach((q) => {
        gl.bindTexture(gl.TEXTURE_2D, texFor[q.pi]);
        gl.drawArrays(gl.TRIANGLE_STRIP, q.i * 4, 4);
      });
    gl.disableVertexAttribArray(lp);
    gl.disableVertexAttribArray(lu);
    gl.disable(gl.BLEND);

    // the whole picture through the fisheye: at rest the outer 13% of the
    // width each side, reaching further in and bending harder as the row
    // speeds by
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(eyeProg);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    const go = Math.min(1, speed / 2.5);
    gl.uniform1f(gl.getUniformLocation(eyeProg, 'edge'), 0.26 + 0.14 * go);
    gl.uniform1f(gl.getUniformLocation(eyeProg, 'squeeze'), 1.0);   // the most it takes without folding back
    gl.uniform1f(gl.getUniformLocation(eyeProg, 'bulge'), 0.3 + 0.18 * go);
    fullQuad(eyeProg);
    sticky.classList.add('is-gl');
  };

  // the source picture, onto a power-of-two canvas so it can be mipmapped
  // (the faint blur under the type is a coarse mip level)
  let srcAspect = 16 / 9;
  const src = new Image();
  const loadBg = () => {
    if (!gl || !src.complete || !src.naturalWidth) return;
    srcAspect = src.naturalWidth / src.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 1024;
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    bgReady = true;
    draw();
  };
  if (gl) {
    src.addEventListener('load', loadBg, { once: true });
    src.src = bg.dataset.asciiSrc || bg.currentSrc || bg.src;
  }

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
  paintGlyphs();
  draw();
  window.addEventListener('resize', refresh);
  // each still as it comes in, and the captions again once the face is in
  cards.slice(0, PROJECTS.length).forEach((c, i) => {
    if (!c.img.complete) c.img.addEventListener('load', () => { paintCard(i); draw(); }, { once: true });
  });
  if (document.fonts) document.fonts.ready.then(() => { measure(); paintCards(); paintGlyphs(); draw(); });

  // fly in once the page has opened to full screen
  if (!still) {
    Promise.resolve(window.pageReady).then(() => {
      setLeads();
      arrive = performance.now();
      draw();
    });
  }
})();
