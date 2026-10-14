import type { CatalogParish, CatalogRegistration } from './parish-giving-catalog.js';
import type { EntitlementRegistration } from '../lib/entitlements.js';

export type DonorParishContextEnv = Partial<Env> & { DB?: D1Database | null };
export interface DonorParishContextInput {
  defaultParishId?: string | null;
}
// Capabilities are optional while the legacy parish projection is enriched.
// This read contract does not authorize access or validate stored JSON.
export interface DonorParishContext extends CatalogParish {
  directoryEnabled?: boolean;
  libraryEnabled?: boolean;
  communicationsEnabled?: boolean;
  signupsEnabled?: boolean;
  exchangeEnabled?: boolean;
  prayerRequestsEnabled?: boolean;
  parishLifeLabel?: string;
  parishLifeAvailable?: boolean;
  pledgeTrackerEnabled?: boolean;
}
type ContextRegistration = CatalogRegistration & EntitlementRegistration;

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

// Shared authenticated navigation context. No giving history reads, Stripe
// reconciliation, or campaign-total scans belong on this path.
export async function loadDonorParishContext(
  env: DonorParishContextEnv,
  donor: DonorParishContextInput
): Promise<DonorParishContext | null> {
  let parish: DonorParishContext | null = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId<ContextRegistration>(env, donor.defaultParishId);
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
