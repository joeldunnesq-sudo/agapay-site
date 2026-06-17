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
    return {
      ...liturgicalDay,
      feastTitle: day.summary_title || titles[0] || liturgicalDay.feastTitle,
      feastRank: day.feast_level_description || liturgicalDay.feastRank,
      fastingRule: fastingLabel(day),
      saints: saints.length ? saints : liturgicalDay.saints,
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
