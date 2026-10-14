export interface LiturgicalDay {
  civilDate: string;
  [field: string]: unknown;
}
export interface LiturgicalRange {
  calendarType?: string;
  startDate?: string;
  endDate?: string;
}
export interface LiturgicalDayQuery {
  civilDate?: string;
  calendarType?: string;
}
export function normalizeCalendarType(value: unknown) {
  const raw = String(value || 'julian').toLowerCase();
  return raw.includes('revised') || raw.includes('gregorian') || raw.includes('new') ? 'revised-julian' : 'julian';
}

export class SeedLiturgicalSource {
  declare seed: { liturgicalWeek: Partial<Record<string, LiturgicalDay[]>> };
  constructor(seed: { liturgicalWeek: Partial<Record<string, LiturgicalDay[]>> }) {
    this.seed = seed;
  }

  listRange({ calendarType = 'julian', startDate = '', endDate = '' }: LiturgicalRange = {}) {
    const resolvedCalendar = normalizeCalendarType(calendarType);
    return (this.seed.liturgicalWeek[resolvedCalendar] || [])
      .filter((entry) => (!startDate || entry.civilDate >= startDate) && (!endDate || entry.civilDate <= endDate))
      .map((entry) => ({ ...entry }));
  }

  getDay({ civilDate, calendarType = 'julian' }: LiturgicalDayQuery = {}) {
    return this.listRange({ calendarType }).find((entry) => entry.civilDate === civilDate) || null;
  }
}

export class ProductionLiturgicalSource {
  declare fetcher: typeof fetch;
  declare baseUrl: string;
  constructor({ fetcher, baseUrl }: { fetcher?: typeof fetch; baseUrl?: string } = {}) {
    this.fetcher = fetcher || globalThis.fetch;
    this.baseUrl = baseUrl || '';
  }

  async listRange({ calendarType = 'julian', startDate = '', endDate = '' }: LiturgicalRange = {}) {
    if (!this.baseUrl) return [];
    const url = new URL(this.baseUrl);
    url.searchParams.set('calendar', normalizeCalendarType(calendarType));
    if (startDate) url.searchParams.set('start', startDate);
    if (endDate) url.searchParams.set('end', endDate);
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`Liturgical source failed with ${response.status}`);
    const payload = (await response.json()) as { days?: LiturgicalDay[] };
    return Array.isArray(payload.days) ? payload.days : [];
  }
}
