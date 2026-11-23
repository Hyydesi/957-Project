// Hover parameters from the saved Signal Cards Lab configuration.
window.createSvcSignal = function createSvcSignal(reduceMotion, cardBodies) {
  const logoLayer = document.createElement('canvas');
  const logoPaint = logoLayer.getContext('2d');
  if (!logoPaint) return null;

  const cards = new Map(cardBodies.map((cardBody) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'svc-card__signal';
    canvas.setAttribute('aria-hidden', 'true');
    cardBody.prepend(canvas);
    const state = { canvas, paint: canvas.getContext('2d'), mask: null, fall: 0 };
    const source = cardBody.dataset.signalMask;
    if (source) {
      const mask = new Image();
      mask.onload = () => {
        state.mask = mask;
        if (width && body !== cardBody) drawIdle(state);
      };
      mask.src = source;
    }
    return [cardBody, state];
  }));

  const COLUMN_GAP = 7;
  const FALL_SPEED = 30;
  const SPAWN_DISTANCE = 200;
  const BOX_GRID = 6;
  const BOX_LIMIT = 3;
  const FOLLOW_PULL = 0.043;
  const GROW_TIME = 260;
  const LEAVE_TIME = 200;
  const ACCENT = '#fff1e9';
  const LOGO_ALPHA = 0.48;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const random = (min, max) => min + Math.random() * (max - min);
  const snap = (n) => Math.round(n / BOX_GRID) * BOX_GRID;
  const easeOut = (t) => 1 - (1 - t) ** 3;

  let width = 0, height = 0, ratio = 0;
  let sparse, dense;
  let body = null;
  let bounds;
  let current, target, lastPointer, distance;
  const trail = [];
  let leaveAt, previousFrame;

  // Cache the particles at device resolution. Each frame only scrolls these
  // tiles and reuses them inside the inspect frames for the brighter pass.
  const prepare = (cardBody) => {
    const w = cardBody.clientWidth;
    const h = cardBody.clientHeight;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return false;
    if (w === width && h === height && scale === ratio) return true;
    width = w;
    height = h;
    ratio = scale;

    const pixelWidth = Math.round(w * scale), pixelHeight = Math.round(h * scale);
    const sx = pixelWidth / w, sy = pixelHeight / h;
    logoLayer.width = pixelWidth;
    logoLayer.height = pixelHeight;
    logoPaint.setTransform(sx, 0, 0, sy, 0, 0);

    const texture = () => {
      const tile = document.createElement('canvas');
      tile.width = pixelWidth;
      tile.height = pixelHeight;
      const paint = tile.getContext('2d');
      paint.scale(sx, sy);
      paint.fillStyle = '#ffe6db';
      return [tile, paint];
    };
    const [strayTile, strayPaint] = texture();
    const [fieldTile, fieldPaint] = texture();
    for (let x = COLUMN_GAP / 2; x < w; x += COLUMN_GAP) {
      fieldPaint.globalAlpha = 0.21 * random(0.4, 1);
      fieldPaint.fillRect(x - 0.5, 0, 1, h);
      const count = Math.ceil(h / 43);
      for (let row = 0; row < count; row++) {
        if (Math.random() > 0.8) continue;
        const y = (row + Math.random()) * h / count;
        const length = Math.random() < 0.88 ? random(2, 6) : random(6, 40);
        const paint = Math.random() < 0.25 ? strayPaint : fieldPaint;
        paint.globalAlpha = random(0.35, 0.95);
        paint.fillRect(x - 1, y, 2, length);
        if (y + length > h) paint.fillRect(x - 1, y - h, 2, length);
      }
    }
    sparse = strayTile;
    dense = fieldTile;
    cards.forEach((state) => {
      state.canvas.width = pixelWidth;
      state.canvas.height = pixelHeight;
      state.paint.setTransform(sx, 0, 0, sy, 0, 0);
      drawIdle(state);
    });
    return true;
  };

  const clear = () => {
    if (!body) return;
    body.classList.remove('is-signal-hover');
    drawIdle(cards.get(body));
    body = null;
    current = target = lastPointer = null;
    trail.length = 0;
  };

  const begin = (now) => {
    previousFrame = now;
    leaveAt = null;
    bounds = body.parentElement.getBoundingClientRect();
    body.classList.add('is-signal-hover');
    current = target = lastPointer = null;
    trail.length = 0;
    distance = 0;
  };

  const makeBox = ({ x, y }, now) => ({
    x, y, vx: 0, vy: 0,
    w: Math.min(width, snap(random(48, 120))),
    h: Math.min(height, snap(random(52, 120))),
    bornAt: now,
  });

  const follow = (pointer, now) => {
    if (lastPointer !== pointer) {
      lastPointer = pointer;
      const x = clamp((pointer.x - bounds.left) * width / bounds.width, 0, width);
      const y = clamp((pointer.y - bounds.top) * height / bounds.height, 0, height);
      if (target) distance += Math.hypot(x - target.x, y - target.y);
      target = { x, y };
      if (!current) current = makeBox(target, now);
      if (distance >= SPAWN_DISTANCE) {
        trail.push(current);
        if (trail.length === BOX_LIMIT) trail.shift();
        current = makeBox(current, now);
        distance = 0;
      }
    }

    // Integrate the spring using elapsed time so it also works above 60 Hz.
    const frames = Math.min(1.5, (now - previousFrame) * 0.06);
    const drag = 0.75 ** frames;
    current.vx = (current.vx + (snap(target.x) - current.x) * FOLLOW_PULL * frames) * drag;
    current.vy = (current.vy + (snap(target.y) - current.y) * FOLLOW_PULL * frames) * drag;
    current.x += current.vx * frames;
    current.y += current.vy * frames;
    previousFrame = now;
  };

  const paintTile = (paint, tile, fall, alpha) => {
    if (alpha <= 0) return;
    paint.globalAlpha = alpha;
    paint.drawImage(tile, 0, fall - height, width, height);
    paint.drawImage(tile, 0, fall, width, height);
  };

  const paintLogo = (mask, fall) => {
    const scale = Math.min(width * 0.86 / mask.naturalWidth, height * 0.54 / mask.naturalHeight);
    const w = mask.naturalWidth * scale, h = mask.naturalHeight * scale;
    const x = (width - w) / 2, y = height * 0.58 - h / 2;
    logoPaint.clearRect(0, 0, width, height);
    paintTile(logoPaint, sparse, fall, 1);
    paintTile(logoPaint, dense, fall, 1);
    logoPaint.globalCompositeOperation = 'destination-in';
    logoPaint.drawImage(mask, x, y, w, h);
    logoPaint.globalCompositeOperation = 'source-over';
  };

  const boxRect = (box, now) => {
    const grow = easeOut(clamp((now - box.bornAt) / GROW_TIME, 0, 1));
    const w = box.w * grow, h = box.h * grow;
    const left = clamp(box.x - w / 2, 0, width - w);
    const belowBar = Math.min(height * 0.079 + 11, height - h);
    const top = clamp(box.y - h / 2, belowBar, height - h);
    return { left, top, w, h, x: left + w / 2, y: top + h / 2, grow };
  };

  // Connect the edges of the frames so the line stays outside the lens.
  const edgeTowards = (box, other) => {
    const dx = other.x - box.x, dy = other.y - box.y;
    const length = Math.max(Math.abs(dx) / box.w, Math.abs(dy) / box.h) * 2;
    return length ? [box.x + dx / length, box.y + dy / length] : [box.x, box.y];
  };

  const drawInspect = (ctx, fall, hasLogo, active, now) => {
    if (!current) return;
    const frames = [...trail, current].map((box) => boxRect(box, now)).filter(({ grow }) => grow > 0);
    if (!frames.length) return;

    ctx.save();
    ctx.beginPath();
    for (const { left, top, w, h } of frames) ctx.rect(left, top, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.06 * active;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, width, height);
    paintTile(ctx, sparse, fall, 0.48 * active);
    if (hasLogo) {
      // Widen the signal by a pixel on each side inside the lens.
      ctx.globalAlpha = 0.34 * active;
      ctx.drawImage(logoLayer, -1, 0, width, height);
      ctx.drawImage(logoLayer, 1, 0, width, height);
      ctx.globalAlpha = 0.92 * active;
      ctx.drawImage(logoLayer, 0, 0, width, height);
    }
    ctx.restore();

    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < frames.length; i++) {
      ctx.globalAlpha = frames[i].grow * 0.65 * active;
      ctx.beginPath();
      ctx.moveTo(...edgeTowards(frames[i - 1], frames[i]));
      ctx.lineTo(...edgeTowards(frames[i], frames[i - 1]));
      ctx.stroke();
    }

    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    for (const { left, top, w, h, grow } of frames) {
      ctx.globalAlpha = grow * 0.85 * active;
      ctx.strokeRect(left, top, w, h);
      const label = Math.round(left) + ', ' + Math.round(top);
      const labelWidth = ctx.measureText(label).width + 6;
      const labelX = Math.min(left, width - labelWidth);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(labelX, top - 11, labelWidth, 11);
      ctx.fillStyle = '#2d100a';
      ctx.fillText(label, labelX + 3, top - 9);
    }
  };

  const draw = (state, fall, active, now) => {
    const ctx = state.paint;
    state.fall = fall;
    ctx.clearRect(0, 0, width, height);
    paintTile(ctx, sparse, fall, 0.16);
    if (state.mask) {
      paintLogo(state.mask, fall);
      ctx.globalAlpha = LOGO_ALPHA;
      ctx.drawImage(logoLayer, 0, 0, width, height);
    }
    if (active > 0) drawInspect(ctx, fall, Boolean(state.mask), active, now);
  };

  const drawIdle = (state, fall = state.fall) => draw(state, fall, 0, 0);

  const update = (nextBody, pointer, now) => {
    if (body && nextBody !== body) clear();
    if (!nextBody || !width) return;
    const state = cards.get(nextBody);
    const fall = reduceMotion ? 0 : (now * FALL_SPEED / 1000) % height;

    if (pointer && !body) {
      body = nextBody;
      begin(now);
    }
    if (!body) {
      if (!reduceMotion) drawIdle(state, fall);
      return;
    }
    if (reduceMotion) {
      if (!pointer) clear();
      return;
    }

    let active = 1;
    if (pointer) {
      if (leaveAt !== null) begin(now);
      follow(pointer, now);
    } else {
      if (leaveAt === null) {
        leaveAt = now;
        body.classList.remove('is-signal-hover');
      }
      const progress = (now - leaveAt) / LEAVE_TIME;
      if (progress >= 1) { clear(); return; }
      active = 1 - easeOut(progress);
    }

    draw(state, fall, active, now);
  };

  return { prepare, update, clear };
};
