import { gregorianToJdn, fixedFeastDateForCivilYear, nextLiturgicalFeast } from '../../src/liturgical-calendar.js';
import { activeFestalAlmsCampaigns, festalAlmsVisibilityWindow } from '../../src/festal-alms.js';
const funds = activeFestalAlmsCampaigns(
  [{ id: 'patron', patronal: true, destinationFundId: 'benevolence' }],
  'julian',
  '2026-04-01'
);
const fund: string = funds[0].destinationFundId;
void fund;
fixedFeastDateForCivilYear({ month: 12, day: 25 }, 2026);
nextLiturgicalFeast();
festalAlmsVisibilityWindow({ id: 'pascha' }, 'julian', new Date());
// @ts-expect-error Calendar components must be numeric.
gregorianToJdn('2026', 1, 1);
// @ts-expect-error Feast dates require both month and day.
fixedFeastDateForCivilYear({ month: 12 }, 2026);
// @ts-expect-error Campaigns must be an array when present.
activeFestalAlmsCampaigns({ id: 'pascha' });
// @ts-expect-error Enable state is boolean.
activeFestalAlmsCampaigns([{ enabled: 'yes' }]);
// @ts-expect-error Reference dates are Date or string.
festalAlmsVisibilityWindow({}, 'julian', 123);
