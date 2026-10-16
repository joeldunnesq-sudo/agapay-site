import type {
  ParishSacRule,
  ParishSacState,
  ParishSacCalendarItem,
} from '../../src/browser/parish/sacrament-feature-contracts.js';
const rule: ParishSacRule = {
  id: 'rule',
  sacramentType: 'confession',
  dayOfWeek: 1,
  startTime: '10:00',
  endTime: '11:00',
};
// @ts-expect-error Weekly availability weekdays are numeric.
const invalidRule: ParishSacRule = { ...rule, dayOfWeek: 'Monday' };
const state: ParishSacState = {
  loaded: true,
  requests: [],
  preparationTemplates: [],
  preparationDocumentsConfigured: false,
};
const compatiblePreparationState: typeof sacramentsState = state;
const blackout: ParishSacCalendarItem = { sacramentType: 'blackout', blackout: true, confirmedTime: 'All day' };
// @ts-expect-error Calendar flags are boolean.
const invalidBlackout: ParishSacCalendarItem = { sacramentType: 'blackout', blackout: 'true' };
void [rule, invalidRule, compatiblePreparationState, blackout, invalidBlackout];
