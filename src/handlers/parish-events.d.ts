import type { CatalogRegistration } from './parish-giving-catalog.js';
/** Published commerce calendar read boundary; the commerce handler implementation remains JavaScript. */
export function loadPublishedCommerceCalendarEvents(
  env: Partial<Env>,
  parishId: string,
  registration?: CatalogRegistration
): Promise<{ id: string; title: string; startsAt: string; endsAt?: string; [field: string]: unknown }[]>;

/** Consumed ministry commerce boundary; implementation remains JavaScript. */
export function listMinistryCommerceItems(
  env: Partial<Env>,
  parishId: string,
  ministryId: string
): Promise<Record<string, unknown>>;
export function createMinistryCommerceItem(
  request: Request,
  env: Partial<Env>,
  parishId: string,
  ministryId: string,
  personId: string
): Promise<Record<string, unknown>>;
export function patchMinistryCommerceItem(
  request: Request,
  env: Partial<Env>,
  parishId: string,
  ministryId: string,
  productId: string
): Promise<Record<string, unknown>>;

export const handleDonorEvents: import('../routes/donor.js').DonorActions<Env, ExecutionContext>['handleDonorEvents'];

export const handleParishEvents: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishEvents'];
