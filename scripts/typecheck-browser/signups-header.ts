openSignupActionModal({ kind: 'claim', id: 'slot-1', label: 'Bring a meal' });
openSignupActionModal({ kind: 'coverage', id: 'entry-1', currentNote: 'Away this week' });
// @ts-expect-error Claims cannot carry an existing coverage note.
openSignupActionModal({ kind: 'claim', id: 'slot-1', currentNote: 'Away' });
// @ts-expect-error Action identifiers are strings.
openSignupClaimModal(42);
const invalidSignupSlot: MemberSignupSlot = {
  id: 'slot',
  label: 'Meal',
  // @ts-expect-error Required counts are numeric.
  neededCount: '2',
  filledCount: 0,
  slotDate: null,
  read: false,
  entries: [],
};
const headerParish: AppHeaderParish = { id: 'parish-1', name: 'Parish' };
window.AGAPAYDonorSession.setProfile({ email: 'member@example.test', defaultParish: headerParish });
window.dispatchEvent(new CustomEvent<AppHeaderParish | null>('myagapay:parish-context', { detail: headerParish }));
// @ts-expect-error Typed session callers cannot store a string as the church context.
window.AGAPAYDonorSession.setProfile({ defaultParish: 'parish-1' });
// @ts-expect-error Capability flags are boolean.
const invalidHeaderParish: AppHeaderParish = { id: 'p', name: 'Parish', communicationsEnabled: 'false' };
void invalidSignupSlot;
void invalidHeaderParish;

const finalChurchPage: AppHeaderPayload = { parishes: [], cursor: null };
void finalChurchPage;
