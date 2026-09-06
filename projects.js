// Shared project data — single source of truth for the home grid (index.html)
// and the works page (works.html). Both pages render from this array.
//   code      → uppercase label shown in the home grid header
//   name      → display name (works hero badge / thumbs)
//   category  → space-separated tokens for the home grid category filter
//   year      → used by both the home year filter and the works listing
//   mark      → one-colour logomark, painted white on the hovered list row
//   shots     → detail-page stills used as the thumbs on that row; a project
//               without a detail page yet falls back to its cover + still
const PROJECTS = [
  {
    code: 'KLEVER',
    name: 'Klever',
    year: '2025',
    category: 'web visual',
    image: 'assets/project-3.jpg',
    cover: 'assets/covers/klever.jpg',
    logo: 'assets/logos/klever.png',
    mark: 'assets/klever/k-icon.svg',
    shots: [
      'assets/klever/device-2.png',
      'assets/klever/hero-banner.jpg',
      'assets/klever/banner-2.png',
    ],
    video: 'https://player.vimeo.com/video/1220387401?background=1&autoplay=1&loop=1&muted=1',
    title: 'Klever',
    desc: 'Illuminating the future of decentralized finance through a clean, confident product and brand system.',
    tags: ['WEB APP', 'VISUAL IDENTITY', 'BLOCKCHAIN'],
    listTitle: '[KLEVER] ILLUMINATING THE FUTURE OF DECENTRALIZED FINANCE',
    href: 'klever.html',
  },
  {
    code: 'SURFCASH',
    name: 'SurfCash',
    year: '2024',
    category: 'app',
    image: 'assets/project-1.jpg',
    cover: 'assets/covers/surfcash.jpg',
    logo: 'assets/logos/surfcash.png',
    title: 'Surfcash',
    desc: "What are we good at? Branding, design, and websites. But you've heard that before, true. The expertise lies in perfection.",
    mark: 'assets/logos/surfcash.png',
    // TODO: only two SurfCash stills exist in the repo — the row shows two
    // tiles until a third is added here
    shots: [
      'assets/project-1.jpg',
      'assets/covers/surfcash.jpg',
    ],
    tags: ['MOBILE APP', 'VISUAL IDENTITY', 'BLOCKCHAIN'],
    listTitle: '[SURFCASH] SOLANA MOBILE APPLICATION',
  },
  {
    code: 'ECHO_VERSE',
    name: 'Echo Verse',
    year: '2024',
    category: 'app visual',
    image: 'assets/project-2.jpg',
    cover: 'assets/covers/echo-verse.jpg',
    logo: 'assets/logos/echo-verse.png',
    title: 'Echo Verse',
    desc: 'A PWA social networking platform built for creators — from pixels to perfection, designed to feel alive on every screen.',
    mark: 'assets/logos/echo-verse.png',
    shots: [
      'assets/hero/reel-2.png',
      'assets/covers/echo-verse.jpg',
      'assets/project-2.jpg',
    ],
    tags: ['MOBILE APP', 'SOCIAL MEDIA APP', 'VISUAL IDENTITY'],
    listTitle: '[ECHO VERSE] PWA SOCIAL NETWORKING PLATFORM',
  },
  {
    code: 'NEW_PAY',
    name: 'NewPay',
    year: '2025',
    category: 'app',
    image: 'assets/project-4.jpg',
    cover: 'assets/covers/newpay.jpg',
    logo: 'assets/logos/newpay.png',
    title: 'NewPay',
    desc: 'A new way to spend your crypto — a mobile wallet experience balancing clarity, trust and bold visual identity.',
    mark: 'assets/logos/newpay.png',
    shots: [
      'assets/hero/reel-1.png',
      'assets/covers/newpay.jpg',
      'assets/project-4.jpg',
    ],
    tags: ['COMPANY WEBSITE', 'MOBILE APP', 'CARD DESIGN', 'VISUAL IDENTITY'],
    listTitle: '[NEWPAY] A NEW WAY TO SPEND YOUR CRYPTO',
  },
];
