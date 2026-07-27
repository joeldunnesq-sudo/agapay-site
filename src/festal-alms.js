import { addDaysToIso, liturgicalFeastsForYear } from "./liturgical-calendar.js";

const FEAST_FAST_STARTS = new Map([
  ["pascha", "clean-monday"],
  ["apostles-peter-paul", "apostles-fast-start"],
  ["dormition", "dormition-fast-begins"],
  ["nativity-christ", "nativity-fast-begins"]
]);

const INACTIVE_STATUSES = new Set(["hidden", "paused", "cancelled", "ended", "inactive"]);

function isoDate(value = new Date()) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function campaignFeastId(campaign = {}) {
  return String(campaign.feastId || campaign.id || "").trim();
}

function campaignIsEnabled(campaign = {}) {
  const status = String(campaign.status || (campaign.enabled === false ? "hidden" : "active")).toLowerCase();
  return campaign.enabled !== false && !INACTIVE_STATUSES.has(status);
}

function feastOccurrencesNear(dateIso, calendar) {
  const year = Number(dateIso.slice(0, 4));
  return [year - 1, year, year + 1]
    .flatMap((feastYear) => liturgicalFeastsForYear(feastYear, calendar))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function annualCustomFeastOccurrences(dateIso, campaign = {}) {
  const raw = String(campaign.feastDate || campaign.patronalFeastDate || "").trim();
  const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(5) : raw;
  if (!/^\d{2}-\d{2}$/.test(monthDay)) return [];
  const year = Number(dateIso.slice(0, 4));
  return [year - 1, year, year + 1].map((occurrenceYear) => ({
    id: campaignFeastId(campaign),
    name: campaign.name || campaign.campaignName || "Patronal Feast",
    date: `${occurrenceYear}-${monthDay}`
  }));
}

export function festalAlmsVisibilityWindow(campaign, calendar = "julian", referenceDate = new Date()) {
  const dateIso = isoDate(referenceDate);
  const feastId = campaignFeastId(campaign);
  if (!feastId) return null;

  const calendarOccurrences = feastOccurrencesNear(dateIso, calendar);
  const customOccurrences = annualCustomFeastOccurrences(dateIso, campaign);
  const occurrences = customOccurrences.length ? customOccurrences : calendarOccurrences;
  const feast = occurrences
    .filter((item) => item.id === feastId)
    .sort((a, b) => Math.abs(Date.parse(`${a.date}T12:00:00Z`) - Date.parse(`${dateIso}T12:00:00Z`))
      - Math.abs(Date.parse(`${b.date}T12:00:00Z`) - Date.parse(`${dateIso}T12:00:00Z`)))[0];
  if (!feast) return null;

  const fastStartId = FEAST_FAST_STARTS.get(feastId);
  const fastStart = fastStartId
    ? occurrences.filter((item) => item.id === fastStartId && item.date <= feast.date).at(-1)
    : null;

  return {
    feastDate: feast.date,
    startsAt: fastStart?.date || addDaysToIso(feast.date, -7),
    endsAt: addDaysToIso(feast.date, 7),
    fastStartId: fastStart?.id || null
  };
}

export function activeFestalAlmsCampaigns(campaigns, calendar = "julian", referenceDate = new Date()) {
  const dateIso = isoDate(referenceDate);
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter(campaignIsEnabled)
    .map((campaign) => {
      const visibility = festalAlmsVisibilityWindow(campaign, calendar, dateIso);
      return visibility ? { ...campaign, visibility } : null;
    })
    .filter((campaign) => campaign && dateIso >= campaign.visibility.startsAt && dateIso <= campaign.visibility.endsAt)
    .sort((a, b) => {
      const aDistance = Math.abs(Date.parse(`${a.visibility.feastDate}T12:00:00Z`) - Date.parse(`${dateIso}T12:00:00Z`));
      const bDistance = Math.abs(Date.parse(`${b.visibility.feastDate}T12:00:00Z`) - Date.parse(`${dateIso}T12:00:00Z`));
      return aDistance - bDistance;
    })
    .slice(0, 1);
}
