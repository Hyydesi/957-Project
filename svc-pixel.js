// ---------- Home: Our Service — the pixel icons ----------
// A pixel-art machine under each service's title (services-anatomy, Pixel style,
// 48 × 48 cells, dark palette). The rest frame is inline SVG in the card, so the
// icon is there without script; the motion frames load once the section nears.
//
// · size: every cell is exactly 2 CSS pixels (decision 20/10/2026); the icon takes
//   the finest grid (32 … 128 cells, every 4) that fills the gap between title and
//   copy, so it grows with the card and stays sharp. Only that grid's frames load.
// · it flickers on and off with the room's edges and keywords (services.js calls
//   light(i, on))
// · it loops its cycle only while its card is the open one and the room is at
//   rest; turning, off its wall or under reduced motion it rests on frame 0
// · while the card is the WebGL metal slab, the frame it had is held and printed
//   onto the slab (svc-metal.js calls paint()), so it leans with it
(function svcPixel() {
  const cards = [...document.querySelectorAll('#svcStage .svc-card')];
  if (!cards.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELL = 2;             // CSS px per cell
  const GRIDS = Array.from({ length: 25 }, (_, i) => 32 + i * 4);   // 32 … 128 cells
  const STEP = 50;            // ms per frame (20 fps)
  let loading = null;         // set once the section nears and the grids start loading
  const FILL = 0.92;          // icon height, as a share of the gap between title and copy
  const CAP = 0.5;            // …and never more than half the card's height
  const PALETTE = {           // the dark palette (approved 20/10/2026)
    top: '#2B2B2B', front: '#1F1F1F', side: '#171717', recess: '#121212', block: '#3A3A3A',
    outline: '#ECECEC', structure: '#7B7B7B', detail: '#4A4A4A',
    accent: '#d80000', soft: '#F5CCCC', white: '#FFFFFF',
  };
  const NAME = { 1: 'outline', 2: 'structure', 3: 'detail', 4: 'accent', 5: 'soft', 6: 'white', 7: 'front', 8: 'side', 9: 'recess', a: 'block', b: 'top' };

  // frames are run-length encoded: "~" + char + count (base 36) + ";"
  const unrle = (row) => (row.includes('~') ? row.replace(/~(.)([0-9a-z]+);/gu, (_, ch, n) => ch.repeat(parseInt(n, 36))) : row);
  // one path per colour, each run of same-coloured cells one rectangle (in cell units)
  const pathsOf = (rows) => {
    const out = {};
    rows.forEach((enc, r) => {
      const row = unrle(enc);
      for (let c = 0; c < row.length; ) {
        const k = row[c];
        let e = c;
        while (e + 1 < row.length && row[e + 1] === k) e++;
        if (k !== '0') out[NAME[k]] = (out[NAME[k]] || '') + `M${c} ${r}h${e - c + 1}v1h${-(e - c + 1)}Z`;
        c = e + 1;
      }
    });
    return out;
  };

  const icons = cards.map((card, i) => {
    const el = card.querySelector('.svc-card__icon');
    if (!el) return null;
    const svg = el.querySelector('svg');
    return {
      i, card, el, svg,
      body: card.querySelector('.svc-card__body'),
      title: card.querySelector('.svc-card__title'),
      desc: card.querySelector('.svc-card__desc'),
      layers: Object.fromEntries([...svg.querySelectorAll('[data-l]')].map((p) => [p.dataset.l, p])),
      data: null, cache: new Map(), shown: -1, cols: 48, cell: CELL, want: 0,
      lit: false, playing: false, held: false, t0: 0, frame: 0,
    };
  }).filter(Boolean);
  if (!icons.length) return;

  // ---- size: whole CSS pixels per cell, centred between title and copy
  const layout = (ic) => {
    const H = ic.body.offsetHeight, W = ic.body.offsetWidth;
    if (!H) return;
    ic.w = W;
    ic.h = H;
    const top = ic.title.offsetTop + ic.title.offsetHeight;
    const band = ic.desc.offsetTop - top;
    const room = Math.min(band * FILL, H * CAP, W * 0.9);
    // the finest grid that fits at 2 px a cell; on a card too small even for 32 cells, 32 at 1 px
    let cols = GRIDS.filter((g) => g * CELL <= room).pop();
    let cell = CELL;
    if (!cols) { cols = GRIDS[0]; cell = Math.max(1, Math.floor(room / cols)); }
    const size = cols * cell;
    Object.assign(ic.el.style, {
      width: `${size}px`, height: `${size}px`,
      left: `${Math.round((W - size) / 2)}px`, top: `${Math.round(top + (band - size) / 2)}px`,
      transform: 'none',
    });
    ic.cell = cell;
    if (cols !== ic.want) {
      ic.want = cols;
      if (loading) fetchGrid(ic);
    }
  };
  const ro = new ResizeObserver((entries) => entries.forEach((e) => {
    const ic = icons.find((x) => x.body === e.target);
    if (ic) layout(ic);
  }));
  icons.forEach((ic) => { ic.el.classList.add('is-js'); layout(ic); ro.observe(ic.body); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => icons.forEach(layout));
  window.addEventListener('resize', () => icons.forEach(layout));

  // ---- frames
  const frameRows = (ic, n) => {
    const f = ic.data.frames;
    let j = n;
    while (f[j].same !== undefined) j = f[j].same;
    return [j, f[j].co];
  };
  const show = (ic, n) => {
    if (!ic.data || ic.shown === n) return;
    if (ic.svg.getAttribute('data-cols') !== String(ic.cols)) {
      ic.svg.setAttribute('viewBox', `0 0 ${ic.cols} ${ic.cols}`);
      ic.svg.setAttribute('data-cols', ic.cols);
    }
    const [j, rows] = frameRows(ic, n);
    if (!ic.cache.has(j)) ic.cache.set(j, pathsOf(rows));
    const p = ic.cache.get(j);
    for (const [name, el] of Object.entries(ic.layers)) el.setAttribute('d', p[name] || '');
    ic.shown = n;
    ic.frame = n;
  };
  // one grid file per icon: the one its card size asks for; a resize to another grid fetches that one
  const fetchGrid = (ic) => {
    const cols = ic.want;
    return fetch(`assets/svc-pixel/${ic.el.dataset.slug}-${cols}.json`).then((r) => r.json()).then((d) => {
      if (ic.want !== cols) return;
      ic.data = d;
      ic.cols = cols;
      ic.cache.clear();
      ic.shown = -1;
      show(ic, ic.playing ? ic.frame % d.frames.length : 0);
    }).catch(() => {});
  };
  const load = () => loading || (loading = Promise.all(icons.map(fetchGrid)));
  const near = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { load(); near.disconnect(); } }, { rootMargin: '800px 0px' });
  near.observe(document.getElementById('svcStage'));

  // ---- loop
  let raf = 0;
  const run = (now) => {
    raf = 0;
    let any = false;
    for (const ic of icons) {
      if (!ic.playing || ic.held || !ic.data) continue;
      any = true;
      const n = Math.floor((now - ic.t0) / STEP) % ic.data.frames.length;
      show(ic, n);
    }
    if (any) raf = requestAnimationFrame(run);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(run); };

  // services.js, every frame: which card is open (-1 none), whether the room is
  // at rest, whether the open card is the metal slab
  let nextCheck = 0;
  const state = (open, rest, metal) => {
    // a lit icon re-checks its card's size now and then: the room may resize the
    // card after it lit, and not every such change reaches the ResizeObserver
    const now = performance.now();
    if (now >= nextCheck) {
      nextCheck = now + 300;
      for (const ic of icons) if (ic.lit && (ic.body.offsetWidth !== ic.w || ic.body.offsetHeight !== ic.h)) layout(ic);
    }
    for (const ic of icons) {
      const active = ic.i === open && rest && ic.lit && !reduce && !document.hidden;
      const hold = metal && ic.i === open;
      if (active && !ic.playing) { ic.playing = true; ic.t0 = performance.now() - ic.frame * STEP; }
      ic.held = hold;
      if (!active && ic.playing && !hold) { ic.playing = false; show(ic, 0); }
      if (ic.playing && !ic.held) kick();
    }
  };
  // services.js lightUp / lightDown: the icon flickers on and off with the keywords
  const light = (i, on) => {
    const ic = icons.find((x) => x.i === i);
    if (!ic || ic.lit === on) return;
    ic.lit = on;
    if (on) layout(ic);   // measured again as it lights: the room may have sized the card since load
    ic.el.classList.remove('is-in', 'is-out');
    void ic.el.offsetWidth;
    ic.el.classList.add(on ? 'is-in' : 'is-out');
    if (!on) { ic.playing = false; show(ic, 0); }
  };

  // svc-metal.js: print the icon's held frame onto the slab, cell by cell, where
  // the page lays it out (box: the card's client rect; ctx already scaled to CSS px)
  const paint = (ctx, cardEl, box) => {
    const ic = icons.find((x) => x.card === cardEl);
    if (!ic || !ic.lit) return;
    const r = ic.el.getBoundingClientRect();
    const cell = r.width / (ic.data ? ic.cols : 48);
    const rows = ic.data ? frameRows(ic, ic.frame)[1] : null;
    if (!rows) {
      // no motion data yet: copy the inline rest frame
      for (const [name, el] of Object.entries(ic.layers)) {
        ctx.fillStyle = PALETTE[name];
        const p = new Path2D(el.getAttribute('d') || '');
        ctx.save();
        ctx.translate(r.left - box.left, r.top - box.top);
        ctx.scale(cell, cell);
        ctx.fill(p);
        ctx.restore();
      }
      return;
    }
    rows.forEach((enc, y) => {
      const row = unrle(enc);
      for (let x = 0; x < row.length; x++) {
        const k = row[x];
        if (k === '0') continue;
        ctx.fillStyle = PALETTE[NAME[k]];
        ctx.fillRect(r.left - box.left + x * cell, r.top - box.top + y * cell, cell, cell);
      }
    });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) icons.forEach((ic) => { ic.playing = false; show(ic, 0); });
  });
  window.svcPixel = { state, light, paint };
})();
