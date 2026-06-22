export function absoluteWebsiteUrl(value) {
  const website = String(value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

export function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function monthLabel(index) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parishSlug(parishName, city = "") {
  const name = String(parishName || "")
    .replace(/\b(?:greek|russian|antiochian|serbian|romanian|bulgarian|ukrainian|american)?\s*orthodox\b.*$/i, "")
    .replace(/\b(?:church|parish|mission|cathedral|monastery|skete)\b.*$/i, "")
    .trim();
  const nameSlug = slugify(name || parishName || "parish");
  const citySlug = slugify(city);
  if (!citySlug || nameSlug === citySlug || nameSlug.endsWith(`-${citySlug}`)) return nameSlug;
  return `${nameSlug}-${citySlug}`.slice(0, 80).replace(/-+$/g, "");
}
