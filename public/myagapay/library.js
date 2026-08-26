const libraryCategoryLabels = Object.freeze({
  prayer_worship: "Prayer & Worship",
  faith_formation: "Faith Formation",
  newcomers: "Newcomers",
  ministries: "Ministries",
  forms_policies: "Forms & Policies",
  pastoral_letters: "Pastoral Letters",
  parish_life: "Parish Life",
});
const libraryState = { resources: [], query: "", category: "" };

function libraryEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function libraryStatus(message, tone = "") {
  const element = document.getElementById("libraryStatus");
  if (!element) return;
  element.hidden = !message;
  element.textContent = message || "";
  if (tone) element.dataset.state = tone; else delete element.dataset.state;
}

function libraryIcon(type) {
  return type === "pdf"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 15h6M9 18h4"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7.1l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7"/><path d="M14 10a4 4 0 0 0-5.7-.1l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7"/></svg>';
}

function visibleLibraryResources() {
  const query = libraryState.query.toLowerCase();
  return libraryState.resources.filter((resource) => {
    if (libraryState.category && resource.category !== libraryState.category) return false;
    if (!query) return true;
    return `${resource.title} ${resource.description} ${libraryCategoryLabels[resource.category] || ""}`.toLowerCase().includes(query);
  });
}

function renderLibrary() {
  const grid = document.getElementById("libraryGrid");
  if (!grid) return;
  const resources = visibleLibraryResources();
  if (!resources.length) {
    grid.innerHTML = `<div class="library-empty"><strong>${libraryState.resources.length ? "No resources match your search" : "Your parish library is ready"}</strong><p>${libraryState.resources.length ? "Try another word or category." : "Parish staff have not published any resources yet."}</p></div>`;
    return;
  }
  grid.innerHTML = resources.map((resource) => {
    const isPdf = resource.resourceType === "pdf";
    const href = isPdf ? "#" : resource.url;
    const pdfAction = isPdf ? ` data-library-pdf="${libraryEscape(resource.id)}"` : "";
    return `<article class="library-card${resource.pinned ? " is-pinned" : ""}">
      <div class="library-card-head"><span class="library-card-type">${libraryIcon(resource.resourceType)}${isPdf ? "PDF document" : "Article link"}</span>${resource.pinned ? '<span class="library-pin">Featured</span>' : ""}</div>
      <h2>${libraryEscape(resource.title)}</h2><p>${libraryEscape(resource.description || (isPdf ? "A document from your parish." : "A recommended resource from your parish."))}</p>
      <footer class="library-card-footer"><span class="library-category">${libraryEscape(libraryCategoryLabels[resource.category] || "Parish Life")}</span><a class="library-open" href="${libraryEscape(href)}"${pdfAction} target="_blank" rel="noopener noreferrer">${isPdf ? "Open PDF" : "Read article"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></a></footer>
    </article>`;
  }).join("");
}

async function openLibraryPdf(resourceId) {
  const preview = window.open("", "_blank");
  if (preview) preview.opener = null;
  try {
    const headers = window.MyAgapayShell?.authHeaders() || {};
    const response = await fetch(`/api/donor/library/${encodeURIComponent(resourceId)}/file`, { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) { preview?.close(); return; }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to open this PDF.");
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    if (preview) preview.location.replace(objectUrl);
    else window.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    preview?.close();
    libraryStatus(error.message || "Unable to open this PDF.", "error");
  }
}

async function loadLibrary() {
  try {
    const headers = window.MyAgapayShell?.authHeaders() || {};
    const response = await fetch("/api/donor/library", { headers, cache: "no-store" });
    if (window.MyAgapayShell?.handleUnauthorized(response)) return;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load the Parish Library.");
    if (!payload.available) {
      window.location.replace("/myagapay/dashboard");
      return;
    }
    libraryState.resources = payload.resources || [];
    const parishName = document.getElementById("libraryParishName");
    if (parishName && payload.parish?.name) parishName.textContent = payload.parish.name;
    libraryStatus("");
    renderLibrary();
  } catch (error) {
    libraryStatus(error.message || "Unable to load the Parish Library.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("librarySearch")?.addEventListener("input", (event) => { libraryState.query = event.target.value.trim(); renderLibrary(); });
  document.getElementById("libraryCategory")?.addEventListener("change", (event) => { libraryState.category = event.target.value; renderLibrary(); });
  document.getElementById("libraryGrid")?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-library-pdf]");
    if (!link) return;
    event.preventDefault();
    void openLibraryPdf(link.dataset.libraryPdf);
  });
  void loadLibrary();
});
