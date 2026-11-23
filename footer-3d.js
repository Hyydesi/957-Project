// ---------- Footer wordmark in 3D (Three.js) ----------
// The NINEFIVE / SEVEN marks, extruded from their own SVG paths into solid
// letters of bright, polished silver: a metal with a soft room around it to
// reflect, and a key and a rim light for the edges. They lean toward the
// pointer, sway a little on their own, and rise in word by word a beat
// after the footer has taken over the screen. The SVG images stay
// in the page to hold the layout; if WebGL isn't there they simply show.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const name = document.querySelector('.sfooter__name');
const wrap = name && name.closest('.sfooter-wrap');
const imgs = name ? [...name.querySelectorAll('.sfooter__word img')] : [];

const glOk = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
})();

if (name && imgs.length === 2 && glOk) build().catch(() => {
  name.classList.remove('is-3d');
});

async function build() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAD = 0.22;          // room around the marks for the lean, a share of the box
  const DEPTH = 46;          // extrusion, in the SVG's own px (each mark is ~884 across)
  const GAP = 6;             // the two lines sit close, nearly touching

  const loader = new SVGLoader();
  const datas = await Promise.all(imgs.map((img) => loader.loadAsync(img.currentSrc || img.src)));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.65;
  const canvas = renderer.domElement;
  canvas.className = 'sfooter__gl';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  // a broad key from the front and above lights the faces white; a rim from
  // behind and below catches the bevels
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-250, 420, 1000);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(500, 100, 800);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(600, -300, -400);
  // and a red one from low on the right, for red on the bevels
  const warm = new THREE.DirectionalLight(0xff2a1a, 1.05);
  warm.position.set(500, -350, 600);
  scene.add(key, fill, rim, warm, new THREE.HemisphereLight(0xffffff, 0x000000, 0.12));

  // liquid chrome: a mirror metal reflecting a dark studio, so the faces go
  // near black between bright streaks, with a thin film that throws soft
  // rainbow hues where the light grazes it
  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, roughness: 0.06,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.8,
    iridescence: 0.3, iridescenceIOR: 1.35, iridescenceThicknessRange: [120, 520],
  });

  // each mark: its paths extruded, flipped out of the SVG's y-down, centred
  const words = datas.map((data, i) => {
    const group = new THREE.Group();
    data.paths.forEach((path) => {
      SVGLoader.createShapes(path).forEach((shape) => {
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: DEPTH, curveSegments: 14,
          bevelEnabled: true, bevelThickness: 9, bevelSize: 3.6, bevelSegments: 8,
        });
        group.add(new THREE.Mesh(geo, silver));
      });
    });
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    group.children.forEach((m) => m.geometry.translate(-center.x, -center.y, -center.z));
    group.scale.y = -1;
    const holder = new THREE.Group();   // the entrance moves this one
    holder.add(group);
    holder.userData = { w: size.x, h: size.y, delay: i * 0.1 };
    return holder;
  });

  const H = words[0].userData.h + GAP + words[1].userData.h;
  const W = Math.max(words[0].userData.w, words[1].userData.w);
  words[0].userData.y = H / 2 - words[0].userData.h / 2;
  words[1].userData.y = -H / 2 + words[1].userData.h / 2;
  const marks = new THREE.Group();
  words.forEach((w) => { w.position.y = w.userData.y; marks.add(w); });
  scene.add(marks);

  const camera = new THREE.PerspectiveCamera(28, 1, 10, 20000);

  name.appendChild(canvas);
  name.classList.add('is-3d');

  // the camera frames the marks at the size the flat ones had, with PAD of
  // room around them inside the larger canvas
  const fit = () => {
    const r = name.getBoundingClientRect();
    if (!r.width) return;
    const cw = r.width * (1 + PAD * 2);
    const ch = r.height * (1 + PAD * 2);
    renderer.setSize(cw, ch, false);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    camera.aspect = cw / ch;
    const viewW = W * (cw / r.width);
    const dist = viewW / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    camera.position.set(0, 0, dist);
    camera.near = dist / 10;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    needs = true;
  };

  // the lean: toward the pointer while it's over the footer, a slow sway otherwise
  const target = { x: 0, y: 0 };
  const turn = { x: 0, y: 0 };
  let pointerIn = false;
  const footer = name.closest('.sfooter') || name;
  footer.addEventListener('pointermove', (e) => {
    const r = name.getBoundingClientRect();
    const nx = Math.max(-1.5, Math.min(1.5, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
    const ny = Math.max(-1.5, Math.min(1.5, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    target.y = nx * 0.32;
    target.x = ny * 0.22;
    pointerIn = true;
  });
  footer.addEventListener('pointerleave', () => { pointerIn = false; target.x = 0; target.y = 0; });

  // the gleam: a sheen that rides under the pointer, so the chrome catches
  // the light where it's hovered. It comes up while the pointer is over the
  // marks and fades once it leaves them.
  // one long streak across the metal at that spot, leaning the way the
  // chrome's own bands do (not a round spot), faint and with a crisp edge,
  // laid on as a colour dodge after tone mapping — it lifts the metal that is
  // already lit far more than the darks, so it reads bright while being faint;
  // drawn
  // into the material so it only ever lights the letters, never the dark
  const gleamU = { pos: { value: new THREE.Vector3() }, amt: { value: 0 }, r: { value: 210 } };
  silver.onBeforeCompile = (shader) => {
    shader.uniforms.uGleamPos = gleamU.pos;
    shader.uniforms.uGleamAmt = gleamU.amt;
    shader.uniforms.uGleamR = gleamU.r;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGleamWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGleamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGleamWorld;\nuniform vec3 uGleamPos;\nuniform float uGleamAmt;\nuniform float uGleamR;')
      .replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\nvec2 gleamV = vGleamWorld.xy - uGleamPos.xy;\nvec2 gleamDir = vec2(0.86, 0.5);\nfloat gleamU = dot(gleamV, gleamDir) / (uGleamR * 1.5);\nfloat gleamW = dot(gleamV, vec2(-gleamDir.y, gleamDir.x)) / (uGleamR * 0.3);\nfloat gleamQ = gleamU * gleamU + gleamW * gleamW;\nfloat gleamL = uGleamAmt * (exp(-gleamQ * gleamQ * 2.5) * 0.7 + exp(-gleamQ * gleamQ * 30.0) * 0.3);\ngl_FragColor.rgb = min(gl_FragColor.rgb / max(vec3(1.0 - gleamL), vec3(0.08)), vec3(1.0));');
  };
  const gleamAt = new THREE.Vector3(0, 0, 0);
  const gleamTo = new THREE.Vector3(0, 0, 0);
  let gleamOn = 0;
  let overMarks = false;
  const ray = new THREE.Raycaster();
  const front = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(DEPTH + 120));
  footer.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    overMarks = e.clientX >= n.left && e.clientX <= n.right && e.clientY >= n.top && e.clientY <= n.bottom;
    if (!r.width) return;
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(front, gleamTo);
  });
  footer.addEventListener('pointerleave', () => { overMarks = false; });

  // the entrance: once the section before (Works, on Home) has scrolled away
  // and the footer holds the screen, a beat passes, then the marks rise and
  // tip up into place on a long, soft ease — SEVEN a beat behind NINEFIVE.
  // Scrolling back up past the turn sends them down again, quickly.
  const IN_AT = 0.92, OUT_AT = 0.7;     // footer revealed, a share of the screen
  const DELAY = 350, DUR = 1800, STAGGER = 220;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);   // quick to start moving, a long soft landing
  const reveal = () => {
    const box = (wrap || name).getBoundingClientRect();
    const vh = window.innerHeight;
    return Math.max(0, Math.min(1, (vh - box.top) / vh));
  };
  let shownIn = false;
  let inAt = 0;
  const shown = [0, 0];

  let needs = true;
  let onScreen = false;
  let raf = 0;
  const frame = (now) => {
    raf = 0;
    const p = reveal();
    if (!shownIn && p >= IN_AT) { shownIn = true; inAt = now + DELAY; }
    else if (shownIn && p < OUT_AT) shownIn = false;
    let moving = false;
    words.forEach((w, i) => {
      let e;
      if (still) e = shownIn ? 1 : 0;
      else if (shownIn) {
        const k = Math.max(0, Math.min(1, (now - inAt - i * STAGGER) / DUR));
        e = easeOut(k);
        if (k < 1) moving = true;
      } else {
        // on the way out, ease back down from wherever it was
        e = shown[i] * 0.85;
        if (e < 0.002) e = 0; else moving = true;
      }
      shown[i] = e;
      w.position.y = w.userData.y - (1 - e) * w.userData.h * 0.9;
      w.rotation.x = (1 - e) * 0.75;
      w.scale.setScalar(0.94 + 0.06 * e);
      w.visible = e > 0.001;
    });
    if (!pointerIn && !still) {
      const s = now / 1000;
      target.y = Math.sin(s * 0.5) * 0.12;
      target.x = Math.sin(s * 0.37) * 0.05;
    }
    turn.x += (target.x - turn.x) * 0.08;
    turn.y += (target.y - turn.y) * 0.08;
    marks.rotation.x = turn.x;
    marks.rotation.y = turn.y;
    // the gleam follows the pointer a touch behind and swells in and out
    gleamAt.lerp(gleamTo, 0.16);
    gleamOn += ((overMarks ? 1 : 0) - gleamOn) * 0.07;
    if (Math.abs((overMarks ? 1 : 0) - gleamOn) < 0.002) gleamOn = overMarks ? 1 : 0;
    gleamU.pos.value.copy(gleamAt);
    gleamU.amt.value = 0.42 * gleamOn;
    renderer.render(scene, camera);
    needs = false;
    if (onScreen && (moving || !still || overMarks || gleamOn > 0 || Math.abs(target.x - turn.x) + Math.abs(target.y - turn.y) > 0.0005)) run();
  };
  const run = () => { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; run(); }).observe(name);
  } else { onScreen = true; }
  if ('ResizeObserver' in window) new ResizeObserver(() => { fit(); run(); }).observe(name);
  window.addEventListener('resize', () => { fit(); run(); });
  document.addEventListener('visibilitychange', run);
  window.addEventListener('scroll', run, { passive: true });
  footer.addEventListener('pointermove', run);
  fit();
  run();
}

