import { json } from "../lib/core.js";
import { normalizeCalendarType } from "./liturgical-source.js";

const ORTHOCAL_BASE_URL = "https://orthocal.info/api";

function orthocalCalendar(calendarType) {
  return normalizeCalendarType(calendarType) === "revised-julian" ? "gregorian" : "julian";
}

function orthocalUrl(calendarType, civilDate) {
  const [year, month, day] = civilDate.split("-").map(Number);
  return `${ORTHOCAL_BASE_URL}/${orthocalCalendar(calendarType)}/${year}/${month}/${day}/`;
}

function fastingLabel(day = {}) {
  if (day.fast_level_desc && day.fast_exception_desc) return `${day.fast_level_desc} - ${day.fast_exception_desc}`;
  if (day.fast_level_desc) return day.fast_level_desc;
  return "No Fast";
}

function readingRef(day = {}, source) {
  const reading = (day.readings || []).find((entry) => String(entry.source || "").toLowerCase() === source);
  return reading?.display || reading?.short_display || "Not listed";
}

function firstReadingText(day = {}, source) {
  const reading = (day.readings || []).find((entry) => String(entry.source || "").toLowerCase() === source);
  return (reading?.passage || []).slice(0, 3).map((verse) => `${verse.chapter}:${verse.verse} ${verse.content}`).join(" ");
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reposeCenturyLabel(value = "") {
  const matches = [...String(value || "").matchAll(/\b([1-2][0-9]{3}|[1-9][0-9]{2})\b/g)];
  if (!matches.length) return "";
  const year = Number(matches[matches.length - 1][1]);
  if (!Number.isFinite(year) || year <= 0) return "";
  const century = Math.ceil(year / 100);
  const suffix = century % 100 >= 11 && century % 100 <= 13 ? "th"
    : century % 10 === 1 ? "st"
    : century % 10 === 2 ? "nd"
    : century % 10 === 3 ? "rd"
    : "th";
  return `Reposed: ${century}${suffix} century`;
}

function saintNameKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\b[1-2]?[0-9]{2,3}\b[^)]*\)/g, "")
    .replace(/\b(st|saint|ven|venerable|holy|our holy)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function orthocalSaintStories(day = {}) {
  const saintNames = Array.isArray(day.saints) ? day.saints : [];
  // Orthocal's 2026-06-19 response confirms `saints` is a string[] of names,
  // while full lives are in `stories[]` as `{ title, story }` HTML from the source feed.
  const stories = Array.isArray(day.stories) ? day.stories : [];
  const storyByKey = new Map();
  for (const entry of stories) {
    const key = saintNameKey(entry?.title || "");
    if (key && !storyByKey.has(key)) storyByKey.set(key, entry);
  }

  const usedStoryKeys = new Set();
  const fromSaints = saintNames
    .map((name) => {
      const key = saintNameKey(name);
      const story = storyByKey.get(key);
      if (story && key) usedStoryKeys.add(key);
      const storyTitle = String(story?.title || "").trim();
      const displayName = String(name || storyTitle || "").trim();
      const title = storyTitle || displayName;
      return {
        name: displayName,
        title,
        storyText: stripHtml(story?.story || ""),
        storyHtml: String(story?.story || ""),
        reposeCentury: reposeCenturyLabel(title || displayName),
        feastRank: day.feast_level_description || "",
        sourceLabel: "Orthocal.info"
      };
    })
    .filter((entry) => entry.name || entry.storyText);

  const extraStories = stories
    .filter((entry) => {
      const key = saintNameKey(entry?.title || "");
      return key && !usedStoryKeys.has(key);
    })
    .map((entry) => {
      const title = String(entry?.title || "").trim();
      return {
        name: title,
        title,
        storyText: stripHtml(entry?.story || ""),
        storyHtml: String(entry?.story || ""),
        reposeCentury: reposeCenturyLabel(title),
        feastRank: day.feast_level_description || "",
        sourceLabel: "Orthocal.info"
      };
    })
    .filter((entry) => entry.name || entry.storyText);

  return [...fromSaints, ...extraStories];
}

export async function fetchOrthocalDay({ calendarType = "julian", civilDate, fetcher = fetch } = {}) {
  if (!civilDate) return null;
  const response = await fetcher(orthocalUrl(calendarType, civilDate), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Orthocal returned ${response.status}`);
  return response.json();
}

export async function enrichLiturgicalDayWithOrthocal(liturgicalDay, { calendarType = "julian", civilDate, fetcher = fetch } = {}) {
  try {
    const day = await fetchOrthocalDay({ calendarType, civilDate, fetcher });
    if (!day) return liturgicalDay;
    const titles = Array.isArray(day.titles) ? day.titles : [];
    const saints = Array.isArray(day.saints) ? day.saints : [];
    const saintStories = orthocalSaintStories(day);
    return {
      ...liturgicalDay,
      feastTitle: day.summary_title || titles[0] || liturgicalDay.feastTitle,
      feastRank: day.feast_level_description || liturgicalDay.feastRank,
      fastingRule: fastingLabel(day),
      saints: saints.length ? saints : liturgicalDay.saints,
      saintStories: saintStories.length ? saintStories : liturgicalDay.saintStories,
      tone: day.tone ? `Tone ${day.tone}` : liturgicalDay.tone,
      epistleRef: readingRef(day, "epistle"),
      gospelRef: readingRef(day, "gospel"),
      epistlePreview: firstReadingText(day, "epistle"),
      gospelPreview: firstReadingText(day, "gospel"),
      sourceLabel: "Orthocal.info",
      sourceUrl: orthocalUrl(calendarType, civilDate),
      sourceConnected: true
    };
  } catch (error) {
    return {
      ...liturgicalDay,
      sourceLabel: "Orthocal.info unavailable",
      sourceError: error.message,
      sourceConnected: false
    };
  }
}

export function handleLearnReadingsStatus() {
  return json({
    ok: true,
    provider: {
      id: "orthocal",
      label: "Orthocal.info",
      kind: "orthodox-calendar-readings",
      capabilities: ["daily-feasts", "saints", "fasting", "tone", "epistle", "gospel", "scripture-preview"],
      hymnText: "manual-entry",
      apiBaseUrl: ORTHOCAL_BASE_URL,
      docsUrl: "https://orthocal.info/api/docs/",
      openApiUrl: "https://orthocal.info/api/openapi.json"
    }
  });
}
