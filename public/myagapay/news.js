let newsState = { articles: [], filter: "all", externalFeed: null };

function newsEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newsDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function newsHeaders(extra = {}) {
  return window.MyAgapayShell?.authHeaders(extra) || extra;
}

async function newsFetch(path) {
  const response = await fetch(path, { headers: newsHeaders(), cache: "no-store" });
  if (window.MyAgapayShell?.handleUnauthorized(response)) return null;
  const data = await response.json().catch(() => ({}));
  return response.ok ? data : null;
}

function filteredNews() {
  return newsState.filter === "all" ? newsState.articles : newsState.articles.filter((article) => article.sourceKey === newsState.filter);
}

function renderNewsFilters() {
  const target = document.getElementById("newsSourceFilters");
  if (!target) return;
  const sources = [
    { key: "all", label: "All" },
    { key: "parish_blog", label: "Priest’s Blog" },
    { key: "oca", label: "OCA" },
    { key: "orthochristian", label: "OrthoChristian" },
  ].filter(({ key }) => key === "all" || newsState.articles.some((article) => article.sourceKey === key));
  if (!sources.some(({ key }) => key === newsState.filter)) newsState.filter = "all";
  target.innerHTML = sources.map(({ key, label }) => {
    const count = key === "all" ? newsState.articles.length : newsState.articles.filter((article) => article.sourceKey === key).length;
    const active = key === newsState.filter;
    return `<button type="button" class="${active ? "is-active" : ""}" aria-pressed="${active}" onclick="setNewsFilter('${key}')"><span>${newsEscape(label)}</span><strong>${count}</strong></button>`;
  }).join("");
}

function renderNewsArticles() {
  renderNewsFilters();
  const target = document.getElementById("newsArticleList");
  const status = document.getElementById("newsStatus");
  if (!target || !status) return;
  const articles = filteredNews();
  status.hidden = true;
  target.innerHTML = articles.length ? articles.map((article) => `
    <a class="news-article-card" href="${newsEscape(article.url)}" target="_blank" rel="noopener noreferrer">
      <span class="news-article-source">${newsEscape(article.sourceLabel)}</span>
      <strong>${newsEscape(article.title)}</strong>
      ${article.excerpt ? `<p>${newsEscape(article.excerpt)}</p>` : ""}
      <small>${newsEscape(newsDate(article.publishedAt))}<em>Read article ↗</em></small>
    </a>`).join("") : '<div class="parish-life-empty-state"><strong>No articles available</strong><p>Connected sources will appear here when they publish something new.</p></div>';
}

function setNewsFilter(filter) {
  newsState.filter = filter;
  renderNewsArticles();
}

function renderExternalPreference(feed = {}) {
  const card = document.getElementById("orthoChristianPreference");
  const button = document.getElementById("orthoChristianToggle");
  if (!card || !button || feed.available !== true) return;
  card.hidden = false;
  button.classList.toggle("is-subscribed", Boolean(feed.subscribed));
  button.textContent = feed.subscribed ? "Following" : "Follow feed";
  button.dataset.subscribed = feed.subscribed ? "true" : "false";
}

async function loadNews() {
  const status = document.getElementById("newsStatus");
  try {
    const dashboard = await newsFetch("/api/donor/dashboard");
    const parish = dashboard?.parish || null;
    if (document.getElementById("newsParishName")) document.getElementById("newsParishName").textContent = parish?.name || "Your Orthodox news feeds";
    const isOca = /(?:^|\b)oca(?:\b|$)|orthodox church in america/i.test(String(parish?.jurisdiction || ""));
    const [blog, oca, external] = await Promise.all([
      newsFetch("/api/donor/blog"),
      isOca ? newsFetch("/api/donor/oca-news") : Promise.resolve({ enabled: false, posts: [] }),
      newsFetch("/api/donor/external-feeds/orthochristian"),
    ]);
    newsState.externalFeed = external || null;
    newsState.articles = [
      ...(blog?.enabled ? (blog.posts || []).map((post) => ({ ...post, sourceKey: "parish_blog", sourceLabel: "Priest’s Blog" })) : []),
      ...(oca?.enabled ? (oca.posts || []).map((post) => ({ ...post, sourceKey: "oca", sourceLabel: "OCA News" })) : []),
      ...(external?.subscribed ? (external.posts || []).map((post) => ({ ...post, sourceKey: "orthochristian", sourceLabel: "OrthoChristian" })) : []),
    ].sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
    renderExternalPreference(external || {});
    renderNewsArticles();
  } catch (error) {
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to load news feeds."; }
  }
}

async function toggleNewsExternalFeed(button) {
  const subscribed = button?.dataset.subscribed === "true";
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/donor/external-feeds/orthochristian", {
      method: "PATCH",
      headers: newsHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ subscribed: !subscribed }),
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update this feed preference.");
    await loadNews();
  } catch (error) {
    const status = document.getElementById("newsStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to update this feed preference."; }
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

window.setNewsFilter = setNewsFilter;
window.toggleNewsExternalFeed = toggleNewsExternalFeed;
document.addEventListener("DOMContentLoaded", loadNews);