// ---- the studio the chrome reflects ----
// Dark all round, lit by a few long white softboxes for the edges, and, in
// front of the marks (behind the camera, which is what their flat faces
// mirror), a dark board with soft diagonal bands across it — white and a
// broad red glow — reddened at its ends — so the faces read as chrome: deep
// darks broken by bright streaks that slide as the marks turn.
function studio() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  const box = (w, h, x, y, z, mat, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    scene.add(m);
  };
  const white = (c = 0xffffff) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  box(8, 1.2, 0, 4.5, 1, white(), 0, Math.PI / 2);          // overhead strip
  box(0.6, 6, -5, 0.5, 2, white(), Math.PI / 2.4);           // left rake
  box(0.5, 5, 5, -0.5, 1.5, white(0xe8f0ff), -Math.PI / 2.4); // right rake, a touch cool
  box(6, 0.5, 0, -2.2, -5, white());                         // low, behind

  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, c.height);
  base.addColorStop(0, '#363636'); base.addColorStop(0.5, '#070707'); base.addColorStop(1, '#241414');
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  // the bands: soft-edged diagonals, one broad, two narrow, one hairline
  const band = (x, w, a, rgb = '255,255,255') => {
    g.save();
    g.translate(x, c.height / 2); g.rotate(-0.5);
    const lg = g.createLinearGradient(-w, 0, w, 0);
    lg.addColorStop(0, `rgba(${rgb},0)`); lg.addColorStop(0.5, `rgba(${rgb},${a})`); lg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = lg; g.fillRect(-w, -c.height, w * 2, c.height * 2);
    g.restore();
  };
  // white, a broad red glow, white again, and a hairline
  band(250, 150, 1); band(250, 50, 1); band(500, 70, 0.75, '255,30,20'); band(500, 16, 0.7, '255,140,120'); band(700, 90, 1); band(700, 30, 1); band(880, 6, 1);
  // a breath of colour at the ends, for the film to pick up
  const tint = (x, col) => { const r = g.createRadialGradient(x, 320, 0, x, 320, 260); r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, c.width, c.height); };
  tint(80, 'rgba(255,40,30,.16)'); tint(980, 'rgba(255,60,45,.16)');
  const board = new THREE.CanvasTexture(c);
  board.colorSpace = THREE.SRGBColorSpace;
  box(9, 5.6, 0, 0, 5, new THREE.MeshBasicMaterial({ map: board, side: THREE.DoubleSide }), Math.PI);
  return scene;
}
