// Generated from src/lib/core-shared.ts by npm run build:server. Do not edit.
import './database-reads.js';
import { json } from './http-responses.js';
import './kv-reads.js';
import './normalize-email.js';
import './kv-reads.js';
import './json-rows.js';
import './core.js';
import './core-authentication.js';
import './core-sessions.js';
const ADMIN_PASSWORD_KV_KEY = '__agapay_admin_password';
const ADMIN_SESSION_STORE_KEY = '__agapay_admin_sessions';
const COMMEMORATION_KEY_PREFIX = '__agapay_commemoration__';
const DONOR_KEY_PREFIX = '__agapay_donor__';
const DONOR_CHECKOUT_INDEX_PREFIX = '__agapay_checkout_offering__';
const RATE_LIMIT_PREFIX = '__agapay_rate_limit__';
const STRIPE_EVENT_PREFIX = '__agapay_stripe_event__';
const PARISH_ID_INDEX_PREFIX = '__agapay_index_parish_id__';
const STRIPE_ACCOUNT_INDEX_PREFIX = '__agapay_index_stripe_account__';
const STRIPE_SUBSCRIPTION_INDEX_PREFIX = '__agapay_index_stripe_subscription__';
const STRIPE_PAYMENT_INTENT_INDEX_PREFIX = '__agapay_index_payment_intent__';
const PASSWORD_HASH_VERSION = 'pbkdf2-sha256';
const PASSWORD_HASH_ITERATIONS = 1e5;
const DONOR_SESSION_TTL_MS = 1e3 * 60 * 60 * 24 * 14;
const ADMIN_SESSION_TTL_MS = 1e3 * 60 * 60 * 12;
const ADMIN_SESSION_MAX = 32;
const PARISH_SESSION_TTL_MS = 1e3 * 60 * 60 * 12;
const PARISH_SESSION_MAX = 16;
const STRIPE_EVENT_PROCESSING_RETRY_MS = 1e3 * 60 * 10;
const marketplaceBrowseCategories = [
  { id: 'all', label: 'All Categories', icon: 'grid' },
  { id: 'books-media', label: 'Books & Media', icon: 'book-open' },
  { id: 'icons-artwork', label: 'Icons & Artwork', icon: 'image' },
  { id: 'church-supplies', label: 'Church Supplies', icon: 'cross' },
  { id: 'vestments-apparel', label: 'Vestments & Apparel', icon: 'shirt' },
  { id: 'jewelry-crosses', label: 'Jewelry & Crosses', icon: 'jewel' },
  { id: 'monastery-goods', label: 'Monastery Goods', icon: 'church' },
  { id: 'home-gifts', label: 'Home & Gifts', icon: 'gift' },
  { id: 'children-education', label: 'Children & Education', icon: 'users' },
  { id: 'music-chant', label: 'Music & Chant', icon: 'music' },
  { id: 'digital-products', label: 'Digital Products', icon: 'monitor' },
];
const marketplaceFeaturedFilters = [
  { id: 'all', label: 'All Listings', icon: 'star' },
  { id: 'new-arrivals', label: 'New Arrivals', icon: 'spark' },
  { id: 'best-sellers', label: 'Best Sellers', icon: 'chart' },
  { id: 'orthodox-makers', label: 'Orthodox Makers', icon: 'shield' },
  { id: 'monastery-shops', label: 'Monastery Shops', icon: 'church' },
  { id: 'on-sale', label: 'On Sale', icon: 'tag' },
];
const marketplaceShops = [
  {
    id: 'holy-cross-monastery',
    name: 'Holy Cross Monastery',
    subtitle: 'Monastery Shop',
    location: 'Wayne, WV',
    rating: 4.9,
    reviewCount: 230,
    badge: 'Top Rated',
    imageType: 'icon',
    imageUrl: '',
    category: 'monastery-goods',
    tags: ['orthodox-makers', 'best-sellers', 'monastery-shops'],
  },
  {
    id: 'mount-athos-icons',
    name: 'Mount Athos Icons',
    subtitle: 'Icons & Artwork',
    location: 'Athos, Greece',
    rating: 4.9,
    reviewCount: 184,
    badge: 'Top Rated',
    imageType: 'photo',
    imageUrl: '/images/marketplace/interior-iconostasis.jpg',
    category: 'icons-artwork',
    tags: ['best-sellers', 'orthodox-makers'],
  },
  {
    id: 'ancient-faith-publishing',
    name: 'Ancient Faith Publishing',
    subtitle: 'Books & Media',
    location: 'West Chester, PA',
    rating: 4.8,
    reviewCount: 312,
    badge: 'Top Rated',
    imageType: 'photo',
    imageUrl: '/images/marketplace/mosaic-dome.jpg',
    category: 'books-media',
    tags: ['best-sellers', 'new-arrivals'],
  },
  {
    id: 'orthodox-jewelry-co',
    name: 'Orthodox Jewelry Co.',
    subtitle: 'Jewelry & Crosses',
    location: 'Boston, MA',
    rating: 4.8,
    reviewCount: 156,
    badge: 'Top Rated',
    imageType: 'photo',
    imageUrl: '/images/marketplace/enamel-lampada.jpg',
    category: 'jewelry-crosses',
    tags: ['best-sellers', 'new-arrivals'],
  },
  {
    id: 'st-elizabeth-convent',
    name: 'St. Elizabeth Convent',
    subtitle: 'Candles & Goods',
    location: 'Minsk, BY',
    rating: 4.7,
    reviewCount: 98,
    badge: 'Orthodox Maker',
    imageType: 'photo',
    imageUrl: '/images/marketplace/candle-stand.jpg',
    category: 'church-supplies',
    tags: ['orthodox-makers', 'new-arrivals'],
  },
];
const marketplaceProducts = [
  {
    id: 'theotokos-of-tenderness-icon',
    title: 'Theotokos of Tenderness Icon',
    shopName: 'Mount Athos Icons',
    priceCents: 18900,
    imageUrl: '/images/marketplace/interior-iconostasis.jpg',
    category: 'icons-artwork',
    tags: ['best-sellers', 'orthodox-makers'],
  },
  {
    id: 'the-way-of-a-pilgrim',
    title: 'The Way of a Pilgrim',
    shopName: 'Ancient Faith Publishing',
    priceCents: 1495,
    imageUrl: '/images/marketplace/dome-cross.jpg',
    category: 'books-media',
    tags: ['best-sellers', 'new-arrivals'],
  },
  {
    id: 'wool-prayer-rope-100-knot',
    title: 'Wool Prayer Rope 100 Knot',
    shopName: 'Holy Cross Monastery',
    priceCents: 3300,
    imageUrl: '/images/marketplace/gilded-censer.jpg',
    category: 'jewelry-crosses',
    tags: ['orthodox-makers', 'best-sellers', 'monastery-shops'],
  },
  {
    id: 'beeswax-altar-candle',
    title: 'Beeswax Altar Candle',
    shopName: 'St. Elizabeth Convent',
    priceCents: 1200,
    imageUrl: '/images/marketplace/candle-stand.jpg',
    category: 'church-supplies',
    tags: ['new-arrivals', 'orthodox-makers'],
  },
  {
    id: 'hand-carved-orthodox-cross',
    title: 'Hand Carved Orthodox Cross',
    shopName: 'Orthodox Woodworker',
    priceCents: 4500,
    imageUrl: '/images/marketplace/enamel-lampada.jpg',
    category: 'home-gifts',
    tags: ['orthodox-makers', 'best-sellers'],
  },
  {
    id: 'akathist-prayer-book',
    title: 'Akathist Prayer Book',
    shopName: 'Ancient Faith Publishing',
    priceCents: 1895,
    imageUrl: '/images/marketplace/mosaic-dome.jpg',
    category: 'books-media',
    tags: ['new-arrivals', 'on-sale'],
  },
  {
    id: 'incense-charcoal-set',
    title: 'Incense + Charcoal Set',
    shopName: 'Holy Cross Monastery',
    priceCents: 2200,
    imageUrl: '/images/marketplace/gilded-censer.jpg',
    category: 'church-supplies',
    tags: ['monastery-shops', 'best-sellers'],
  },
  {
    id: 'orthodox-childrens-primer',
    title: "Orthodox Children's Primer",
    shopName: 'Ancient Faith Publishing',
    priceCents: 2495,
    imageUrl: '/images/marketplace/dome-cross.jpg',
    category: 'children-education',
    tags: ['new-arrivals'],
  },
];
const STEWARDSHIP_ACTIVE_STATES = /* @__PURE__ */ new Set(['active', 'trialing']);
async function rateLimitCounter(env, key, { limit = 10, windowSeconds = 60 } = {}) {
  let next;
  try {
    if (!env.AGAPAY_RATE_LIMITER) throw new Error('Rate limiter binding unavailable');
    const response = await env.AGAPAY_RATE_LIMITER.get(env.AGAPAY_RATE_LIMITER.idFromName(key)).fetch(
      'https://rate-limit.internal/',
      {
        method: 'POST',
        body: JSON.stringify({ limit, expiresAt: Date.now() + windowSeconds * 2e3 }),
      }
    );
    if (!response.ok) throw new Error('Rate limiter request failed');
    next = (await response.json()).attempts;
    if (!Number.isInteger(next) || next < 1) throw new Error('Invalid rate limiter response');
  } catch {
    console.error(JSON.stringify({ eventType: 'rate_limit.unavailable', severity: 'error' }));
    return json(
      { error: 'Request protection is temporarily unavailable. Please try again.' },
      { status: 503, headers: { 'Retry-After': '30' } }
    );
  }
  if (next <= limit) return null;
  return json(
    {
      error: 'Too many attempts. Please wait a moment and try again.',
      retryAfterSeconds: windowSeconds,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(windowSeconds) },
    }
  );
}
function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_MAX,
  ADMIN_SESSION_STORE_KEY,
  ADMIN_SESSION_TTL_MS,
  COMMEMORATION_KEY_PREFIX,
  DONOR_CHECKOUT_INDEX_PREFIX,
  DONOR_KEY_PREFIX,
  DONOR_SESSION_TTL_MS,
  PARISH_ID_INDEX_PREFIX,
  PARISH_SESSION_MAX,
  PARISH_SESSION_TTL_MS,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  RATE_LIMIT_PREFIX,
  STEWARDSHIP_ACTIVE_STATES,
  STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_EVENT_PREFIX,
  STRIPE_EVENT_PROCESSING_RETRY_MS,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  marketplaceBrowseCategories,
  marketplaceFeaturedFilters,
  marketplaceProducts,
  marketplaceShops,
  rateLimitCounter,
  toHex,
};
