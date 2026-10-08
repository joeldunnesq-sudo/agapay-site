// Existing Accounting readiness remains a separate runtime gate.
import type { DashboardRegistration } from '../handlers/parish-dashboard-handler.js';
export function accountingCatalogRequiredForParish(
  env: Partial<Env>,
  parishId: string,
  registration: DashboardRegistration
): Promise<boolean>;
