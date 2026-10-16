import type {
  GroupUiAttachment,
  GroupUiCommerceItem,
  GroupUiSignup,
} from '../../src/browser/myagapay/groups-contracts.js';
const groupPhoto: GroupUiAttachment = {
  type: 'image',
  blob: new Blob(['fixture']),
  previewUrl: 'blob:fixture',
  durationSeconds: null,
};
// @ts-expect-error Private attachment uploads require Blob bytes.
const invalidGroupPhoto: GroupUiAttachment = { ...groupPhoto, blob: 'fixture' };
const groupListing: GroupUiCommerceItem = { id: 'item', variantId: 'variant', name: 'Dinner', priceCents: 1800 };
// @ts-expect-error Commerce prices are integer cents, not formatted currency strings.
const invalidGroupListing: GroupUiCommerceItem = { ...groupListing, priceCents: '$18.00' };
const groupSignup: GroupUiSignup = { sheet: { id: 'sheet', title: 'Serving' }, slots: [] };
// @ts-expect-error A signup detail must retain its sheet identity.
const invalidGroupSignup: GroupUiSignup = { slots: [] };
void [groupPhoto, invalidGroupPhoto, groupListing, invalidGroupListing, groupSignup, invalidGroupSignup];
