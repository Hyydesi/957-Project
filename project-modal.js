// ---------- Project modal (index.html, works.html; Figma 1564:7519) ----------
// A click on a project in Home's Work grid (or, on the Works page, on a card
// with no case study page yet) opens it as a quick view: a large card over
// the page, the page blurred behind it. The card is the case study in small:
// a grey bar with the project's name across the top, the case study itself
// scrolling underneath it, and down the right a dark column with the
// project's mark, its facts and its description that stays put. The cards sit
// side by side in a row: drag the row (or swipe, a sideways trackpad swipe,
// the arrow keys) to bring the next project in; Esc, the cross at the top of
// the side column or a click outside the card puts it all away.
//
// A project with a case study page (its href in projects.js) gets a white
// "View full case study" button at the end of its bar, and that page's
// own sections, fetched and dropped in (klever.html → its .kl sections, styled
// by klever.css), so the modal and the page never drift apart. The rest get
// their cover, description and a note that the case study is on its way.
(function projectModal() {
  if (typeof PROJECTS === 'undefined') return;

  // the mark at the top of the side column, where the modal shows the brand's
  // own lockup rather than the round app icon in projects.js
  const BRAND = {
    KLEVER: { mark: 'assets/klever/k-logo-lime.svg', face: "'Chakra Petch', sans-serif" },
  };

  const root = document.createElement('div');
  root.className = 'pmodal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Project');
  root.tabIndex = -1;
  root.hidden = true;
  root.innerHTML = `
    <div class="pmodal__backdrop"></div>
    <div class="pmodal__track"></div>`;
  document.body.appendChild(root);
  const track = root.querySelector('.pmodal__track');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

  // ---- one card per project ----
  const cards = PROJECTS.map((p, i) => {
    const brand = BRAND[p.code] || {};
    const el = document.createElement('article');
    el.className = 'pcard';
    el.setAttribute('aria-label', p.name);
    el.innerHTML = `
      <div class="pcard__main">
        <div class="pcard__bar"><span>${esc(p.name)}</span>${p.href ? `<a class="pcard__full" href="${esc(p.href)}">View full case study</a>` : ''}</div>
        <h2 class="pcard__title"><span>${esc(p.title || p.name)}</span></h2>
        <div class="pcard__body"></div>
      </div>
      <aside class="pcard__side">
        <div class="pcard__brand">
          <img src="${esc(brand.mark || p.logo || p.mark || '')}" alt="">
          <span style="${brand.face ? `font-family:${brand.face}` : ''}">${esc(p.name)}</span>
        </div>
        <dl class="pcard__meta kl-meta">
          <div class="kl-meta__row"><dt>Year</dt><dd>${esc(p.year)}</dd></div>
          ${p.listType ? `<div class="kl-meta__row"><dt>Type</dt><dd>${esc(p.listType.split('・').map(sentence).join(', '))}</dd></div>` : ''}
          ${(p.listTags || []).length ? `<div class="kl-meta__row"><dt>Scope</dt><dd class="kl-meta__list">${p.listTags.map((t) => esc(sentence(t))).join('<br>')}</dd></div>` : ''}
        </dl>
        <p class="pcard__desc">${esc(p.desc || '')}</p>
      </aside>
      <button type="button" class="pcard__close" aria-label="Close"><img src="assets/modal/close.svg" alt=""></button>`;
    // until (or unless) a case study comes in: the cover and a note
    el.querySelector('.pcard__body').innerHTML = `
      <figure class="pcard__cover"><img src="${esc(p.cover || p.image)}" alt="" loading="lazy"></figure>
      <p class="pcard__soon">${p.href ? 'Loading the case study…' : 'Case study coming soon'}</p>`;
    track.appendChild(el);
    return { el, p, i, loaded: false };
  });

  // the case study page's own sections, minus its hero (its title and facts
  // move to the card's title and side column), its related work and the
  // site footer that closes the page
  const caseCache = new Map();
  const loadCase = (card) => {
    const { p, el } = card;
    if (!p.href || card.loaded) return;
    card.loaded = true;
    if (!caseCache.has(p.href)) {
      caseCache.set(p.href, fetch(p.href).then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => new DOMParser().parseFromString(html, 'text/html')));
    }
    caseCache.get(p.href).then((doc) => {
      const main = doc.querySelector('main.kl');
      if (!main) throw new Error('no case study');
      const hero = main.querySelector('.kl-hero');
      const title = hero && hero.querySelector('.kl-hero__title');
      if (title) { el.querySelector('.pcard__title span').textContent = title.textContent; fitTitle(card); }
      const meta = hero && hero.querySelector('.kl-meta');
      if (meta) {
        const dl = el.querySelector('.pcard__meta');
        dl.innerHTML = meta.innerHTML;
        dl.querySelectorAll('[data-cms],[data-cms-label],[data-cms-group]').forEach((n) => {
          n.removeAttribute('data-cms'); n.removeAttribute('data-cms-label'); n.removeAttribute('data-cms-group');
        });
      }
      const desc = hero && hero.querySelector('.kl-hero__desc');
      if (desc) el.querySelector('.pcard__desc').textContent = desc.textContent;
      const body = el.querySelector('.pcard__body');
      const wrap = document.createElement('div');
      wrap.className = 'kl pcard__case';
      [...main.children].forEach((n) => {
        if (n.matches('.kl-hero, .kl-more, .sfooter, footer, script')) return;
        wrap.appendChild(document.importNode(n, true));
      });
      // page-relative asset paths stay right: the case study sits beside works.html
      body.replaceChildren(wrap);
    }).catch(() => {
      const soon = el.querySelector('.pcard__soon');
      if (soon) soon.innerHTML = `<a href="${esc(p.href)}">Open the case study →</a>`;
    });
  };

  // the heading runs the full width of the case-study column, whatever the
  // name: its size is worked out from how wide it sets at 100px
  const fitTitle = (card) => {
    const h = card.el.querySelector('.pcard__title');
    const span = h.firstElementChild;
    if (!h.clientWidth) return;
    const cs = getComputedStyle(h);
    const room = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    span.style.fontSize = '100px';
    // layout width, not the on-screen box: the card may be turned or shrunk
    const w = span.offsetWidth;
    if (w) span.style.fontSize = `${(100 * room / w).toFixed(2)}px`;
  };
  const fitAll = () => cards.forEach(fitTitle);
  if (document.fonts) document.fonts.ready.then(() => { if (open) fitAll(); });

  // ---- the row: one card in the middle, its neighbours peeking in ----
  let index = 0;
  let offset = 0;           // px the row is dragged off its resting place
  let open = false;
  const pitch = () => cards[0].el.offsetWidth + parseFloat(getComputedStyle(track).columnGap || 0);
  const place = (animate) => {
    track.classList.toggle('is-gliding', !!animate);
    const x = (window.innerWidth - cards[0].el.offsetWidth) / 2 - index * pitch() + offset;
    track.style.transform = `translate3d(${x}px,0,0)`;
    cards.forEach((c, i) => {
      c.el.classList.toggle('is-current', i === index);
      c.el.classList.toggle('is-before', i < index);
      c.el.classList.toggle('is-after', i > index);
    });
  };
  const goTo = (i) => {
    index = Math.max(0, Math.min(cards.length - 1, i));
    offset = 0;
    place(true);
    // load this one and the next so a drag finds it ready
    [index, index + 1, index - 1].forEach((k) => cards[k] && loadCase(cards[k]));
  };

  // ---- open / close ----
  let lastFocus = null;
  const openAt = (i) => {
    lastFocus = document.activeElement;
    root.hidden = false;
    index = i;
    offset = 0;
    place(false);
    fitAll();
    [i, i + 1, i - 1].forEach((k) => cards[k] && loadCase(cards[k]));
    cards[i].el.querySelector('.pcard__main').scrollTop = 0;
    document.body.classList.add('is-pmodal-open');
    // the card flies up from under the screen, turned, and settles flat in
    // the middle (Figma 1564:7668 is a frame of that flight)
    root.classList.remove('is-open');
    void root.offsetWidth;
    root.classList.add('is-open');
    open = true;
    // focus the dialog itself rather than the cross, so the cross doesn't open
    // with a focus ring round it; Tab still reaches it
    root.focus({ preventScroll: true });
  };
  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    document.body.classList.remove('is-pmodal-open');
    const done = () => { if (!open) root.hidden = true; };
    if (still) done(); else setTimeout(done, 650);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  };
  // a click outside the cards (on the blurred page) closes
  root.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    if (e.target.closest('.pcard__close') || !e.target.closest('.pcard')) { close(); return; }
    // a click on a neighbour brings it to the middle instead of following it
    const card = e.target.closest('.pcard');
    if (card && !card.classList.contains('is-current')) {
      e.preventDefault();
      goTo(cards.findIndex((c) => c.el === card));
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goTo(index + 1);
    else if (e.key === 'ArrowLeft') goTo(index - 1);
    else return;
    e.preventDefault();
  });
  window.addEventListener('resize', () => { if (open) { fitAll(); place(false); } });

  // ---- drag: the row follows the pointer sideways; let go, it moves on a
  // card if flicked or pulled a quarter of the way, else settles back.
  // Upright movement is left to the card's own scroll. ----
  let drag = null;
  let dragged = false;
  track.addEventListener('pointerdown', (e) => {
    if (!open || e.button !== 0 || e.target.closest('a, button')) return;
    drag = { x0: e.clientX, y0: e.clientY, t: performance.now(), on: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.on) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 8) return;
      drag.on = true;
      root.classList.add('is-dragging');
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }
    // rubbery past either end
    const atEnd = (index === 0 && dx > 0) || (index === cards.length - 1 && dx < 0);
    offset = atEnd ? dx * 0.3 : dx;
    place(false);
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const was = drag;
    drag = null;
    root.classList.remove('is-dragging');
    if (!was.on) return;
    // swallow the click this drag ends in, and only that one
    dragged = true;
    setTimeout(() => { dragged = false; }, 60);
    const v = offset / Math.max(1, performance.now() - was.t);
    const step = Math.abs(offset) > pitch() * 0.25 || Math.abs(v) > 0.6 ? -Math.sign(offset) : 0;
    goTo(index + step);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // a sideways trackpad swipe moves one card a gesture
  let lockUntil = 0;
  root.addEventListener('wheel', (e) => {
    if (!open || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    const now = performance.now();
    if (now < lockUntil) { lockUntil = now + 160; return; }
    lockUntil = now + 520;
    goTo(index + Math.sign(e.deltaX));
  }, { passive: false });

  window.openProjectModal = openAt;
  window.projectModalOpen = () => open;
})();
