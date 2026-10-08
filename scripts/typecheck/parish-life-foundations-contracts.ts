import { getParishLibrarySettings, setParishLibraryEnabled } from '../../src/lib/parish-library.js';
import { directoryInvitationNext } from '../../src/lib/directory-invitation-next.js';
import { householdVerificationStatus, isHouseholdVerificationCurrent } from '../../src/lib/household-verification.js';
import { parishLifeExperienceFor } from '../../src/lib/parish-life-experience.js';
declare const db: D1Database;
const settings = getParishLibrarySettings(null, null);
const destination: string = directoryInvitationNext({ untrusted: true });
const status: string = householdVerificationStatus(
  { verification_due_at: 'legacy', verification_status: 'current' },
  1000
);
const current: boolean = isHouseholdVerificationCurrent(null);
const enabled: boolean = parishLifeExperienceFor(undefined).communicationsEnabled;
void [settings, destination, status, current, enabled];
void setParishLibraryEnabled(db, { parishId: 'test', enabled: false });
// @ts-expect-error Settings writes require a database.
setParishLibraryEnabled(null, { parishId: 'test', enabled: true });
// @ts-expect-error Typed writes require a boolean setting.
setParishLibraryEnabled(db, { parishId: 'test', enabled: 'false' });
// @ts-expect-error Parish IDs are strings for typed settings readers.
getParishLibrarySettings(db, 123);
// @ts-expect-error Verification clocks use numeric timestamps.
householdVerificationStatus({}, 'now');
// @ts-expect-error The persisted row must be an object.
isHouseholdVerificationCurrent('current');
// @ts-expect-error Parish-life experience expects a registration record.
parishLifeExperienceFor('parish');
