import type { EntitlementRegistration } from './entitlements.js';
import { communicationsEnabledFor } from './entitlements.js';

export function parishLifeExperienceFor(registration: EntitlementRegistration | null | undefined) {
  const communicationsEnabled = communicationsEnabledFor(registration);
  return {
    communicationsEnabled,
    label: communicationsEnabled ? 'Koinonia' : 'Today',
  };
}
