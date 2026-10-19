// @ts-check
// A checked bridge from legacy storage/session helpers into strict providers.
import { parishClosureState } from '../portability/closure.js';
import {
  d1First,
  parseJsonRow,
  listKvKeys,
  isSystemKvKey,
  parishIdIndexKey,
  resolveParishDashboardSession,
} from '../lib/core.js';
import { parishSlug } from '../lib/format.js';
import { createRegistrationLookup } from '../lib/parish-registration-lookup.js';
import { createParishDashboardBearerVerifier } from '../lib/parish-dashboard-bearer.js';

/** @type {import('../lib/parish-registration-lookup.js').RegistrationLookupDependencies<Env>} */
const dependencies = {
  parishClosureState,
  d1First,
  parseJsonRow,
  listKvKeys,
  isSystemKvKey,
  parishIdIndexKey,
  parishSlug,
};
export const { findRegistrationByParishId, loadIndexedRegistration } = createRegistrationLookup(dependencies);
export const verifyParishDashboardBearer = createParishDashboardBearerVerifier(resolveParishDashboardSession);
