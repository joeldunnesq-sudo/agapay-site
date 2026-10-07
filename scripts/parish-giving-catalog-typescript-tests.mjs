import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '' });
  return elements.get(id);
};
const statuses = [];
let plus = true;
const context = vm.createContext({
  document: { getElementById: element },
  window: {},
  currentParish: { parishId: 'p', liturgicalCalendar: 'julian' },
  editableFunds: [
    { id: 'general', name: 'General' },
    { id: 'benevolence-fund', name: 'Benevolence' },
  ],
  editableCampaigns: [],
  editableFeastCampaigns: [],
  allGifts: [
    { fundId: 'general', amountCents: 1250 },
    { campaignId: 'help', amountCents: 500 },
  ],
  escapeHtml: (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;'),
  escapeAttr: (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('"', '&quot;'),
  restrictionLabel: (v) => v,
  moneyFull: (v) => '$' + (Number(v || 0) / 100).toFixed(2),
  setStatus: (...args) => statuses.push(args),
  slugifyLocal: (v) => v.toLowerCase().replaceAll(' ', '-'),
  isGeneralDashboardFund: (f) => f.id === 'general',
  isCandleDashboardFund: (f) => f.id === 'candle',
  hasGivingPlusAccess: () => plus,
});
for (const file of ['feasts', 'options'])
  vm.runInContext(
    readFileSync(new URL('../public/parish/features/giving/' + file + '.js', import.meta.url), 'utf8'),
    context
  );
assert.equal(context.feastPresetsForCalendar('julian').length, 12);
assert.equal(context.calendarLabel('gregorian'), 'Revised-Julian');
context.renderGivingOptionsEditor();
assert.match(element('editorPane').innerHTML, /\$12.50 raised/);
assert.match(element('editorPane').innerHTML, /Candles \/ Vigil Lights/);
context.toggleFeastCampaign('pascha', true);
assert.equal(context.editableFeastCampaigns[0].destinationFundId, 'benevolence-fund');
context.updateFeastCampaignFund('pascha', 'general');
assert.equal(context.editableFeastCampaigns[0].destinationFundId, 'general');
context.toggleFeastCampaign('pascha', false);
assert.equal(context.editableFeastCampaigns.length, 0);
context.upsertPatronalFeastCampaign('custom', 'julian', 'Saint <safe>', '2026-02-28');
assert.equal(context.editableFeastCampaigns[0].feastDate, '02-28');
context.upsertPatronalFeastCampaign('custom', 'julian', 'New name', '03-01');
assert.equal(context.editableFeastCampaigns.length, 1);
assert.equal(context.editableFeastCampaigns[0].name, 'New name');
context.currentParish.patronalFeast = 'custom';
context.currentParish.patronalFeastName = 'Saint <safe>';
context.currentParish.patronalFeastDate = '03-01';
assert.match(context.renderFeastCampaignSetup(), /Saint &lt;safe>/);
assert.equal((context.patronalDayOptions(2, 29).match(/<option/g) || []).length, 29);
element('patronalFeastMonth').value = '2';
context.updatePatronalFeastDays(31);
assert.match(element('patronalFeastDay').innerHTML, /value="29" selected/);
context.window.AGAPAYLiturgicalCalendar = {
  calendarLabel: () => 'API calendar',
  liturgicalFeastsForYear: () => [
    { id: 'major', name: 'Major', rank: 'major', displayDate: 'Jan 1', sourceDate: 'source' },
    { id: 'minor', name: 'Minor', rank: 'minor' },
  ],
};
assert.equal(context.feastPresetsForCalendar('julian').length, 1);
assert.equal(context.calendarLabel('julian'), 'API calendar');
plus = false;
element('campaignName').value = 'Help';
context.addGivingOption('campaign');
assert.equal(context.editableCampaigns.length, 0);
assert.match(statuses.at(-1)[0], /require Give/);
plus = true;
element('fundName').value = '';
context.addGivingOption('fund');
assert.match(statuses.at(-1)[0], /Enter a fund name/);
element('fundName').value = 'General';
context.addGivingOption('fund');
assert.equal(context.editableFunds.length, 2);
element('fundName').value = 'Building';
element('fundDescription').value = 'Safe <description>';
element('fundPreset').value = 'custom';
context.addGivingOption('fund');
assert.equal(context.editableFunds.at(-1).id, 'building');
assert.equal(context.editableFunds.at(-1).fundType, 'custom');
assert.equal(element('fundName').value, '');
const form = {
  elements: {
    name: { value: 'Renamed' },
    description: { value: 'New description' },
    accountNumber: { value: 'a / 12!' },
    restrictionType: { value: 'invalid' },
  },
};
context.updateGivingOption({ preventDefault() {}, currentTarget: form }, 'fund', 2);
assert.equal(context.editableFunds[2].id, 'building');
assert.equal(context.editableFunds[2].name, 'Renamed');
assert.equal(context.editableFunds[2].accountNumber, 'A12');
assert.equal(context.editableFunds[2].restrictionType, 'unrestricted');
form.elements.name.value = 'General';
context.updateGivingOption({ preventDefault() {}, currentTarget: form }, 'fund', 2);
assert.equal(context.editableFunds[2].name, 'Renamed');
element('campaignName').value = 'Help';
element('campaignGoal').value = '10.50';
context.addGivingOption('campaign');
assert.equal(context.editableCampaigns[0].goalCents, 1050);
assert.equal(context.optionProgress(context.editableCampaigns[0], 'campaign').raisedCents, 500);
assert.match(context.progressMarkup(200, 100), /100%/);
assert.equal(context.parseDollarsToCents('bad'), 0);
context.removeGivingOption('fund', 2);
assert.equal(context.editableFunds.length, 2);
assert.match(statuses.at(-1)[0], /Save when ready/);
console.log(
  'PASS - giving catalog: tier gate, stable IDs, duplicate/name validation, restriction/account metadata, goals, feast destinations, calendar fallback and patronal updates'
);
