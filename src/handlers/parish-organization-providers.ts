import {
  findRegistrationByParishId as lookup,
  loadIndexedRegistration as indexed,
} from './parish-registration-storage.js';
import type { StoredRegistrationLookup } from '../lib/parish-registration-lookup.js';
export const findRegistrationByParishId: (env: Partial<Env>, id: string) => Promise<StoredRegistrationLookup | null> =
  lookup;
export const loadIndexedRegistration: (env: Partial<Env>, key: string) => Promise<StoredRegistrationLookup | null> =
  indexed;
export { verifyParishDashboardBearer } from './parish.js';
