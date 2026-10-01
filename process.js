// ---------- Home: the Process stack ----------
// One pinned stage (.process__stage → sticky .process__sticky). Scrolling
// through it walks a step position from 0 to N-1:
//   · the open step sits at the top of the frame; the ones not reached yet wait
//     as rows along the bottom, only their heads showing
//   · between two steps the next one rises from its row to the top, covering
//     the open one, which lifts a little and darkens underneath
//   · each step's big figure fills from the foot up while the step is open
// Over it all floats the open step's poster, printed on a cloth that hangs
// toward the cursor (a small Verlet sheet drawn with WebGL). Changing step
// crumples the cloth and swaps the print. Below 900px the steps are a plain
// list and each poster is printed flat inside its step instead.
(function processStack() {
  const stage = document.getElementById('processStage');
  if (!stage) return;
  const sticky = stage.querySelector('.process__sticky');
  const stack = stage.querySelector('.process__stack');
  const canvas = stage.querySelector('.process__cloth');
  const steps = [...stage.querySelectorAll('.pstep')];
  const N = steps.length;
  if (N < 2) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinQuery = matchMedia('(min-width: 900px) and (min-height: 560px)');
  const TAIL = 0.6;   // scroll kept after the last step arrives, in steps (the CSS height allows for it)
  const HOLD = 0.2;   // share of each step's scroll, at either end, where the stack holds still
  const LIFT = 2;     // how far the covered step drifts up, in rows
  const DIM = 0.6;    // how dark the covered step gets

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  stage.style.setProperty('--steps', N);
  steps.forEach((el, i) => el.style.setProperty('--below', N - 1 - i));

  const STATUS = {
    queued: stage.dataset.statusQueued || 'Queued',
    active: stage.dataset.statusActive || 'In progress',
    done: stage.dataset.statusDone || 'Done',
  };
  const statusText = steps.map((el) => el.querySelector('.pstep__status-text'));
  const numEls = steps.map((el) => el.querySelector('.pstep__num'));

  // ---- the stack -------------------------------------------------------
  let raw = 0;   // step position straight off the scroll; runs below 0 before the pin
  let pos = 0;   // the same, clamped to 0 … N-1 and held at each whole step
  let rowH = 44;
  let stackH = 0;

  const measure = () => {
    const r = stage.getBoundingClientRect();
    const per = Math.max(1, (r.height - window.innerHeight) / (N - 1 + TAIL));
    raw = -r.top / per;
    const s = clamp(raw, 0, N - 1);
    const k = Math.min(N - 2, Math.floor(s));
    pos = k + smooth(clamp01((s - k - HOLD) / (1 - 2 * HOLD)));
  };

  const readSizes = () => {
    rowH = steps[0].querySelector('.pstep__head').offsetHeight || 44;
    stackH = stack.clientHeight;
  };

  const state = new Array(N).fill('');
  const place = () => {
    for (let i = 0; i < N; i++) {
      const el = steps[i];
      const rise = clamp01(pos - (i - 1));   // 0 waiting in its row … 1 at the top
      const cover = clamp01(pos - i);        // how far the next step has risen over it
      const waitY = stackH - (N - i) * rowH;
      const y = (1 - rise) * waitY - cover * LIFT * rowH;
      el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      el.style.setProperty('--dim', (cover * DIM).toFixed(3));
      // the figure fills over the step's own stretch of scroll: from halfway
      // through its rise to halfway through the next one's
      const fill = clamp01(raw - i + 0.5);
      numEls[i].style.setProperty('--fill', fill.toFixed(3));
      setState(i, fill >= 1 ? 'done' : fill > 0 ? 'active' : 'queued');
    }
  };

  const setState = (i, s) => {
    if (state[i] === s) return;
    state[i] = s;
    steps[i].classList.toggle('is-active', s === 'active');
    steps[i].classList.toggle('is-done', s === 'done');
    statusText[i].textContent = STATUS[s];
  };

  const unplace = () => {
    steps.forEach((el, i) => {
      el.style.transform = '';
      el.style.removeProperty('--dim');
      numEls[i].style.removeProperty('--fill');
      setState(i, 'queued');
    });
  };

  // ---- the posters -----------------------------------------------------
  // Printed in the studio's colours: paper, ink and the red, the step's word
  // set big in Anton, mono small print around it. A step with data-poster
  // gets that image instead.
  const PW = 600, PH = 800;
  const PAPER = '#ecebe6', INK = '#0e0e0e', RED = '#d80000';
  const LOOKS = [
    { bg: PAPER, ink: INK, accent: RED, layout: 'stack' },
    { bg: RED, ink: PAPER, accent: INK, layout: 'side' },
    { bg: PAPER, ink: RED, accent: INK, layout: 'repeat' },
    { bg: INK, ink: RED, accent: PAPER, layout: 'figure' },
    { bg: RED, ink: INK, accent: PAPER, layout: 'stack' },
  ];
  const M = 36;

  const fitSize = (x, text, maxW, maxH) => {
    x.font = '100px Anton';
    const m = x.measureText(text);
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || 73;
    return 100 * Math.min(maxW / m.width, maxH ? maxH / h : Infinity);
  };
  // draws text with its ink box's top-left at (left, top)
  const inkText = (x, text, left, top, size, mode = 'fill') => {
    x.font = `${size}px Anton`;
    x.textBaseline = 'alphabetic';
    const m = x.measureText(text);
    const tx = left + m.actualBoundingBoxLeft;
    const ty = top + m.actualBoundingBoxAscent;
    if (mode === 'stroke') x.strokeText(text, tx, ty); else x.fillText(text, tx, ty);
    return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  };
  const mono = (x, size, weight = 500) => { x.font = `${weight} ${size}px "Roboto Mono", monospace`; x.textBaseline = 'alphabetic'; };

  const drawPoster = (i) => {
    const el = steps[i];
    const look = LOOKS[i % LOOKS.length];
    const word = (el.dataset.word || el.querySelector('.pstep__name').textContent).trim().toUpperCase();
    const name = el.querySelector('.pstep__name').textContent.trim().toUpperCase();
    const when = el.querySelector('.pstep__when').textContent.trim().toUpperCase();
    const pad = (n) => String(n).padStart(2, '0');

    const c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    const x = c.getContext('2d');
    x.fillStyle = look.bg;
    x.fillRect(0, 0, PW, PH);

    const inner = PW - 2 * M;
    const top = 92;
    const foot = PH - 124;
    x.fillStyle = look.ink;
    x.strokeStyle = look.ink;

    if (look.layout === 'stack') {
      // the word broken over two lines, each run edge to edge
      // at one size, so the short line leaves room for the dot
      const cut = Math.ceil(word.length / 2);
      const lines = word.length > 4 ? [word.slice(0, cut), word.slice(cut)] : [word];
      const size = Math.min(...lines.map((l) => fitSize(x, l, inner, (foot - top - 40) / lines.length - 14)));
      x.font = `${size}px Anton`;
      let y = top + 8;
      let spot = null;
      lines.forEach((line) => {
        const h = inkText(x, line, M, y, size);
        const spare = inner - x.measureText(line).width;
        if (!spot || spare > spot.spare) spot = { spare, y, h };
        y += h + 14;
      });
      const r = Math.min(64, (spot.spare - 28) / 2, spot.h / 2);
      if (r >= 18) {
        x.fillStyle = look.accent;
        x.beginPath();
        x.arc(PW - M - r, spot.y + spot.h - r, r, 0, Math.PI * 2);
        x.fill();
      }
    } else if (look.layout === 'side') {
      // the word running up the left edge, the figure big on the right
      x.save();
      x.translate(M, foot - 8);
      x.rotate(-Math.PI / 2);
      inkText(x, word, 0, 0, fitSize(x, word, foot - top - 16, 300));
      x.restore();
      x.fillStyle = look.accent;
      const fig = String(i + 1);
      const size = fitSize(x, fig, 240, 420);
      x.font = `${size}px Anton`;
      const w = x.measureText(fig).width;
      inkText(x, fig, PW - M - w, top + 8, size);
      x.strokeStyle = look.ink;
      x.globalAlpha = 0.35;
      x.lineWidth = 1;
      for (let gx = PW / 2; gx < PW - M; gx += 40) { x.beginPath(); x.moveTo(gx, foot - 150); x.lineTo(gx, foot - 16); x.stroke(); }
      x.globalAlpha = 1;
    } else if (look.layout === 'repeat') {
      // the word over and over in outline, one line of it solid
      const size = fitSize(x, word, inner);
      x.font = `${size}px Anton`;
      const h = x.measureText(word).actualBoundingBoxAscent;
      const rows = Math.max(3, Math.floor((foot - top) / (h + 12)));
      const solid = Math.floor(rows / 2);
      x.lineWidth = 1.5;
      for (let r = 0; r < rows; r++) {
        const y = top + 8 + r * (h + 12);
        if (r === solid) { x.fillStyle = look.ink; inkText(x, word, M, y, size); }
        else { x.strokeStyle = look.accent; x.globalAlpha = 0.5; inkText(x, word, M, y, size, 'stroke'); x.globalAlpha = 1; }
      }
    } else {
      // the figure huge in outline, the word solid across it, the menu's dots
      const fig = String(i + 1);
      x.lineWidth = 2;
      x.strokeStyle = look.ink;
      const size = fitSize(x, fig, inner, foot - top - 10);
      x.font = `${size}px Anton`;
      const w = x.measureText(fig).width;
      inkText(x, fig, (PW - w) / 2, top + 6, size, 'stroke');
      x.fillStyle = look.ink;
      const ws = fitSize(x, word, inner);
      x.font = `${ws}px Anton`;
      const wh = x.measureText(word).actualBoundingBoxAscent;
      inkText(x, word, M, (top + foot) / 2 - wh / 2, ws);
      x.fillStyle = look.accent;
      const d = 22, gx = PW - M - 64, gy = top + 10;
      x.fillRect(gx, gy, d, d);
      x.fillRect(gx + 42, gy + 42, d, d);
      x.beginPath(); x.arc(gx + 42 + d / 2, gy + d / 2, d / 2, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(gx + d / 2, gy + 42 + d / 2, d / 2, 0, Math.PI * 2); x.fill();
    }

    // small print: the studio and the count across the head, the step along the foot
    const small = look.bg === INK ? PAPER : look.bg === RED ? (look.ink === INK ? INK : PAPER) : INK;
    x.fillStyle = small;
    x.strokeStyle = small;
    x.lineWidth = 1;
    mono(x, 17);
    x.textAlign = 'left';
    x.fillText('NINEFIVESEVEN', M, 52);
    x.textAlign = 'right';
    x.fillText(`[${pad(i + 1)}/${pad(N)}]`, PW - M, 52);
    x.beginPath(); x.moveTo(M, 70); x.lineTo(PW - M, 70); x.stroke();
    x.beginPath(); x.moveTo(M, foot + 14); x.lineTo(PW - M, foot + 14); x.stroke();
    x.textAlign = 'left';
    mono(x, 22, 600);
    x.fillText(name, M, foot + 50);
    mono(x, 15);
    x.fillText(when, M, foot + 78);
    x.fillText('PROCESS — 957 STUDIO, VN', M, foot + 100);
    x.textAlign = 'right';
    x.fillText('(C) 2026', PW - M, foot + 100);
    x.textAlign = 'left';

    // a little print grain
    for (let g = 0; g < 9000; g++) {
      x.fillStyle = g & 1 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)';
      x.fillRect(Math.random() * PW, Math.random() * PH, 1.5, 1.5);
    }
    return c;
  };

  // a supplied image, cropped to the poster's shape
  const loadPoster = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = PW; c.height = PH;
      const s = Math.max(PW / img.naturalWidth, PH / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, (PW - w) / 2, (PH - h) / 2, w, h);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const fontsReady = document.fonts
    ? Promise.all([document.fonts.load('100px Anton'), document.fonts.load('500 17px "Roboto Mono"'), document.fonts.load('600 22px "Roboto Mono"')]).catch(() => {})
    : Promise.resolve();

  const postersReady = fontsReady.then(() => Promise.all(steps.map(async (el, i) => {
    const custom = el.dataset.poster && await loadPoster(el.dataset.poster);
    const poster = custom || drawPoster(i);
    // the flat print for the small-screen list
    const img = document.createElement('img');
    img.className = 'pstep__poster';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.src = el.dataset.poster && custom ? el.dataset.poster : poster.toDataURL('image/jpeg', 0.86);
    el.querySelector('.pstep__body').appendChild(img);
    return poster;
  })));

  // ---- the cloth -------------------------------------------------------
  const gl = canvas && canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  let cloth = null;
  if (gl) cloth = makeCloth(gl);

  function makeCloth(gl) {
    const COLS = 16, ROWS = 21;          // particles; 15 × 20 cells keep the poster's 3:4
    const COUNT = COLS * ROWS;
    const P = new Float32Array(COUNT * 3);  // where each particle is
    const Q = new Float32Array(COUNT * 3);  // where it was a step ago (Verlet)
    const NOR = new Float32Array(COUNT * 3);
    const UV = new Float32Array(COUNT * 2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const k = r * COLS + c;
      UV[k * 2] = c / (COLS - 1);
      UV[k * 2 + 1] = r / (ROWS - 1);
    }
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }

    // springs: neighbours hold the weave, diagonals stop it shearing, the
    // ones two apart give it the body of heavy paper rather than silk
    const links = [];
    const link = (a, b, k) => links.push(a, b, k);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      if (c < COLS - 1) link(a, a + 1, 1);
      if (r < ROWS - 1) link(a, a + COLS, 1);
      if (c < COLS - 1 && r < ROWS - 1) { link(a, a + COLS + 1, 0.8); link(a + 1, a + COLS, 0.8); }
      if (c < COLS - 2) link(a, a + 2, 0.35);
      if (r < ROWS - 2) link(a, a + 2 * COLS, 0.35);
    }
    const L = links.length / 3;
    const LA = new Uint16Array(L), LB = new Uint16Array(L), LK = new Float32Array(L), LR = new Float32Array(L);
    for (let i = 0; i < L; i++) { LA[i] = links[i * 3]; LB[i] = links[i * 3 + 1]; LK[i] = links[i * 3 + 2]; }

    // ---- gl setup
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, `
      attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
      uniform vec2 uRes; uniform vec2 uEye;
      varying vec2 vUv; varying vec3 vNor;
      void main(){
        float k = 1200.0 / (1200.0 - aPos.z);
        vec2 p = uEye + (aPos.xy - uEye) * k;
        gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, -aPos.z / 4000.0, 1.0);
        vUv = aUv; vNor = aNor;
      }`));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D uFrom; uniform sampler2D uTo; uniform float uMix;
      varying vec2 vUv; varying vec3 vNor;
      void main(){
        vec3 n = normalize(vNor);
        float back = step(n.z, 0.0);
        n = mix(n, -n, back);
        vec3 L = normalize(vec3(-0.35, -0.55, 0.76));
        float diff = max(dot(n, L), 0.0);
        float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 48.0) * 0.28;
        vec3 tex = mix(texture2D(uFrom, vUv).rgb, texture2D(uTo, vUv).rgb, uMix);
        tex = mix(tex, vec3(0.84, 0.83, 0.8) * 0.85 + tex * 0.06, back);
        gl_FragColor = vec4(tex * (0.4 + 0.72 * diff) + spec, 1.0);
      }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buffer = (data, attr, size, usage) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      const loc = gl.getAttribLocation(prog, attr);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const posBuf = buffer(P, 'aPos', 3, gl.DYNAMIC_DRAW);
    const norBuf = buffer(NOR, 'aNor', 3, gl.DYNAMIC_DRAW);
    buffer(UV, 'aUv', 2, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uEye = gl.getUniformLocation(prog, 'uEye');
    const uMix = gl.getUniformLocation(prog, 'uMix');
    gl.uniform1i(gl.getUniformLocation(prog, 'uFrom'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTo'), 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    let textures = [];
    const setPosters = (canvases) => {
      textures = canvases.map((cv) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      });
    };

    // ---- simulation
    let W = 0, H = 0, dpr = 1;
    let gap = 16;
    let placed = false;
    const anchor = { x: 0, y: 0, vx: 0, vy: 0 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const clothW = clamp(Math.min(W * 0.2, (H * 0.5) / 1.33), 180, 360);
      gap = clothW / (COLS - 1);
      for (let i = 0; i < L; i++) {
        const a = LA[i], b = LB[i];
        const dc = Math.abs((a % COLS) - (b % COLS)), dr = Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS));
        LR[i] = Math.hypot(dc, dr) * gap;
      }
      placed = false;
    };

    // hang the sheet straight down from the anchor
    const hang = () => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = (r * COLS + c) * 3;
        P[k] = Q[k] = anchor.x + (c - (COLS - 1) / 2) * gap;
        P[k + 1] = Q[k + 1] = anchor.y + r * gap;
        P[k + 2] = Q[k + 2] = 0;
      }
      placed = true;
    };

    // the top edge is held like a sheet pinched along its width: it bows
    // toward the viewer, leans into the way it's being dragged and ripples
    const pin = (t, wind) => {
      const lean = clamp(anchor.vx * 0.02, -0.4, 0.4);
      const cos = Math.cos(lean), sin = Math.sin(lean);
      for (let c = 0; c < COLS; c++) {
        const k = c * 3;
        const off = (c - (COLS - 1) / 2) * gap;
        const u = off / ((COLS - 1) * gap);
        P[k] = anchor.x + off * cos;
        P[k + 1] = anchor.y + off * sin + Math.sin(t * 1.7 + c * 0.5) * 3 * wind;
        P[k + 2] = Math.cos(u * Math.PI) * 26 + Math.sin(t * 1.2 + c * 0.35) * 8 * wind;
        Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
      }
    };

    const G = 0.34, DAMP = 0.985;
    const simulate = (t, wind) => {
      pin(t, wind);
      for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = (r * COLS + c) * 3;
        const vx = (P[k] - Q[k]) * DAMP;
        const vy = (P[k + 1] - Q[k + 1]) * DAMP;
        const vz = (P[k + 2] - Q[k + 2]) * DAMP;
        Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
        const fr = r / (ROWS - 1);
        P[k] += vx + Math.sin(t * 0.9 + r * 0.25) * 0.03 * wind;
        P[k + 1] += vy + G;
        P[k + 2] += vz + (Math.sin(t * 1.8 + r * 0.42 + c * 0.22) + Math.sin(t * 2.9 - r * 0.3)) * 0.16 * wind * fr;
      }
      for (let it = 0; it < 5; it++) {
        for (let i = 0; i < L; i++) {
          const a = LA[i] * 3, b = LB[i] * 3;
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const pa = LA[i] < COLS, pb = LB[i] < COLS;   // the top row is pinned
          const f = ((d - LR[i]) / d) * LK[i] * (pa || pb ? 1 : 0.5);
          if (!pa) { P[a] += dx * f; P[a + 1] += dy * f; P[a + 2] += dz * f; }
          if (!pb) { P[b] -= dx * f; P[b + 1] -= dy * f; P[b + 2] -= dz * f; }
        }
      }
    };

    // shake it out of shape; the springs pull it back
    const crumple = (amount) => {
      for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = (r * COLS + c) * 3;
        const fr = r / (ROWS - 1);
        P[k] += (Math.random() - 0.5) * 14 * amount * fr;
        P[k + 1] -= Math.random() * 10 * amount * fr;
        P[k + 2] += (Math.random() - 0.5) * 70 * amount * fr;
      }
    };

    const normals = () => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = (r * COLS + c) * 3;
        const l = (r * COLS + Math.max(0, c - 1)) * 3, rt = (r * COLS + Math.min(COLS - 1, c + 1)) * 3;
        const u = (Math.max(0, r - 1) * COLS + c) * 3, d = (Math.min(ROWS - 1, r + 1) * COLS + c) * 3;
        const ax = P[rt] - P[l], ay = P[rt + 1] - P[l + 1], az = P[rt + 2] - P[l + 2];
        const bx = P[d] - P[u], by = P[d + 1] - P[u + 1], bz = P[d + 2] - P[u + 2];
        NOR[k] = ay * bz - az * by;
        NOR[k + 1] = az * bx - ax * bz;
        NOR[k + 2] = ax * by - ay * bx;
      }
    };

    const draw = (from, to, mix) => {
      normals();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!textures.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, P);
      gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, NOR);
      gl.uniform2f(uRes, W, H);
      gl.uniform2f(uEye, anchor.x, anchor.y + gap * (ROWS - 1) / 2);
      gl.uniform1f(uMix, mix);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[from]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures[to]);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };

    return {
      resize, simulate, crumple, draw, setPosters, anchor,
      get placed() { return placed; }, hang,
      get size() { return { w: gap * (COLS - 1), h: gap * (ROWS - 1) }; },
      get ready() { return textures.length > 0; },
    };
  }

  // ---- where the cloth wants to be ----------------------------------------
  // It rests on the right of the open step, over its copy's shoulder, and
  // leans toward the cursor while it's over the stage — never all the way.
  const mouse = { x: 0, y: 0, over: false };
  if (cloth && !reduce) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = sticky.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.over = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.over = false; });
  }

  let shown = 0, from = 0, to = 0, mix = 1;
  const restFor = (t) => {
    const sr = sticky.getBoundingClientRect();
    const kr = stack.getBoundingClientRect();
    const size = cloth.size;
    const x0 = kr.left - sr.left, y0 = kr.top - sr.top;
    const open = Math.round(pos);
    // the open step's body, between its head and the rows waiting below it
    const bodyTop = y0 + rowH;
    const bodyBottom = y0 + stackH - (N - 1 - open) * rowH;
    let x = x0 + kr.width * 0.82;
    let y = bodyTop + Math.max(24, (bodyBottom - bodyTop - size.h) * 0.62);
    // rise a touch through each change of step, as if lifted off the old one
    y -= Math.sin(Math.PI * (pos - Math.floor(pos))) * 36;
    if (!reduce) {
      x += Math.sin(t * 0.5) * 10;
      y += Math.cos(t * 0.7) * 6;
      if (mouse.over) {
        x += clamp(mouse.x - x, -kr.width * 0.5, kr.width * 0.2) * 0.4;
        y += clamp(mouse.y - size.h * 0.35 - y, -200, 200) * 0.35;
      }
    }
    return { x, y };
  };

  // ---- the loop, only while the stage is near the screen -----------------
  let visible = false;
  let running = false;
  let lastT = 0;
  let acc = 0;
  const STEP = 1000 / 60;

  const frame = (now) => {
    if (!visible) { running = false; return; }
    requestAnimationFrame(frame);
    const pinned = pinQuery.matches;
    measure();
    if (!pinned) { unplace(); return; }
    place();
    if (!cloth || !cloth.ready) return;

    const t = now / 1000;
    const rest = restFor(t);
    const a = cloth.anchor;
    if (!cloth.placed) { a.x = rest.x; a.y = rest.y; a.vx = a.vy = 0; cloth.hang(); }

    const open = clamp(Math.round(pos), 0, N - 1);
    if (open !== shown) {
      from = mix < 0.5 ? from : to;
      to = open;
      shown = open;
      mix = reduce ? 1 : 0;
      if (!reduce) cloth.crumple(1);
    }
    if (mix < 1) mix = Math.min(1, mix + 0.045);

    // fixed steps so the cloth moves the same at any refresh rate
    acc = Math.min(acc + (lastT ? now - lastT : STEP), STEP * 4);
    lastT = now;
    while (acc >= STEP) {
      // the anchor is sprung toward its rest, so it lags and overshoots a little
      a.vx = (a.vx + (rest.x - a.x) * 0.025) * 0.86;
      a.vy = (a.vy + (rest.y - a.y) * 0.025) * 0.86;
      if (reduce) { a.x = rest.x; a.y = rest.y; a.vx = a.vy = 0; } else { a.x += a.vx; a.y += a.vy; }
      cloth.simulate(t, reduce ? 0 : 1);
      acc -= STEP;
    }
    cloth.draw(from, to, smooth(mix));
  };

  const start = () => {
    if (running) return;
    running = true;
    lastT = 0;
    requestAnimationFrame(frame);
  };

  const onResize = () => {
    readSizes();
    if (cloth) cloth.resize();
    measure();
    if (pinQuery.matches) place(); else unplace();
  };
  window.addEventListener('resize', onResize);
  onResize();

  if (cloth) {
    postersReady.then((posters) => {
      cloth.setPosters(posters);
      shown = from = to = clamp(Math.round(pos), 0, N - 1);
    });
  } else {
    postersReady.catch(() => {});
  }

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }, { rootMargin: '200px 0px' }).observe(stage);
})();
