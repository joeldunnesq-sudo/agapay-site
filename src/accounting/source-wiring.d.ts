// Narrow catalog boundary only. Operational posting implementations remain JavaScript.
import type { DashboardRegistration } from '../handlers/parish-dashboard-handler.js';
export interface AccountingCatalogSync {
  available: boolean;
  synchronized: number;
  funds?: DashboardRegistration['funds'];
  campaigns?: DashboardRegistration['campaigns'];
  feastCampaigns?: DashboardRegistration['feastCampaigns'];
}
export function loadGivingCatalogFromAccounting(
  env: Partial<Env>,
  parishId: string,
  registration?: DashboardRegistration
): Promise<{
  available: boolean;
  funds: NonNullable<DashboardRegistration['funds']>;
  campaigns: NonNullable<DashboardRegistration['campaigns']>;
  feastCampaigns: NonNullable<DashboardRegistration['feastCampaigns']>;
}>;
export function synchronizeGivingCatalogWithAccounting(
  env: Partial<Env>,
  parishId: string,
  registration?: DashboardRegistration
): Promise<AccountingCatalogSync>;
