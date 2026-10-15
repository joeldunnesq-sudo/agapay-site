import type { CatalogRegistration } from './parish-giving-catalog.js';
/** Published commerce calendar read boundary; the commerce handler implementation remains JavaScript. */
export function loadPublishedCommerceCalendarEvents(
  env: Partial<Env>,
  parishId: string,
  registration?: CatalogRegistration
): Promise<{ id: string; title: string; startsAt: string; endsAt?: string; [field: string]: unknown }[]>;
