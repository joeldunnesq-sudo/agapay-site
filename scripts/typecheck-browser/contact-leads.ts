// Compile-only contracts for the existing Admin inbox and delivery review payload.
void loadContactLeads();
void loadContactLeads(true);
// @ts-expect-error: pagination takes a boolean, never a cursor string.
void loadContactLeads('cursor');
const contactResolution: AdminContactResolutionRequest = {
  resolution: 'confirmed_not_delivered',
  attempts: 2,
  generation: 1,
};
// @ts-expect-error: delivery review cannot invent a server action.
const invalidContactResolution: AdminContactResolutionRequest = { ...contactResolution, resolution: 'resend' };
void invalidContactResolution;
// @ts-expect-error: concurrency tokens remain numeric.
const invalidContactGeneration: AdminContactResolutionRequest = { ...contactResolution, generation: '1' };
void invalidContactGeneration;
declare const contactList: AdminContactListResponse;
// @ts-expect-error: pagination cursor may be null on the last page.
const requiredContactCursor: string = contactList.nextCursor;
void requiredContactCursor;
// @ts-expect-error: rendering cannot modify response records.
contactList.leads[0].attempts = 3;
authHeaders({ 'Content-Type': 'application/json' });
// @ts-expect-error: header values are strings.
authHeaders({ Authorization: 123 });
