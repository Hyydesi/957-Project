const PROJECTS = [
  {
    name: 'SurfCash',
    year: '2025',
    image: 'assets/project-1.jpg',
    title: 'Surfcash',
    desc: "What are we good at? Branding, design, and websites. But you've heard that before, true. The expertise lies in perfection.",
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '(SURFCASH) SOLANA MOBILE APPLICATION',
  },
  {
    name: 'Echo Verse',
    year: '2024',
    image: 'assets/project-2.jpg',
    title: 'Echo Verse',
    desc: 'A PWA social networking platform built for creators — from pixels to perfection, designed to feel alive on every screen.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: 'ECHO VERSE: PWA SOCIAL NETWORKING PLATFORM',
  },
  {
    name: 'NewPay',
    year: '2024',
    image: 'assets/project-4.jpg',
    title: 'NewPay',
    desc: 'A new way to spend your crypto — a mobile wallet experience balancing clarity, trust and bold visual identity.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '(NEWPAY) A NEW WAY TO SPEND YOUR CRYPTO',
  },
  {
    name: 'Klever',
    year: '2025',
    image: 'assets/project-3.jpg',
    title: 'Klever',
    desc: 'Illuminating the future of decentralized finance through a clean, confident product and brand system.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '(KLEVER) ILLUMINATING THE FUTURE OF DECENTRALIZED FINANCE',
    href: 'klever.html',
  },
];

const AUTOPLAY_MS = 6000;

// ---------- Hero showcase ----------
const wpHeroImg = document.getElementById('wpHeroImg');
const wpTitle = document.getElementById('wpTitle');
const wpDesc = document.getElementById('wpDesc');
const wpBadgeName = document.getElementById('wpBadgeName');
const wpBadgeYear = document.getElementById('wpBadgeYear');
const wpProgress = document.getElementById('wpProgress');
const wpThumbs = document.getElementById('wpThumbs');
const wpCaseLink = document.getElementById('wpCaseLink');

let activeSlide = 0;
let autoplayTimer = null;

function renderThumbs() {
  wpThumbs.innerHTML = PROJECTS.map((p, i) => `
    <button class="wp-thumb${i === activeSlide ? ' is-active' : ''}" data-index="${i}">
      <img src="${p.image}" alt="${p.name}">
    </button>
  `).join('');
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
  wpHeroImg.style.opacity = 0;
  setTimeout(() => {
    wpHeroImg.src = p.image;
    wpHeroImg.style.opacity = 1;
  }, 200);
  wpTitle.textContent = p.title;
  wpDesc.textContent = p.desc;
  wpBadgeName.textContent = p.name;
  wpBadgeYear.textContent = p.year;
  if (p.href) {
    wpCaseLink.href = p.href;
    wpCaseLink.hidden = false;
  } else {
    wpCaseLink.hidden = true;
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

renderThumbs();
renderProgress();
restartAutoplay();

// ---------- Project listing ----------
const wlistGrid = document.getElementById('wlistGrid');
const wlistView = document.getElementById('wlistView');

wlistGrid.innerHTML = PROJECTS.map((p) => {
  const Tag = p.href ? 'a' : 'div';
  const hrefAttr = p.href ? `href="${p.href}"` : '';
  return `
  <article class="wcard">
    <${Tag} class="wcard__link" ${hrefAttr}>
      <div class="wcard__img"><img src="${p.image}" alt="${p.name}"></div>
      <div class="wcard__meta">
        <div class="wcard__logo">${p.name.charAt(0)}</div>
        <div class="wcard__info">
          <div class="wcard__tags">${p.tags.map((t) => `<span>${t}</span>`).join('')}</div>
          <h3 class="wcard__title">${p.listTitle}</h3>
        </div>
        <span class="wcard__year">${p.year}</span>
      </div>
    </${Tag}>
  </article>
`;
}).join('');

wlistView.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  wlistView.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  wlistGrid.classList.remove('is-list', 'is-full');
  if (btn.dataset.view === 'list') wlistGrid.classList.add('is-list');
  if (btn.dataset.view === 'full') wlistGrid.classList.add('is-full');
});
