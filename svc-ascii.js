// ---------- Home: Our Service — the red ASCII light ----------
// The light on the side walls: a glow of the brand red drawn in characters,
// after React Bits' GradientASCII (worked out again here in plain WebGL 2,
// for this room). services.js sizes it, hands it the walls, and draws it each
// frame while the room is lit; the layer it sits in is cut to the walls
// between the ceiling and floor edges (styles.css: .svc__glow).
//
// The light hangs on the walls as you see them, between the ceiling and
// floor edges, so it turns with them: each wall is the four-sided patch
// from where its two edges leave the screen (or the room's corner) to the
// card, and the character grid is stretched over it in perspective, as a
// picture on that wall would be: its rows run with the edges and its
// characters shrink toward the card. The light is brightest at the far end,
// the screen's edge, and eases off into the dark about three quarters of the
// way in, wavering slowly. services.js hands over each wall with how strongly
// it is lit: in full while it runs off the screen, fading out as it swings
// into the middle between two cards.
//
// Brighter light takes characters further along CHARS, and fills in more of
// its cells; a few cells twitch a step brighter or darker now and then. Under
// the characters lies a faint wash of the same light, and a little grain.
// No WebGL 2, no light: createSvcAscii returns null.
window.createSvcAscii = function createSvcAscii(canvas) {
  const gl = canvas && canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  const CHARS = ' =+xX0S8#@';     // dimmest to brightest
  const CELL = 11;                 // px, a character cell's height beside the card, at rest
  const REACH = 0.75;              // how far in from the far end the light reaches, as a share of the wall
  const DENSITY = 0.92;            // share of cells that show a character, where the light is full
  const WASH = 0.2;                // the wash under the characters
  const FLICKER = 0.25;            // how much the characters twitch
  const GRAIN = 0.05;
  const DPR = 1.5;                 // the most device pixels per CSS pixel it draws at
  // the light, from its dim edge to its brightest: kept low and deep, so it
  // glows under the room rather than standing out (the site's red, --red,
  // dimmed, up to a soft warm red)
  const RAMP = ['#1f0101', '#7a0000', '#c00000', '#e8574a'];
  const FONT = '"Geist Mono", "Roboto Mono", ui-monospace, monospace';
  const ATLAS_W = 48, ATLAS_H = 80;   // px per character in the atlas

  // ---- shaders
  const VERTEX = `#version 300 es
    void main(){
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;
  const FRAGMENT = `#version 300 es
    precision highp float;
    uniform vec2 uRes; uniform float uDpr;
    uniform mat3 uInv[3]; uniform vec3 uWall[3]; uniform float uCount;
    uniform vec2 uGrid;
    uniform float uTime;
    uniform sampler2D uAtlas; uniform vec2 uAtlasGrid; uniform float uGlyphs;
    uniform vec3 uRamp[4];
    out vec4 outColor;
    float hash(vec2 p){
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    vec3 ramp(float t){
      float x = smoothstep(0.3, 1.0, t) * 3.0;
      int i = int(min(floor(x), 2.0));
      return mix(uRamp[i], uRamp[i + 1], x - float(i));
    }
    // the light at a point on a wall: u from its far end (0) to the card
    // (1), v from the ceiling's edge (0) to the floor's (1); lit is how
    // strongly the wall is lit, wall tells walls apart, and mirror is set
    // where the wall's far end is on the right, to keep the characters
    // the right way round
    vec4 shade(vec2 uv, float lit, float wall, float mirror){
      float n = noise(uv * vec2(4.0, 3.0) + vec2(wall * 3.7, uTime * 0.12));
      float value = 0.62 * (1.0 - smoothstep(0.0, ${REACH.toFixed(2)}, uv.x)) * mix(0.6, 1.0, n) * lit
                  * (1.0 - 0.25 * smoothstep(0.3, 0.5, abs(uv.y - 0.5)));
      value = clamp(value, 0.0, 1.0);
      // the wash
      vec3 tint = ramp(value);
      float body = smoothstep(0.0, 0.7, value);
      vec4 color = vec4(tint * body, body) * ${WASH.toFixed(2)};
      // the character in this cell of the wall's grid
      vec2 coord = uv * uGrid;
      vec2 cell = floor(coord), local = coord - cell;
      if (mirror > 0.5) local.x = 1.0 - local.x;
      float level = hash(cell * 1.73 + 4.1 + wall);
      float tick = floor(uTime * 9.0 + level * 9.0);
      float wobble = (hash(cell * 2.31 + tick * 17.7) - 0.5) * ${FLICKER.toFixed(2)} * 0.4 + (level - 0.5) * 0.1;
      float tone = clamp(pow(value, 0.75) + wobble, 0.0, 1.0);
      float index = floor(tone * (uGlyphs - 1.0) + 0.5);
      float present = step(hash(cell + wall * 7.31), ${DENSITY.toFixed(2)} * mix(1.0, 0.3 + tone * 1.1, 0.55));
      float cutoff = smoothstep(0.03, 0.1, value);
      vec2 atlas = vec2((mod(index, uAtlasGrid.x) + local.x) / uAtlasGrid.x, (floor(index / uAtlasGrid.x) + local.y) / uAtlasGrid.y);
      vec2 even = coord / uAtlasGrid;
      float cover = textureGrad(uAtlas, atlas, dFdx(even), dFdy(even)).a;
      float a = 0.7 * present * cutoff * cover * mix(1.0, 0.45 + 0.55 * level, 0.5);
      vec3 ink = mix(tint, vec3(1.0, 0.86, 0.82), 0.08);
      color += vec4(ink * a, a * 0.9);
      return color;
    }
    void main(){
      vec3 px = vec3(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y, uDpr) / uDpr;
      vec4 color = vec4(0.0);
      // the wall this pixel falls on (they never overlap)
      for (int i = 0; i < 3; i++){
        if (float(i) >= uCount) break;
        vec3 q = uInv[i] * px;
        if (q.z <= 0.0) continue;
        vec2 uv = q.xy / q.z;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
        color = shade(uv, uWall[i].x, uWall[i].y, uWall[i].z);
        break;
      }
      float grain = (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 97.0) - 0.5) * ${GRAIN.toFixed(2)};
      color.rgb += grain * color.a;
      color.a = clamp(color.a, 0.0, 1.0);
      outColor = vec4(clamp(color.rgb, 0.0, color.a), color.a);
    }`;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  const u = {};
  ['uRes', 'uDpr', 'uInv', 'uWall', 'uCount', 'uGrid', 'uTime', 'uAtlas', 'uAtlasGrid', 'uGlyphs', 'uRamp']
    .forEach((name) => { u[name] = gl.getUniformLocation(prog, name); });

  // ---- the characters, drawn once into an atlas (again once the font is in)
  const glyphs = [...CHARS];
  const atlasTex = gl.createTexture();
  const buildAtlas = () => {
    const c = document.createElement('canvas');
    c.width = ATLAS_W * glyphs.length;
    c.height = ATLAS_H;
    const ctx = c.getContext('2d');
    ctx.font = `400 ${Math.round(ATLAS_H * 0.78)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    glyphs.forEach((ch, i) => ctx.fillText(ch, i * ATLAS_W + ATLAS_W / 2, ATLAS_H / 2 + 3));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  buildAtlas();
  if (document.fonts && document.fonts.load) document.fonts.load(`400 62px ${FONT}`, CHARS).then(buildAtlas, () => {});
  gl.uniform1i(u.uAtlas, 0);
  gl.uniform2f(u.uAtlasGrid, glyphs.length, 1);
  gl.uniform1f(u.uGlyphs, glyphs.length);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  gl.uniform3fv(u.uRamp, RAMP.flatMap(hex));
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  const resize = (w, h) => {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR);
    canvas.width = Math.round(Math.max(1, w) * dpr);
    canvas.height = Math.round(Math.max(1, h) * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uRes, Math.max(1, w), Math.max(1, h));
    gl.uniform1f(u.uDpr, canvas.width / Math.max(1, w));
  };
  // the projective map that takes the unit square's corners (0,0), (1,0),
  // (1,1), (0,1) to four points on screen, as rows of a 3×3 matrix
  const toQuad = ([x0, y0], [x1, y1], [x2, y2], [x3, y3]) => {
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
    const h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  };
  const at = (m, u, v) => {
    const w = m[6] * u + m[7] * v + m[8];
    return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w];
  };
  // the grid, fixed once from the left wall at rest (the far end at the
  // screen's corners, the near one the card's side), so it stays put on the
  // walls as they turn: rows CELL tall beside the card, and characters there
  // a little wider than the font's
  const grid = (cardLeft, cardTop, cardBottom, h) => {
    const m = toQuad([0, 0], [cardLeft, cardTop], [cardLeft, cardBottom], [0, h]);
    const rows = Math.max(4, Math.round((cardBottom - cardTop) / CELL));
    const perU = (at(m, 1, 0.5)[0] - at(m, 0.99, 0.5)[0]) / 0.01;
    const cols = Math.max(4, Math.round(perU / (CELL * ATLAS_W / ATLAS_H * 1.15)));
    gl.uniform2f(u.uGrid, cols, rows);
  };
  // walls: [{ ft, nt, nb, fb, lit, id }] — the far top, near top, near
  // bottom and far bottom corners, how strongly it is lit and which wall it
  // is; at most three, drawn until the next call
  const inv = new Float32Array(27), wall = new Float32Array(9);
  let count = 0;
  const walls = (list) => {
    count = Math.min(3, list.length);
    for (let i = 0; i < count; i++) {
      const q = list[i];
      const [a, b, c, d, e, f, g, h, k] = toQuad(q.ft, q.nt, q.nb, q.fb);
      // its inverse, column by column for GLSL
      const A = e * k - f * h, B = f * g - d * k, C = d * h - e * g;
      const det = a * A + b * B + c * C || 1e-9;
      inv.set([
        A / det, B / det, C / det,
        (c * h - b * k) / det, (a * k - c * g) / det, (b * g - a * h) / det,
        (b * f - c * e) / det, (c * d - a * f) / det, (a * e - b * d) / det,
      ], i * 9);
      wall.set([q.lit, q.id, q.ft[0] > q.nt[0] ? 1 : 0], i * 3);
    }
    gl.uniformMatrix3fv(u.uInv, false, inv);
    gl.uniform3fv(u.uWall, wall);
    gl.uniform1f(u.uCount, count);
  };
  const draw = (seconds) => {
    if (!count) { gl.clear(gl.COLOR_BUFFER_BIT); return; }
    gl.uniform1f(u.uTime, seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return { resize, grid, walls, draw };
};
