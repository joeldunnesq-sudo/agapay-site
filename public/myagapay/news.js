let newsState = { sources: [], articles: [], filter: "all" };

const NEWS_SOURCE_COPY = {
  parish_blog: { label: "Priest’s Blog", mark: "PB", description: "Pastoral writing connected by your parish." },
  oca: { label: "OCA News", mark: "OCA", description: "Official news from the Orthodox Church in America." },
  orthochristian: { label: "OrthoChristian", mark: "OC", description: "Orthodox news, reflections, and interviews." },
  spzh: { label: "SPZH", mark: "SP", description: "Orthodox news and articles from the Union of Orthodox Journalists." },
  orthodoxtimes: { label: "Orthodox Times", mark: "OT", description: "English-language Orthodox news and church reporting." },
  orthodoxethos: { label: "Orthodox Ethos", mark: "OE", description: "Articles, talks, and resources on Orthodox faith and life." },
};

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

function renderNewsSourcePreferences() {
  const target = document.getElementById("newsSourcePreferences");
  if (!target) return;
  const available = newsState.sources.filter((source) => source.available === true);
  target.innerHTML = available.length ? available.map((source) => {
    const copy = NEWS_SOURCE_COPY[source.sourceKey] || { label: source.sourceLabel || source.sourceKey, mark: "↗", description: "Optional Orthodox news source." };
    return `<article class="news-source-card${source.subscribed ? " is-following" : ""}">
      <span class="news-source-mark" aria-hidden="true">${newsEscape(copy.mark)}</span>
      <div><h3>${newsEscape(copy.label)}</h3><p>${newsEscape(copy.description)}</p></div>
      ${source.custom
        ? `<button type="button" class="parish-life-feed-toggle is-subscribed" data-custom-feed-id="${newsEscape(source.id)}" onclick="removeCustomNewsSource(this)">Remove</button>`
        : `<button type="button" class="parish-life-feed-toggle${source.subscribed ? " is-subscribed" : ""}" data-source-key="${newsEscape(source.sourceKey)}" data-subscribed="${source.subscribed ? "true" : "false"}" onclick="toggleNewsSource(this)">${source.subscribed ? "Following" : "Follow"}</button>`}
    </article>`;
  }).join("") : '<div class="parish-life-empty-state"><strong>No news sources available</strong><p>Your parish’s available sources will appear here.</p></div>';
}

function renderNewsFilters() {
  const target = document.getElementById("newsSourceFilters");
  if (!target) return;
  const sources = [
    { key: "all", label: "All" },
    ...newsState.sources.filter((source) => source.subscribed).map((source) => ({ key: source.sourceKey, label: NEWS_SOURCE_COPY[source.sourceKey]?.label || source.sourceLabel })),
  ];
  if (!sources.some(({ key }) => key === newsState.filter)) newsState.filter = "all";
  target.innerHTML = sources.map(({ key, label }) => {
    const count = key === "all" ? newsState.articles.length : newsState.articles.filter((article) => article.sourceKey === key).length;
    const active = key === newsState.filter;
    return `<button type="button" class="${active ? "is-active" : ""}" aria-pressed="${active}" onclick="setNewsFilter('${newsEscape(key)}')"><span>${newsEscape(label)}</span><strong>${count}</strong></button>`;
  }).join("");
}

function renderNewsArticles() {
  renderNewsSourcePreferences();
  renderNewsFilters();
  const target = document.getElementById("newsArticleList");
  const status = document.getElementById("newsStatus");
  if (!target || !status) return;
  const articles = filteredNews();
  const followed = newsState.sources.filter((source) => source.subscribed);
  status.hidden = true;
  target.innerHTML = articles.length ? articles.map((article) => `
    <a class="news-article-card" href="${newsEscape(article.url)}" target="_blank" rel="noopener noreferrer">
      <span class="news-article-source">${newsEscape(article.sourceLabel)}</span>
      <strong>${newsEscape(article.title)}</strong>
      ${article.excerpt ? `<p>${newsEscape(article.excerpt)}</p>` : ""}
      <small>${newsEscape(newsDate(article.publishedAt))}<em>Read article ↗</em></small>
    </a>`).join("") : followed.length
    ? '<div class="parish-life-empty-state"><strong>No recent articles</strong><p>Your choices are saved. New articles will appear when these sources publish.</p></div>'
    : '<div class="parish-life-empty-state"><strong>Your news feed is empty</strong><p>Follow one or more sources above to begin. AGAPAY will not add news without your choice.</p></div>';
}

function setNewsFilter(filter) {
  newsState.filter = filter;
  renderNewsArticles();
}

async function loadNews() {
  const status = document.getElementById("newsStatus");
  try {
    const [dashboard, custom, ...sources] = await Promise.all([
      newsFetch("/api/donor/dashboard"),
      newsFetch("/api/donor/custom-news-feeds"),
      ...Object.keys(NEWS_SOURCE_COPY).map((key) => newsFetch(`/api/donor/external-feeds/${key}`)),
    ]);
    const parish = dashboard?.parish || null;
    const parishName = document.getElementById("newsParishName");
    if (parishName) parishName.textContent = parish?.name || "Your Orthodox news feeds";
    newsState.sources = [...sources.filter(Boolean), ...(custom?.feeds || [])];
    newsState.articles = newsState.sources.flatMap((source) => source.subscribed
      ? (source.posts || []).map((post) => ({ ...post, sourceKey: source.sourceKey, sourceLabel: source.sourceLabel || NEWS_SOURCE_COPY[source.sourceKey]?.label || "News" }))
      : []).sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0));
    renderNewsArticles();
  } catch (error) {
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to load news feeds."; }
  }
}

async function addCustomNewsSource(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById("customNewsFeedUrl");
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/donor/custom-news-feeds", {
      method: "POST",
      headers: newsHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: input?.value.trim() || "" }),
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to add this RSS feed.");
    form.reset();
    await loadNews();
  } catch (error) {
    const status = document.getElementById("newsStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to add this RSS feed."; }
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

async function removeCustomNewsSource(button) {
  const feedId = button?.dataset.customFeedId || "";
  if (!feedId) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/donor/custom-news-feeds/${encodeURIComponent(feedId)}`, { method: "DELETE", headers: newsHeaders() });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to remove this RSS feed.");
    await loadNews();
  } catch (error) {
    const status = document.getElementById("newsStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to remove this RSS feed."; }
    if (button?.isConnected) button.disabled = false;
  }
}

async function toggleNewsSource(button) {
  const sourceKey = button?.dataset.sourceKey || "";
  const subscribed = button?.dataset.subscribed === "true";
  if (!sourceKey) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/donor/external-feeds/${encodeURIComponent(sourceKey)}`, {
      method: "PATCH",
      headers: newsHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ subscribed: !subscribed }),
    });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update this news source.");
    await loadNews();
  } catch (error) {
    const status = document.getElementById("newsStatus");
    if (status) { status.hidden = false; status.textContent = error.message || "Unable to update this news source."; }
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

window.setNewsFilter = setNewsFilter;
window.toggleNewsSource = toggleNewsSource;
window.addCustomNewsSource = addCustomNewsSource;
window.removeCustomNewsSource = removeCustomNewsSource;
document.addEventListener("DOMContentLoaded", loadNews);
