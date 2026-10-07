import {
  handleParishLogo,
  enrichParishGivingOptions,
  campaignRaisedTotals,
  type GivingCatalogEnv,
} from '../../src/handlers/parish-giving-catalog.js';
const env: GivingCatalogEnv = {};
const result: Promise<Response> = handleParishLogo(new Request('https://example.test'), env, 'p');
void result;
campaignRaisedTotals({ id: 'roof' }, [{ giftType: 'campaign', campaignId: 'roof', amountCents: '100' }]);
enrichParishGivingOptions(env, { id: 'p', campaigns: [{ id: 'roof', goalCents: 1000 }] });
// @ts-expect-error Upload route requires a Request.
handleParishLogo('request', env, 'p');
// @ts-expect-error Public parish must retain its ID.
enrichParishGivingOptions(env, { campaigns: [] });
// @ts-expect-error Campaign configuration is an array.
enrichParishGivingOptions(env, { id: 'p', campaigns: 'roof' });
// @ts-expect-error Campaign totals require a collection of gifts.
campaignRaisedTotals({}, {});
// @ts-expect-error R2 binding must implement the runtime bucket API.
const bad: GivingCatalogEnv = { CAMPAIGN_ASSETS: 'bucket' };
void bad;
