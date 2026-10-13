// Generated from src/handlers/donor-parish-context.ts by npm run build:server. Do not edit.
import {
  directoryEnabledFor,
  exchangeEnabledFor,
  hasModuleAccess,
  prayerRequestsEnabledFor,
  signupsEnabledFor,
  stewardshipToolAccess,
} from '../lib/entitlements.js';
import { parishLifeAvailableFor } from '../lib/parish-life-access.js';
import { parishLifeExperienceFor } from '../lib/parish-life-experience.js';
import { getDirectorySettings } from '../directory/settings.js';
import { getParishLibrarySettings } from '../lib/parish-library.js';
import { findRegistrationByParishId, parishFromRegistration } from './parish.js';
async function loadDonorParishContext(env, donor) {
  let parish = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId(env, donor.defaultParishId);
    if (found) {
      parish = parishFromRegistration(found.registration);
      if (parish) {
        const [directorySettings, librarySettings] = await Promise.all([
          getDirectorySettings(env, parish.id),
          getParishLibrarySettings(env.AGAPAY_DB || env.DB, parish.id),
        ]);
        parish.directoryEnabled = directoryEnabledFor(found.registration, directorySettings);
        parish.libraryEnabled = librarySettings.enabled && hasModuleAccess(found.registration, 'library');
        const parishLifeExperience = parishLifeExperienceFor(found.registration);
        parish.communicationsEnabled = parishLifeExperience.communicationsEnabled;
        parish.signupsEnabled = signupsEnabledFor(found.registration);
        parish.exchangeEnabled = exchangeEnabledFor(found.registration);
        parish.prayerRequestsEnabled = prayerRequestsEnabledFor(found.registration);
        parish.parishLifeLabel = parishLifeExperience.label;
        parish.parishLifeAvailable = parishLifeAvailableFor(env);
        parish.pledgeTrackerEnabled = stewardshipToolAccess(found.registration);
      }
    }
  }
  return parish;
}
export { loadDonorParishContext };
