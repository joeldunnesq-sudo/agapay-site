import { communicationsEnabledFor, hasModuleAccess } from "../lib/entitlements.js";
import { getBearerToken, hasProductionStore, json, missingProductionStoreResponse, normalizeEmail, unauthorized } from "../lib/core.js";
import { findRegistrationByParishId, requireDonor, verifyParishDashboardBearer } from "./parish.js";

const BLOG_FEED_MAX_BYTES = 1024 * 1024;
const BLOG_POST_LIMIT = 5;
const OCA_NEWS_FEED_URL = "https://www.oca.org/news/feed";
const ORTHOCHRISTIAN_FEED_URL = "https://orthochristian.com/xml/rss.xml";

function database(env) {
  return env.AGAPAY_DB || env.DB || null;
}

function isUnsafeHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes(":")) return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split(".").map(Number);
  return parts.some((part) => part > 255)
    || parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] >= 224;
}

export function validateParishBlogUrl(value, base = undefined) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim(), base);
  } catch {
    throw new Error("Enter a valid HTTPS blog or RSS address.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || isUnsafeHostname(parsed.hostname)) {
    throw new Error("The blog must use a public HTTPS address.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function decodeXml(value) {
  const decodeCodePoint = (code, radix) => {
    const point = parseInt(code, radix);
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : "";
  };
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_, code) => decodeCodePoint(code, 16))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function plainText(value, limit = 1200) {
  return decodeXml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function tagValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return match[1];
  }
  return "";
}

