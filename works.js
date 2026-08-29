// PROJECTS is defined in projects.js (loaded before this file) — single source of truth.
const AUTOPLAY_MS = 6000;

// ---------- Hero showcase ----------
const wpHeroImg = document.getElementById('wpHeroImg');
const wpTitle = document.getElementById('wpTitle');
const wpDesc = document.getElementById('wpDesc');
const wpBadgeName = document.getElementById('wpBadgeName');
const wpBadgeYear = document.getElementById('wpBadgeYear');
const wpProgress = document.getElementById('wpProgress');
const wpThumbs = document.getElementById('wpThumbs');
const wpBadgeIcon = document.getElementById('wpBadgeIcon');

let activeSlide = 0;
let autoplayTimer = null;

// Swap an image back to the project still if its logo file isn't there yet,
// so a missing asset degrades instead of showing a broken image.
function withFallback(img, fallback) {
  img.addEventListener('error', () => { img.src = fallback; }, { once: true });
}

function renderThumbs() {
  wpThumbs.innerHTML = PROJECTS.map((p, i) => `
    <button class="wp-thumb${i === activeSlide ? ' is-active' : ''}" data-index="${i}" aria-label="${p.name}">
      <img src="${p.logo || p.image}" alt="">
    </button>
  `).join('');
  wpThumbs.querySelectorAll('img').forEach((img, i) => withFallback(img, PROJECTS[i].image));
}

function renderProgress() {
  wpProgress.innerHTML = PROJECTS.map((_, i) => `
    <span class="wp-hero__seg${i === activeSlide ? ' is-active' : ''}">
      <span class="wp-hero__seg-fill" style="width:${i < activeSlide ? '100' : '0'}%"></span>
    </span>
  `).join('');
}

function goToSlide(index) {
  activeSlide = (index + PROJECTS.length) % PROJECTS.length;
  const p = PROJECTS[activeSlide];
  // hero uses a dedicated cover image when one exists, falling back to the
  // project still — the listing grid below always keeps using p.image
  const heroSrc = p.cover || p.image;
  // skip the cross-fade when the image is already the one on screen (first paint)
  if (wpHeroImg.getAttribute('src') !== heroSrc) {
    wpHeroImg.style.opacity = 0;
    setTimeout(() => {
      wpHeroImg.src = heroSrc;
      wpHeroImg.style.opacity = 1;
    }, 200);
  }
  wpTitle.textContent = p.title;
  wpDesc.textContent = p.desc;
  wpBadgeName.textContent = p.name;
  wpBadgeYear.textContent = p.year;
  // each project carries its own mark; hidden until one is supplied
  if (p.logo) {
    wpBadgeIcon.hidden = false;
    withFallback(wpBadgeIcon, p.image);
    wpBadgeIcon.src = p.logo;
  } else {
    wpBadgeIcon.removeAttribute('src');
    wpBadgeIcon.hidden = true;
  }
  renderThumbs();
  renderProgress();
  restartAutoplay();
}

function restartAutoplay() {
  clearTimeout(autoplayTimer);
  const fill = wpProgress.querySelector('.wp-hero__seg.is-active .wp-hero__seg-fill');
  if (fill) {
    requestAnimationFrame(() => {
      fill.style.transitionDuration = `${AUTOPLAY_MS}ms`;
      fill.style.width = '100%';
    });
  }
  autoplayTimer = setTimeout(() => goToSlide(activeSlide + 1), AUTOPLAY_MS);
}

wpThumbs.addEventListener('click', (e) => {
  const btn = e.target.closest('.wp-thumb');
  if (!btn) return;
  goToSlide(Number(btn.dataset.index));
});

// drive the first slide through the same path as every other one, so the badge
// icon and the rest can't drift from the markup's placeholder text
goToSlide(0);

// ---------- Project listing ----------
const wlistGrid = document.getElementById('wlistGrid');

wlistGrid.innerHTML = PROJECTS.map((p) => {
  const Tag = p.href ? 'a' : 'div';
  const hrefAttr = p.href ? `href="${p.href}"` : '';
  return `
  <article class="wcard">
    <${Tag} class="wcard__link" ${hrefAttr}>
      <div class="wcard__img">${p.video
        ? `<iframe class="wcard__video" src="${p.video}" title="${p.name}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe><div class="wcard__video-mask"></div>`
        : `<img src="${p.image}" alt="${p.name}">`}</div>
      <div class="wcard__meta">
        <div class="wcard__logo">${p.name.charAt(0)}</div>
        <div class="wcard__info">
          <div class="wcard__tags">${p.tags.map((t) => `<span>${t}</span>`).join('')}</div>
          <h3 class="wcard__title">${p.listTitle}</h3>
          ${p.href ? '' : '<p class="wcard__soon">Coming soon</p>'}
        </div>
        <span class="wcard__year">${p.year}</span>
      </div>
    </${Tag}>
  </article>
`;
}).join('');
