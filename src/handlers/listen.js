/**
 * AGAPAY Listen — Worker API handlers
 * Add to src/worker.js (see DEPLOY.md for exact insertion points).
 *
 * Provides two endpoints:
 *   GET /api/listen/search?q=...   → Podcast Index search (HMAC auth)
 *   GET /api/listen/rss?url=...    → RSS feed proxy (CORS bypass)
 */

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
      return new Response(JSON.stringify({ feeds: [] }), { headers: corsJson() });
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
