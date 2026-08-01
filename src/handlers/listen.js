/**
 * AGAPAY Listen — Worker API handlers
 * Add to src/worker.js (see DEPLOY.md for exact insertion points).
 *
 * Provides two endpoints:
 *   GET /api/listen/search?q=...   → Podcast Index search (HMAC auth)
 *   GET /api/listen/rss?url=...    → RSS feed proxy (CORS bypass)
 *   GET/POST /api/listen/progress → private donor playback memory
 */

import { json, missingProductionStoreResponse, normalizeEmail, unauthorized } from '../lib/core.js';
import { requireDonor } from './parish.js';

const PODCAST_PROGRESS_LIMIT = 50;
const PODCAST_COMPLETE_WINDOW_SECONDS = 5;
const PODCAST_PLAYBACK_RATES = new Set([1, 1.25, 1.5, 1.75, 2]);

function podcastDatabase(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function boundedText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function podcastUrl(value) {
  const raw = boundedText(value, 4096);
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function playbackRate(value) {
  const parsed = Number(value);
  return PODCAST_PLAYBACK_RATES.has(parsed) ? parsed : null;
}

function progressRow(row) {
  return {
    episodeKey: row.episode_key,
    feedUrl: row.feed_url,
    showTitle: row.show_title || '',
    episodeTitle: row.episode_title || '',
    positionSeconds: Math.max(0, Number(row.position_seconds) || 0),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
      ? null
      : Math.max(0, Number(row.duration_seconds) || 0),
    updatedAt: row.updated_at,
  };
}

function subscriptionRow(row) {
  return {
    feedUrl: row.feed_url,
    title: row.show_title,
    artwork: row.artwork_url || '',
    website: row.website_url || '',
    author: row.author || '',
    subscribedAt: row.subscribed_at,
    updatedAt: row.updated_at,
  };
}

export async function handleListenSubscriptions(request, env, dependencies = {}) {
  const db = podcastDatabase(env);
  if (!db) return missingProductionStoreResponse();
  const authenticate = dependencies.requireDonor || requireDonor;
  const donor = await authenticate(request, env);
  if (!donor?.email) return unauthorized();
  const donorId = normalizeEmail(donor.email);

  if (request.method === 'GET') {
    const result = await db.prepare(`
      SELECT feed_url, show_title, artwork_url, website_url, author, subscribed_at, updated_at
      FROM donor_podcast_subscriptions
      WHERE donor_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `).bind(donorId).all();
    return json({ subscriptions: (result.results || []).map(subscriptionRow) });
  }

  if (request.method === 'POST') {
    const input = await request.json().catch(() => ({}));
    const feedUrl = podcastUrl(input.feedUrl);
    const title = boundedText(input.title, 300);
    if (!feedUrl || !title) return json({ error: 'A valid feedUrl and podcast title are required' }, { status: 400 });
    const artwork = podcastUrl(input.artwork);
    const website = podcastUrl(input.website);
    const author = boundedText(input.author, 300);
    await db.prepare(`
      INSERT INTO donor_podcast_subscriptions (
        donor_id, feed_url, show_title, artwork_url, website_url, author, subscribed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(donor_id, feed_url) DO UPDATE SET
        show_title = excluded.show_title,
        artwork_url = excluded.artwork_url,
        website_url = excluded.website_url,
        author = excluded.author,
        updated_at = datetime('now')
    `).bind(donorId, feedUrl, title, artwork || null, website || null, author || null).run();
    const row = await db.prepare(`
      SELECT feed_url, show_title, artwork_url, website_url, author, subscribed_at, updated_at
      FROM donor_podcast_subscriptions WHERE donor_id = ? AND feed_url = ?
    `).bind(donorId, feedUrl).first();
    return json({ ok: true, subscription: subscriptionRow(row) }, { status: 201 });
  }

  if (request.method === 'DELETE') {
    const feedUrl = podcastUrl(new URL(request.url).searchParams.get('url'));
    if (!feedUrl) return json({ error: 'A valid podcast feed URL is required' }, { status: 400 });
    await db.prepare('DELETE FROM donor_podcast_subscriptions WHERE donor_id = ? AND feed_url = ?').bind(donorId, feedUrl).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleListenProgress(request, env, dependencies = {}) {
  const db = podcastDatabase(env);
  if (!db) return missingProductionStoreResponse();
  const authenticate = dependencies.requireDonor || requireDonor;
  const donor = await authenticate(request, env);
  if (!donor?.email) return unauthorized();
  const donorId = normalizeEmail(donor.email);

  if (request.method === 'GET') {
    const [progressResult, preference] = await Promise.all([
      db.prepare(`
        SELECT episode_key, feed_url, show_title, episode_title, position_seconds, duration_seconds, updated_at
        FROM donor_podcast_progress
        WHERE donor_id = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(donorId, PODCAST_PROGRESS_LIMIT).all(),
      db.prepare('SELECT playback_rate FROM donor_podcast_preferences WHERE donor_id = ?').bind(donorId).first(),
    ]);
    return json({
      items: (progressResult.results || []).map(progressRow),
      playbackRate: playbackRate(preference?.playback_rate) || 1,
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const input = await request.json().catch(() => ({}));
  const rate = playbackRate(input.playbackRate);
  if (input.preferenceOnly) {
    if (!rate) return json({ error: 'A supported playbackRate is required' }, { status: 400 });
    await db.prepare(`
      INSERT INTO donor_podcast_preferences (donor_id, playback_rate, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(donor_id) DO UPDATE SET playback_rate = excluded.playback_rate, updated_at = datetime('now')
    `).bind(donorId, rate).run();
    return json({ ok: true, playbackRate: rate });
  }
  const episodeKey = boundedText(input.episodeKey, 2048);
  const feedUrl = podcastUrl(input.feedUrl);
  const showTitle = boundedText(input.showTitle, 300);
  const episodeTitle = boundedText(input.episodeTitle, 500);
  const positionSeconds = Math.max(0, Math.min(2678400, Math.round(Number(input.positionSeconds) || 0)));
  const rawDuration = Number(input.durationSeconds);
  const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.min(2678400, Math.round(rawDuration))
    : null;
  const completed = Boolean(input.completed)
    || Boolean(durationSeconds && positionSeconds >= Math.max(0, durationSeconds - PODCAST_COMPLETE_WINDOW_SECONDS));

  if (!episodeKey || !feedUrl) return json({ error: 'episodeKey and a valid feedUrl are required' }, { status: 400 });

  if (rate) {
    await db.prepare(`
      INSERT INTO donor_podcast_preferences (donor_id, playback_rate, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(donor_id) DO UPDATE SET playback_rate = excluded.playback_rate, updated_at = datetime('now')
    `).bind(donorId, rate).run();
  }

  if (completed) {
    await db.prepare('DELETE FROM donor_podcast_progress WHERE donor_id = ? AND episode_key = ?').bind(donorId, episodeKey).run();
    return json({ ok: true, completed: true });
  }

  await db.prepare(`
    INSERT INTO donor_podcast_progress (
      donor_id, episode_key, feed_url, show_title, episode_title,
      position_seconds, duration_seconds, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(donor_id, episode_key) DO UPDATE SET
      feed_url = excluded.feed_url,
      show_title = excluded.show_title,
      episode_title = excluded.episode_title,
      position_seconds = excluded.position_seconds,
      duration_seconds = excluded.duration_seconds,
      updated_at = datetime('now')
  `).bind(donorId, episodeKey, feedUrl, showTitle, episodeTitle, positionSeconds, durationSeconds).run();
  return json({ ok: true, completed: false });
}

// ─── /api/listen/search ───────────────────────────────────────────────────────
/**
 * Sign in at podcastindex.org to get an API key + secret.
 * Add to wrangler.toml [vars]:
 *   PODCAST_INDEX_KEY = "your-key"
 *   PODCAST_INDEX_SECRET = "your-secret"
 */
export async function handleListenSearch(request, env) {
  const url = new URL(request.url);
  const q   = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return new Response(JSON.stringify({ feeds: [] }), {
      headers: corsJson(),
    });
  }

  // Podcast Index requires HMAC-SHA1: SHA1(apiKey + apiSecret + unixTime)
  const apiKey    = env.PODCAST_INDEX_KEY    || '';
  const apiSecret = env.PODCAST_INDEX_SECRET || '';
  if (!apiKey || !apiSecret) {
    return new Response(JSON.stringify({ feeds: [], error: 'Podcast search is not configured.' }), {
      status: 503,
      headers: corsJson(),
    });
  }
  const ts        = Math.floor(Date.now() / 1000).toString();

  // Web Crypto HMAC-SHA1
  const encoder = new TextEncoder();
  const sigData = encoder.encode(apiKey + apiSecret + ts);
  const hashBuf = await crypto.subtle.digest('SHA-1', sigData);
  const authHash = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const apiUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(q)}&max=20&clean`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent':      'AGAPAYListen/1.0',
        'X-Auth-Key':      apiKey,
        'X-Auth-Date':     ts,
        'Authorization':   authHash,
      },
    });

    if (!resp.ok) {
      console.error('Podcast Index search failed:', resp.status);
      return new Response(JSON.stringify({ feeds: [], error: 'Podcast search is temporarily unavailable.' }), { status: 502, headers: corsJson() });
    }

    const data  = await resp.json();
    const feeds = (data.feeds || []).map(f => ({
      id:       f.id,
      title:    f.title,
      author:   f.author,
      url:      f.url,          // RSS feed URL
      link:     f.link,         // Website
      artwork:  f.artwork || f.image,
      category: f.categories ? Object.values(f.categories)[0] : '',
      episodeCount: f.episodeCount,
    }));

    return new Response(JSON.stringify({ feeds }), { headers: corsJson() });
  } catch (err) {
    console.error('Podcast Index error:', err);
    return new Response(JSON.stringify({ feeds: [], error: 'search unavailable' }), {
      status: 502,
      headers: corsJson(),
    });
  }
}

// ─── /api/listen/rss ─────────────────────────────────────────────────────────
/**
 * RSS proxy — fetches a remote feed and returns it with CORS headers.
 * This avoids CORS errors when fetching podcasts from the browser.
 * Only fetches from http/https URLs; rejects others.
 */
export async function handleListenRss(request, env) {
  const url     = new URL(request.url);
  const feedUrl = (url.searchParams.get('url') || '').trim();

  if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
    return new Response('Invalid feed URL', { status: 400 });
  }

  // Basic SSRF protection: block internal/private IP ranges
  try {
    const feedHost = new URL(feedUrl).hostname;
    if (
      feedHost === 'localhost' ||
      feedHost.startsWith('127.') ||
      feedHost.startsWith('10.') ||
      feedHost.startsWith('192.168.') ||
      feedHost.endsWith('.internal') ||
      feedHost === '0.0.0.0'
    ) {
      return new Response('Forbidden', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    const feedResp = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'AGAPAYListen/1.0 (+https://agapay.app)',
        'Accept':     'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      cf: { cacheTtl: 300, cacheEverything: true },  // Cache at Cloudflare edge for 5 min
    });

    if (!feedResp.ok) {
      return new Response('Feed fetch failed', { status: 502 });
    }

    const xml = await feedResp.text();

    return new Response(xml, {
      headers: {
        'Content-Type':                'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               'public, max-age=300',
      },
    });
  } catch (err) {
    console.error('RSS proxy error:', err);
    return new Response('Feed unavailable', { status: 502 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function corsJson() {
  return {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}
