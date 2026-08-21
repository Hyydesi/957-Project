// Shared project data — single source of truth for the home grid (index.html)
// and the works page (works.html). Both pages render from this array.
//   code      → uppercase label shown in the home grid header
//   name      → display name (works hero badge / thumbs)
//   category  → space-separated tokens for the home grid category filter
//   year      → used by both the home year filter and the works listing
const PROJECTS = [
  {
    code: 'SURFCASH',
    name: 'SurfCash',
    year: '2024',
    category: 'app web',
    image: 'assets/project-1.jpg',
    title: 'Surfcash',
    desc: "What are we good at? Branding, design, and websites. But you've heard that before, true. The expertise lies in perfection.",
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '[SURFCASH] SOLANA MOBILE APPLICATION',
  },
  {
    code: 'ECHO_VERSE',
    name: 'Echo Verse',
    year: '2024',
    category: 'app visual',
    image: 'assets/project-2.jpg',
    title: 'Echo Verse',
    desc: 'A PWA social networking platform built for creators — from pixels to perfection, designed to feel alive on every screen.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '[ECHO VERSE] PWA SOCIAL NETWORKING PLATFORM',
  },
  {
    code: 'NEW_PAY',
    name: 'NewPay',
    year: '2025',
    category: 'app',
    image: 'assets/project-4.jpg',
    title: 'NewPay',
    desc: 'A new way to spend your crypto — a mobile wallet experience balancing clarity, trust and bold visual identity.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '[NEWPAY] A NEW WAY TO SPEND YOUR CRYPTO',
  },
  {
    code: 'KLEVER',
    name: 'Klever',
    year: '2025',
    category: 'web visual',
    image: 'assets/project-3.jpg',
    title: 'Klever',
    desc: 'Illuminating the future of decentralized finance through a clean, confident product and brand system.',
    tags: ['MOBILE APP', 'WEB DESIGN', 'ART DIRECTION'],
    listTitle: '[KLEVER] ILLUMINATING THE FUTURE OF DECENTRALIZED FINANCE',
    href: 'klever.html',
  },
];
