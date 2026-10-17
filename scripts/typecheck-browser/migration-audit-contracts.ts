import type { DonorSacramentPresentation } from '../../src/browser/donor/sacrament-presentation.js';
import type { ParishSacBindings } from '../../src/browser/parish/features/sacraments.js';
import type { ParishAppIdentity } from '../../src/browser/parish/app-contracts.js';
import type { DonorAppBindings } from '../../src/browser/donor/app.js';
import type { DonorAppPart4 } from '../../src/browser/donor/app-commemorations-and-checkout.js';

// Compile-only regression callers: each page retains its own runtime signature.
export function migrationAuditBrowserContracts(
  donorLabel: DonorSacramentPresentation['sacramentTypeLabel'],
  parishLabel: ParishSacBindings['sacramentTypeLabel']
) {
  donorLabel('confession');
  donorLabel('other', 'Parish service');
  parishLabel({ sacramentType: 'confession' });
  parishLabel({ sacramentType: 'other', otherTypeLabel: 'Parish service' });
  // @ts-expect-error The donor page does not accept the unrelated parish-page object signature.
  donorLabel({ sacramentType: 'confession' });
  // @ts-expect-error The parish page does not accept the unrelated donor-page string signature.
  parishLabel('confession');
}

export const unscheduledSacrament: SacRequest = { id: 'compile-only', status: 'requested', sacramentType: 'baptism' };
export const calendarSacrament: DonorSacramentRequest = unscheduledSacrament;
export const sacramentPayload: SacPayload = { requests: [unscheduledSacrament], offerings: { types: [], custom: [] } };
export const settingsIdentity: ParishAppIdentity = { parishId: 'compile-only', sacramentPriests: [{ name: 'Priest' }] };

export async function migrationAuditEndpointContracts(
  api: DonorAppBindings['donorApi'],
  render: DonorAppPart4['renderCommemorationsPayload']
) {
  const sacraments = await api<SacPayload>('/api/donor/sacraments');
  const rendered = render({ entries: [] }, { offerings: [] });
  const entries: DonorCommemoration[] = rendered.entries;
  // @ts-expect-error Sacrament offerings are not a giving-dashboard array.
  render(sacraments, null);
  // @ts-expect-error The renderer returns normalized entries, not a sacrament response.
  const slots: SacSlot[] = rendered.slots;
  return { entries, slots };
}
