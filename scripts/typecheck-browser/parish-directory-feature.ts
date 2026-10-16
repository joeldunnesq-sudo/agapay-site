const directorySettingsContract: DirectoryUiSettings = { directoryEnabled: true, ordinaryMemberAccessEnabled: false };
// @ts-expect-error Directory feature flags are boolean.
const invalidDirectorySettings: DirectoryUiSettings = { directoryEnabled: 'true' };
const directoryContactContract: DirectoryUiContact = { value: 'member@example.test', visibility: 'private' };
// @ts-expect-error Contact projections contain scalar values, not embedded objects.
const invalidDirectoryContact: DirectoryUiContact = { value: { email: 'member@example.test' } };
// @ts-expect-error Publication eligibility is a boolean decision.
const invalidDirectoryPhoto: DirectoryUiPhoto = { publicationEligible: 'approved' };
void [
  directorySettingsContract,
  invalidDirectorySettings,
  directoryContactContract,
  invalidDirectoryContact,
  invalidDirectoryPhoto,
];
