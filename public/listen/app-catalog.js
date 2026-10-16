// Generated from src/browser/listen/app-catalog.ts by npm run build:browser. Do not edit.
const EP_COLORS = [
  'linear-gradient(135deg,#0E2838,#163850)',
  'linear-gradient(135deg,#1F0E2E,#2A1540)',
  'linear-gradient(135deg,#0E2218,#142E20)',
  'linear-gradient(135deg,#2E1E0E,#3A2810)',
  'linear-gradient(135deg,#0E1E2E,#162840)',
];
const CATEGORY_RULES = {
  Sermons: /\b(homily|sermon|preaching|sunday gospel|gospel reflection)\b/i,
  Theology: /\b(theology|theological|christology|trinity|theosis|dogma|doctrine|incarnation|soteriology)\b/i,
  Prayer: /\b(prayer|jesus prayer|hesychasm|watchfulness|vigil|devotion|spiritual life)\b/i,
  Saints: /\b(saint|st\.|holy father|martyr|apostle|theotokos|elder)\b/i,
  Scripture: /\b(scripture|bible|gospel|epistle|psalm|genesis|exodus|matthew|mark|luke|john|romans|corinthians)\b/i,
  History: /\b(history|byzantine|russia|council|empire|schism|patristic)\b/i,
  Family: /\b(marriage|family|children|parent|homeschool|husband|wife)\b/i,
};
const I = {
  home: (c) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="${c}"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/></svg>`,
  disc: (c) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>`,
  lib: (c) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  person: (c) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  play: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#061522"><polygon points="6,3 21,12 6,21"/></svg>`,
  pause: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#061522"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  // High-Contrast Rewind 15 Button
  back15: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><text x="12" y="15.5" fill="#F6F1E8" font-size="8px" font-family="'DM Sans', sans-serif" font-weight="800" text-anchor="middle" stroke="none">15</text></svg>`,
  // High-Contrast Fast-Forward 30 Button
  fwd30: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F6F1E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/><text x="12" y="15.5" fill="#F6F1E8" font-size="8px" font-family="'DM Sans', sans-serif" font-weight="800" text-anchor="middle" stroke="none">30</text></svg>`,
};
const DEMO_EPS = [];
const CURATED_PODCASTS = [
  {
    title: 'The Lord of Spirits',
    author: 'Fr. Andrew Stephen Damick & Fr. Stephen De Young',
    category: 'Featured',
    description: 'The seen and unseen world in Orthodox Christian tradition.',
    url: 'https://feeds.ancientfaith.com/lordofspirits',
    image: '',
  },
  {
    title: 'Orthodoxy Live',
    author: 'Fr. Evan Armatas',
    category: 'Featured',
    description: 'Answers to listener questions about Orthodox faith and practice.',
    url: 'https://feeds.ancientfaith.com/orthodoxylive',
    image: '',
  },
  {
    title: 'Search the Scriptures Live',
    author: 'Presvytera Dr. Jeannie Constantinou',
    category: 'Scripture & Theology',
    description: 'Holy Scripture read through the mind of the Church and the Fathers.',
    url: 'https://feeds.ancientfaith.com/searchthescriptureslive',
    image: '',
  },
  {
    title: 'The Whole Counsel of God',
    author: 'Fr. Stephen De Young',
    category: 'Scripture & Theology',
    description: 'A verse-by-verse study of Scripture grounded in Orthodox Tradition.',
    url: 'https://feeds.ancientfaith.com/wholecounsel',
    image: '',
  },
  {
    title: 'Ancient Faith Today Live',
    author: 'Fr. Thomas Soroka',
    category: 'Faith & Culture',
    description: 'Contemporary questions and culture considered from an Orthodox perspective.',
    url: 'https://feeds.ancientfaith.com/aftodaylive',
    image: '',
  },
  {
    title: 'The Areopagus',
    author: 'Fr. Andrew Stephen Damick & Pastor Michael Landsman',
    category: 'Faith & Culture',
    description: 'Historic Christianity in conversation with other religious traditions.',
    url: 'https://feeds.ancientfaith.com/areopagus',
    image: '',
  },
  {
    title: 'The Orthodox Apologetics Podcast',
    author: 'Cassian King',
    category: 'Faith & Culture',
    description: 'A reasoned and pastoral defense of Orthodox Christian belief.',
    url: 'https://feeds.ancientfaith.com/the-orthodox-apologetics-podcast',
    image: '',
  },
  {
    title: 'Saint of the Day',
    author: 'Dn. Jerome Atherholt',
    category: 'Daily & Devotional',
    description: 'Brief daily accounts of the saints commemorated by the Church.',
    url: 'https://feeds.ancientfaith.com/saintoftheday',
    image: '',
  },
  {
    title: 'Daily Orthodox Scriptures for Kids',
    author: 'Fr. Alexis Kouri',
    category: 'Family',
    description: 'Short daily Scripture readings and reflections created for children.',
    url: 'https://feeds.ancientfaith.com/dailyscriptureskids',
    image: '',
  },
  {
    title: 'Readings from Under the Grapevine',
    author: 'Dr. Chrissi Hart',
    category: 'Family',
    description: 'Orthodox children’s books and classic stories read aloud.',
    url: 'https://feeds.ancientfaith.com/grapevine',
    image: '',
  },
  {
    title: 'Amon Sûl',
    author: 'Fr. Anthony Cook and guests',
    category: 'Faith & Culture',
    description: 'Tolkien’s legendarium explored through the Orthodox Christian faith.',
    url: 'https://feeds.ancientfaith.com/amonsul',
    image: '',
  },
  {
    title: 'The Roots of Everything',
    author: 'Dr. Zachary Porcu',
    category: 'History & Ideas',
    description: 'The history of ideas that shaped the modern world.',
    url: 'https://feeds.ancientfaith.com/the_roots_of_everything',
    image: '',
  },
];
const GOLD = '#C8A24A';
const NIGHT = '#061522';
const NIGHT2 = '#0B2130';
const CREAM = '#F6F1E8';
const MUTED = '#A69F91';
const STONE = '#4a4038';
export { CATEGORY_RULES, CREAM, CURATED_PODCASTS, DEMO_EPS, EP_COLORS, GOLD, I, MUTED, NIGHT, NIGHT2, STONE };
