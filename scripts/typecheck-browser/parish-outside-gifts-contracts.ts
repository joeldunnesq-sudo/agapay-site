const outsideSave: Promise<void> = submitOutsideGift(new Event('submit'));
void outsideSave;
// @ts-expect-error Submission requires an event.
submitOutsideGift('submit');
// @ts-expect-error Revision must be numeric.
const badOutsideRevision: Pick<ParishOutsideGift, 'revision'> = { revision: '1' };
void badOutsideRevision;
// @ts-expect-error Outside API request body must be a record.
outsideRequest('', 123);
