// Generated from src/handlers/parish-organization-providers.ts by npm run build:server. Do not edit.
import {
  findRegistrationByParishId as lookup,
  loadIndexedRegistration as indexed,
} from './parish-registration-storage.js';
const findRegistrationByParishId = lookup;
const loadIndexedRegistration = indexed;
import { verifyParishDashboardBearer } from './parish.js';
export { findRegistrationByParishId, loadIndexedRegistration, verifyParishDashboardBearer };
