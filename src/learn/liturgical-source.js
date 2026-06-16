export function normalizeCalendarType(value) {
  const raw = String(value || "julian").toLowerCase();
  return raw.includes("revised") || raw.includes("gregorian") || raw.includes("new")
    ? "revised-julian"
    : "julian";
}

export class SeedLiturgicalSource {
  constructor(seed) {
    this.seed = seed;
  }

  listRange({ calendarType = "julian", startDate = "", endDate = "" } = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    return (this.seed.liturgicalWeek[resolvedCalendar] || [])
      .filter((entry) => (!startDate || entry.civilDate >= startDate) && (!endDate || entry.civilDate <= endDate))
      .map((entry) => ({ ...entry }));
  }

  getDay({ civilDate, calendarType = "julian" } = {}) {
    return this.listRange({ calendarType }).find((entry) => entry.civilDate === civilDate) || null;
  }
}

export class ProductionLiturgicalSource {
  constructor({ fetcher, baseUrl } = {}) {
    this.fetcher = fetcher || globalThis.fetch;
    this.baseUrl = baseUrl || "";
  }

  async listRange({ calendarType = "julian", startDate = "", endDate = "" } = {}) {
    if (!this.baseUrl) return [];
    const url = new URL(this.baseUrl);
    url.searchParams.set("calendar", normalizeCalendarType(calendarType));
    if (startDate) url.searchParams.set("start", startDate);
    if (endDate) url.searchParams.set("end", endDate);
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`Liturgical source failed with ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.days) ? payload.days : [];
  }
}
