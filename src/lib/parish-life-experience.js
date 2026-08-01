import { communicationsEnabledFor } from "./entitlements.js";

export function parishLifeExperienceFor(registration) {
  const communicationsEnabled = communicationsEnabledFor(registration);
  return {
    communicationsEnabled,
    label: communicationsEnabled ? "Koinonia" : "Today",
  };
}
