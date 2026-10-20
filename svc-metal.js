// ---------- Home: Our Service — the metal card ----------
// A rigid slab of brushed gunmetal, drawn with WebGL over the open service's
// card while it is hovered (services.js decides when, and how it leans).
//
// The slab is a real box: a front face carrying the card itself, a back and
// four edges as thick as DEPTH of its width. The front's print — the red bar
// and frame, the copy — is taken off the card's own HTML each time it comes
// up: every word is drawn where the page laid it out, at twice the size, so
// the slab lands exactly on the card it replaces and the admin's edits carry
// over. It turns about the middle of its face under the same perspective the
// page's CSS uses, so flat it sits pixel for pixel on the card.
//
// The light is all in the fragment shader: a key light from the top left and
// one that hangs in front of the cursor, an anisotropic highlight (after
// Ward) that the brushing draws out into a narrow streak — the face is
// brushed on the slant, so the streak falls from the top left to the bottom
// right, STREAK degrees below the level —
// a dim sky/ground reflection that brightens and darkens as the slab tips,
// and a rim of light where the faces turn away. The slab's shadow is the
// card's own, underneath (CSS: a filter on a WebGL canvas can blank it).
// No WebGL, no slab: createSvcMetal returns null and services.js keeps its
// CSS stand-in.
window.createSvcMetal = function createSvcMetal(canvas) {
  const gl = canvas && canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;

  const PERSP = 1400;     // px from the eye to the card, as the CSS perspective
  const DEPTH = 0.035;    // the slab's thickness, as a share of its width
  const TEX = 2;          // the print's resolution, in device pixels per CSS pixel
  const STREAK = 40;      // the highlight's slant, in degrees below the level (top left to bottom right)

  // ---- shaders
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv; attribute float aFront;
    uniform mat3 uRot; uniform vec2 uRes; uniform vec2 uCenter; uniform float uPersp;
    varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vFront; varying vec2 vLocal;
    void main(){
      vec3 q = uRot * aPos;
      vec2 s = uCenter + q.xy * (uPersp / (uPersp - q.z));
      gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, -q.z / 4000.0, 1.0);
      vPos = q; vNor = uRot * aNor; vUv = aUv; vFront = aFront; vLocal = aPos.xy;
    }`));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform sampler2D uTex; uniform vec3 uTan; uniform vec2 uStreak; uniform vec3 uCursor; uniform float uPersp;
    varying vec3 vPos; varying vec3 vNor; varying vec2 vUv; varying float vFront; varying vec2 vLocal;
    float hash(float n){ return fract(sin(n) * 43758.5453); }
    // the highlight of light L: tight along the brushing (T), drawn out
    // across it (B), so it reads as a streak at right angles to the grain
    float aniso(vec3 N, vec3 T, vec3 B, vec3 L, vec3 V){
      vec3 H = normalize(L + V);
      float ht = dot(H, T) / 0.05, hb = dot(H, B) / 0.45, hn = max(dot(H, N), 0.05);
      return exp(-(ht * ht + hb * hb) / (hn * hn)) * max(dot(N, L), 0.0);
    }
    void main(){
      vec3 N = normalize(vNor);
      vec3 V = normalize(vec3(0.0, 0.0, uPersp) - vPos);
      vec3 T = normalize(uTan - N * dot(uTan, N));
      vec3 B = cross(N, T);
      // the brushing: fine lines of slightly different sheen, running along
      // the grain (so they step across the streak's direction)
      float line = vFront > 0.5 ? dot(vLocal, uStreak) * 1.4 : (vUv.x + vUv.y) * 600.0;
      float g = hash(floor(line)) * 0.6 + hash(floor(line * 0.25) + 17.0) * 0.4;
      vec3 Lk = normalize(vec3(-0.45, -0.65, 0.62));
      vec3 Lc = normalize(uCursor - vPos);
      float diff = max(dot(N, Lk), 0.0) * 0.55 + max(dot(N, Lc), 0.0) * 0.3;
      float spec = aniso(N, T, B, Lk, V) * 0.4 + aniso(N, T, B, Lc, V) * 0.62;
      vec3 R = reflect(-V, N);
      vec3 sky = mix(vec3(0.012, 0.013, 0.015), vec3(0.3, 0.32, 0.35), smoothstep(-0.55, 0.75, -R.y));
      sky *= 0.75 + 0.25 * smoothstep(-1.0, 1.0, R.x);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 steel = vec3(0.1, 0.106, 0.118) * (0.9 + 0.2 * g);
      vec3 col = steel * (0.28 + diff) + sky * 0.2 + spec * vec3(0.86, 0.89, 0.95) * (0.82 + 0.36 * g) + rim * 0.16;
      if (vFront > 0.5) {
        vec4 t = texture2D(uTex, vUv);
        vec3 print = t.rgb * (0.62 + 0.7 * diff) + spec * 0.5 + sky * 0.06;
        col = mix(col, print, t.a);
      }
      gl_FragColor = vec4(col, 1.0);
    }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buffers = {};
  const attr = (name, size) => {
    const b = gl.createBuffer();
    const loc = gl.getAttribLocation(prog, name);
    buffers[name] = { b, loc, size };
    return b;
  };
  attr('aPos', 3); attr('aNor', 3); attr('aUv', 2); attr('aFront', 1);
  const ib = gl.createBuffer();
  const U = (n) => gl.getUniformLocation(prog, n);
  const uRot = U('uRot'), uRes = U('uRes'), uCenter = U('uCenter'), uPersp = U('uPersp');
  const uTan = U('uTan'), uStreak = U('uStreak'), uCursor = U('uCursor');
  // the streak's direction on the face (x right, y down), and the grain at
  // right angles to it
  const sa = (STREAK * Math.PI) / 180;
  const STREAK_DIR = [Math.cos(sa), Math.sin(sa)];
  const GRAIN = [Math.sin(sa), -Math.cos(sa), 0];
  gl.uniform1i(U('uTex'), 0);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const print = document.createElement('canvas');
  const px = print.getContext('2d');

  // ---- the box, in CSS pixels about the middle of its face (y down, z toward the eye)
  let count = 0;
  const build = (w, h) => {
    const d = Math.max(8, w * DEPTH);
    const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
    const pos = [], nor = [], uv = [], front = [], idx = [];
    const face = (a, b, c, e, n, isFront) => {
      const k = pos.length / 3;
      [a, b, c, e].forEach((p) => pos.push(...p));
      for (let i = 0; i < 4; i++) { nor.push(...n); front.push(isFront); }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    face([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [0, 0, 1], 1);      // front
    face([x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d], [0, 0, -1], 0); // back
    face([x0, y0, -d], [x0, y0, 0], [x0, y1, 0], [x0, y1, -d], [-1, 0, 0], 0);   // left
    face([x1, y0, 0], [x1, y0, -d], [x1, y1, -d], [x1, y1, 0], [1, 0, 0], 0);    // right
    face([x0, y0, -d], [x1, y0, -d], [x1, y0, 0], [x0, y0, 0], [0, -1, 0], 0);   // top
    face([x0, y1, 0], [x1, y1, 0], [x1, y1, -d], [x0, y1, -d], [0, 1, 0], 0);    // bottom
    const fill = (name, data) => {
      const { b, loc, size } = buffers[name];
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    fill('aPos', pos); fill('aNor', nor); fill('aUv', uv); fill('aFront', front);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    count = idx.length;
  };

  // ---- the print, taken off the card's HTML
  const rectIn = (el, box) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };
  const words = (el, box, fill) => {
    const cs = getComputedStyle(el);
    px.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in px) px.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    px.fillStyle = fill;
    const upper = cs.textTransform === 'uppercase';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      for (const m of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r) continue;
        const word = upper ? m[0].toUpperCase() : m[0];
        const tm = px.measureText(word);
        const ascent = tm.fontBoundingBoxAscent || tm.actualBoundingBoxAscent;
        px.fillText(word, r.left - box.left, r.top - box.top + ascent);
      }
    }
  };
  const paint = (cardEl, box) => {
    print.width = Math.round(box.width * TEX);
    print.height = Math.round(box.height * TEX);
    px.setTransform(TEX, 0, 0, TEX, 0, 0);
    px.clearRect(0, 0, box.width, box.height);
    const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#d80000';
    // the bar, anodised
    const bar = cardEl.querySelector('.svc-card__bar');
    const b = rectIn(bar, box);
    const g = px.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, '#f02020'); g.addColorStop(0.55, '#b40000'); g.addColorStop(1, '#d00a0a');
    px.fillStyle = g;
    px.fillRect(b.x, b.y, b.w, b.h);
    // the frame
    px.strokeStyle = red;
    px.lineWidth = 1.4;
    px.strokeRect(0.7, 0.7, box.width - 1.4, box.height - 1.4);
    // the copy: the bar's in white, the title engraved silver, the line under it white
    px.shadowColor = 'rgba(0,0,0,.55)';
    px.shadowOffsetY = TEX;
    bar.querySelectorAll('span').forEach((s) => words(s, box, '#fff'));
    const title = cardEl.querySelector('.svc-card__title');
    const t = rectIn(title, box);
    const silver = px.createLinearGradient(0, t.y, 0, t.y + t.h);
    silver.addColorStop(0, '#ffffff'); silver.addColorStop(0.42, '#e2e5e9'); silver.addColorStop(1, '#9da3aa');
    words(title, box, silver);
    words(cardEl.querySelector('.svc-card__desc'), box, '#f2f3f5');
    px.shadowColor = 'transparent';
    // the pixel icon, held on the frame it had, cell by cell where the page lays it out
    if (window.svcPixel) window.svcPixel.paint(px, cardEl, box);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, print);
  };

  // ---- the stage
  let W = 1, H = 1;
  let center = [0, 0], size = [1, 1];
  const resize = (w, h) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = w; H = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  // take a card up: print it and fit the slab to it
  const prepare = (cardEl, stageEl) => {
    const box = cardEl.getBoundingClientRect();
    const s = stageEl.getBoundingClientRect();
    if (Math.abs(s.width - W) > 0.5 || Math.abs(s.height - H) > 0.5) resize(s.width, s.height);
    center = [box.left - s.left + box.width / 2, box.top - s.top + box.height / 2];
    size = [box.width, box.height];
    build(box.width, box.height);
    paint(cardEl, box);
  };
  // rx, ry: the lean in degrees, as the CSS rotateX / rotateY; mx, my: the
  // cursor over the card, 0–1
  const draw = (rx, ry, mx, my) => {
    const a = (rx * Math.PI) / 180, b = (ry * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // Rx · Ry, column by column
    const m = [cb, sa * sb, -ca * sb, 0, ca, sa, sb, -sa * cb, ca * cb];
    gl.uniformMatrix3fv(uRot, false, m);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uCenter, center[0], center[1]);
    gl.uniform1f(uPersp, PERSP);
    gl.uniform3f(uTan,
      m[0] * GRAIN[0] + m[3] * GRAIN[1],
      m[1] * GRAIN[0] + m[4] * GRAIN[1],
      m[2] * GRAIN[0] + m[5] * GRAIN[1]);
    gl.uniform2f(uStreak, STREAK_DIR[0], STREAK_DIR[1]);
    // the cursor's light hangs where its mirror image lands right under the
    // cursor, however the slab leans: off the point under it, along the
    // reflection of the line of sight in the face
    const px0 = (mx - 0.5) * size[0], py0 = (my - 0.5) * size[1];
    const P = [m[0] * px0 + m[3] * py0, m[1] * px0 + m[4] * py0, m[2] * px0 + m[5] * py0];
    const N = [m[6], m[7], m[8]];
    let V = [-P[0], -P[1], PERSP - P[2]];
    const vl = Math.hypot(V[0], V[1], V[2]);
    V = V.map((v) => v / vl);
    const nv = 2 * (N[0] * V[0] + N[1] * V[1] + N[2] * V[2]);
    const R = [N[0] * nv - V[0], N[1] * nv - V[1], N[2] * nv - V[2]];
    gl.uniform3f(uCursor, P[0] + R[0] * 520, P[1] + R[1] * 520, P[2] + R[2] * 520);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };
  return { resize, prepare, draw };
};
