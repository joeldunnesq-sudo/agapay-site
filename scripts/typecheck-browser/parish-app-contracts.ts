import type { ParishAppBindings } from '../../src/browser/parish/app.js';
import type {
  ParishAppIdentity,
  ParishAppPayload,
  ParishAppSettingsPayload,
  ParishAppSettlementState,
} from '../../src/browser/parish/app-contracts.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
const payloadIsChecked: IsAny<ParishAppPayload> = false;
const stateIsChecked: IsAny<ParishAppBindings['currentParish']> = false;
const parish: ParishAppIdentity = {
  parishId: 'test',
  entitlements: { modules: { sacraments: { included: true } } },
  sacramentPriests: [{ name: 'Test priest', serviceTypes: ['baptism'] }],
};
const current: ParishAppBindings['currentParish'] = parish;
const changed: ParishAppSettingsPayload = {
  newDashboardPassword: 'fixture-only',
  givingCatalogChanged: false,
  bookstoreEnabled: true,
};
const routes: ParishAppSettlementState = {
  loaded: true,
  loading: false,
  profiles: [{ id: 'route', name: 'Giving', profileType: 'general_giving', modules: ['giving'] }],
  profileTypes: ['general_giving'],
  stewardshipActive: false,
};
void [payloadIsChecked, stateIsChecked, current, changed, routes];
const invalidEntitlement: ParishAppIdentity = {
  parishId: 'p',
  // @ts-expect-error Entitlement inclusion is a boolean.
  entitlements: { modules: { accounting: { included: 'yes' } } },
};
const invalidRoute: ParishAppSettlementState['profiles'][number] = {
  // @ts-expect-error A settlement route has a stable textual identifier.
  id: 4,
  name: 'Giving',
  profileType: 'general_giving',
};
// @ts-expect-error Password changes remain textual in the existing settings payload.
const invalidPassword: ParishAppSettingsPayload = { newDashboardPassword: 42 };
void [invalidEntitlement, invalidRoute, invalidPassword];