function entryLink(block, feedUrl) {
  const atomLinks = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
  for (const match of atomLinks) {
    const attrs = match[1] || "";
    if (/\brel\s*=\s*["'](?:self|enclosure)["']/i.test(attrs)) continue;
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) {
      try { return validateParishBlogUrl(decodeXml(href), feedUrl); } catch { /* Try the next link. */ }
    }
  }
  const rssLink = plainText(tagValue(block, ["link"]), 2000);
  try { return validateParishBlogUrl(rssLink, feedUrl); } catch { return ""; }
}

export function parseParishBlogFeed(xml, feedUrl) {
  const source = String(xml || "");
  const blocks = [...source.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.map((block) => {
    const title = plainText(tagValue(block, ["title"]), 240);
    const url = entryLink(block, feedUrl);
    const excerpt = plainText(tagValue(block, ["description", "summary", "content:encoded", "content"]), 420);
    const rawDate = plainText(tagValue(block, ["pubDate", "published", "updated", "dc:date"]), 120);
    const parsedDate = new Date(rawDate);
    return {
      title,
      url,
      excerpt,
      publishedAt: Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString(),
    };
  }).filter((post) => post.title && post.url).slice(0, BLOG_POST_LIMIT);
}

function discoveredFeedUrl(html, sourceUrl) {
  for (const match of String(html || "").matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = match[1] || "";
    if (!/\brel\s*=\s*["'][^"']*alternate/i.test(attrs)) continue;
    if (!/\btype\s*=\s*["']application\/(?:rss|atom)\+xml["']/i.test(attrs)) continue;
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return validateParishBlogUrl(decodeXml(href), sourceUrl);
  }
  return "";
}

async function fetchPublicBlogUrl(url, fetcher = fetch, redirects = 0) {
  const safeUrl = validateParishBlogUrl(url);
  const response = await fetcher(safeUrl, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8", "User-Agent": "AGAPAY-Koinonia-RSS/1.0" },
    redirect: "manual",
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(7000) : undefined,
    cf: { cacheEverything: true, cacheTtl: 300 },
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
    if (redirects >= 3) throw new Error("The blog redirected too many times.");
    return fetchPublicBlogUrl(validateParishBlogUrl(response.headers.get("location"), safeUrl), fetcher, redirects + 1);
  }
  if (!response.ok) throw new Error(`The blog returned HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > BLOG_FEED_MAX_BYTES) throw new Error("The RSS feed is too large.");
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > BLOG_FEED_MAX_BYTES) throw new Error("The RSS feed is too large.");
  return { body, contentType: response.headers.get("content-type") || "", url: safeUrl };
}

export async function resolveParishBlogFeed(sourceUrl, fetcher = fetch) {
  const source = validateParishBlogUrl(sourceUrl);
  const first = await fetchPublicBlogUrl(source, fetcher);
  if (/<(?:rss|feed|rdf:RDF)\b/i.test(first.body)) {
    const posts = parseParishBlogFeed(first.body, first.url);
    if (!posts.length) throw new Error("No readable posts were found in this RSS or Atom feed.");
    return { sourceUrl: source, feedUrl: first.url, posts };
  }
  const feedUrl = discoveredFeedUrl(first.body, first.url);
  if (!feedUrl) throw new Error("No RSS or Atom feed was advertised by this blog.");
  const feed = await fetchPublicBlogUrl(feedUrl, fetcher);
  const posts = parseParishBlogFeed(feed.body, feed.url);
  if (!posts.length) throw new Error("No readable posts were found in this RSS or Atom feed.");
  return { sourceUrl: source, feedUrl: feed.url, posts };
}

async function readBlogSettings(db, parishId) {
  const row = await db.prepare("SELECT enabled, source_url, feed_url, updated_at FROM parish_blog_feeds WHERE parish_id = ?").bind(parishId).first();
  return {
    enabled: Boolean(row?.enabled),
    sourceUrl: row?.source_url || "",
    feedUrl: row?.feed_url || "",
    updatedAt: row?.updated_at || "",
  };
}

export async function handleParishBlog(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!hasModuleAccess(found.registration, "communications")) return json({ error: "Communications requires the Parish tier." }, { status: 403 });
  if (request.method === "GET") return json({ blog: await readBlogSettings(db, parishId) });
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const input = await request.json();
    const enabled = Boolean(input.enabled);
    const sourceUrl = String(input.sourceUrl || "").trim();
    const existing = await readBlogSettings(db, parishId);
    let feedUrl = existing.feedUrl;
    if (sourceUrl) ({ feedUrl } = await resolveParishBlogFeed(sourceUrl));
    if (enabled && (!sourceUrl || !feedUrl)) throw new Error("Enter a blog homepage or RSS feed before enabling the priest’s blog.");
    const updatedBy = normalizeEmail(found.registration.treasurerEmail || found.registration.priestEmail) || `parish:${parishId}`;
    await db.prepare(`
      INSERT INTO parish_blog_feeds (parish_id, enabled, source_url, feed_url, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(parish_id) DO UPDATE SET enabled = excluded.enabled, source_url = excluded.source_url,
        feed_url = excluded.feed_url, updated_by = excluded.updated_by, updated_at = datetime('now')
    `).bind(parishId, enabled ? 1 : 0, sourceUrl, sourceUrl ? feedUrl : "", updatedBy).run();
    return json({ ok: true, blog: await readBlogSettings(db, parishId) });
  } catch (error) {
    return json({ error: error.message || "Unable to save the priest’s blog." }, { status: 422 });
  }
}

export async function handleDonorBlog(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) return json({ error: "Choose your home parish to view its blog." }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found || !communicationsEnabledFor(found.registration)) return json({ enabled: false, posts: [] });
  const settings = await readBlogSettings(db, parishId);
  if (!settings.enabled || !settings.feedUrl) return json({ enabled: false, posts: [] });
  try {
    const resolved = await resolveParishBlogFeed(settings.feedUrl);
    return json({ enabled: true, sourceUrl: settings.sourceUrl, posts: resolved.posts });
  } catch (error) {
    console.warn("parish_blog_feed_unavailable", JSON.stringify({ parishId, message: error.message || String(error) }));
    return json({ enabled: true, sourceUrl: settings.sourceUrl, posts: [] });
  }
}

export function isOcaJurisdiction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "oca" || normalized.includes("orthodox church in america");
}

export async function handleDonorOcaNews(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  const found = parishId ? await findRegistrationByParishId(env, parishId) : null;
  if (!found || !communicationsEnabledFor(found.registration) || !isOcaJurisdiction(found.registration.jurisdiction)) {
    return json({ enabled: false, posts: [] });
  }
  try {
    const resolved = await resolveParishBlogFeed(OCA_NEWS_FEED_URL);
    return json({ enabled: true, sourceUrl: "https://www.oca.org/news", posts: resolved.posts });
  } catch (error) {
    console.warn("oca_news_feed_unavailable", JSON.stringify({ parishId, message: error.message || String(error) }));
    return json({ enabled: true, sourceUrl: "https://www.oca.org/news", posts: [] });
  }
}

export async function handleDonorExternalFeed(request, env, feedKey) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env);
  if (!db) return missingProductionStoreResponse();
  if (feedKey !== "orthochristian") return json({ error: "External feed not found" }, { status: 404 });
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  const parishId = String(donor.defaultParishId || "").trim();
  const found = parishId ? await findRegistrationByParishId(env, parishId) : null;
  if (!found || !communicationsEnabledFor(found.registration)) return json({ available: false, subscribed: false, posts: [] });
  const donorId = normalizeEmail(donor.email);
  if (request.method === "PATCH") {
    const input = await request.json().catch(() => ({}));
    const subscribed = Boolean(input.subscribed);
    await db.prepare(`
      INSERT INTO donor_external_feed_subscriptions (donor_id, feed_key, subscribed, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(donor_id, feed_key) DO UPDATE SET subscribed = excluded.subscribed, updated_at = datetime('now')
    `).bind(donorId, feedKey, subscribed ? 1 : 0).run();
    return json({ ok: true, available: true, subscribed });
  }
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const row = await db.prepare("SELECT subscribed FROM donor_external_feed_subscriptions WHERE donor_id = ? AND feed_key = ?").bind(donorId, feedKey).first();
  const subscribed = Boolean(row?.subscribed);
  if (!subscribed) return json({ available: true, subscribed: false, sourceUrl: "https://orthochristian.com", posts: [] });
  try {
    const resolved = await resolveParishBlogFeed(ORTHOCHRISTIAN_FEED_URL);
    return json({ available: true, subscribed: true, sourceUrl: "https://orthochristian.com", posts: resolved.posts });
  } catch (error) {
    console.warn("external_feed_unavailable", JSON.stringify({ feedKey, message: error.message || String(error) }));
    return json({ available: true, subscribed: true, sourceUrl: "https://orthochristian.com", posts: [] });
  }
}
