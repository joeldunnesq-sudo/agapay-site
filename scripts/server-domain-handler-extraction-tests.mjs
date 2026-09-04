import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as bookstoreDomain from '../src/handlers/donor-bookstore.js';
import * as calendarDomain from '../src/handlers/donor-parish-calendar.js';
import * as sacramentDomain from '../src/handlers/donor-sacraments.js';
import * as notificationDomain from '../src/handlers/donor-notifications.js';
import * as registrationAdminDomain from '../src/handlers/registration-admin-page.js';
import * as adminLearningDomain from '../src/handlers/admin-learning-support.js';
import * as adminEmailDomain from '../src/handlers/admin-email-diagnostics.js';
import * as adminFacade from '../src/handlers/admin.js';
import * as commerceFacade from '../src/handlers/parish-commerce.js';
import * as bookstoreInventoryDomain from '../src/handlers/parish-bookstore-inventory.js';
import * as bookstoreHandlerDomain from '../src/handlers/parish-bookstore-handler.js';
import * as donorFacade from '../src/handlers/donor.js';
import * as parishFacade from '../src/handlers/parish.js';
import * as parishOfferingDomain from '../src/handlers/parish-donor-offerings.js';
import * as parishGivingDomain from '../src/handlers/parish-giving-read-models.js';
import * as parishCheckoutDomain from '../src/handlers/parish-checkout.js';
import * as parishDashboardDomain from '../src/handlers/parish-dashboard-handler.js';
import * as stewardshipFacade from '../src/handlers/stewardship.js';
import * as stewardshipHttpDomain from '../src/handlers/stewardship-http.js';
import * as stewardshipPresentationDomain from '../src/handlers/stewardship-presentation.js';
import * as stewardshipPacketDomain from '../src/handlers/stewardship-packet-presentation.js';
import * as stewardshipFinancialDomain from '../src/handlers/stewardship-financials.js';
import * as stewardshipCommunicationsDomain from '../src/handlers/stewardship-communications.js';
import { repoRoot } from './lib/browser-composed-source.mjs';
import { donorHandlerPaths, readDonorHandlerSource } from './lib/donor-handler-source.mjs';
import { parishHandlerPaths } from './lib/parish-handler-source.mjs';
import { stewardshipHandlerPaths } from './lib/stewardship-handler-source.mjs';

const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');
const physicalLines = (source) => source.split(/\r?\n/).length - 1;
const bookstoreExports = [
  'bookstoreOrderSource',
  'guestBookstoreItemError',
  'handleDonorBookstore',
  'handleDonorBookstoreIsbnLookup',
  'handleDonorBookstoreItemFields',
  'handleDonorBookstoreRequestFeature',
  'handleParishBookstoreReadiness',
  'loadDonorBookstoreProducts',
  'normalizeBookstoreCartItems',
];
const calendarExports = ['handleDonorParishCalendar', 'parseKoinoniaCalendarIcs'];
const sacramentExports = [
  'handleDonorSacramentAvailability',
  'handleDonorSacramentBook',
  'handleDonorSacramentCancel',
  'handleDonorSacraments',
];
const notificationExports = ['handleDonorNotificationDismiss', 'handleDonorNotifications'];
const registrationAdminExports = ['adminRegistrationSummary', 'loadAdminRegistrationPage'];
const adminLearningExports = [
  'handleAdminLearnCommunity',
  'handleAdminLearnFeedback',
  'handleAdminLearnScholarship',
  'handleAdminLearnSummary',
  'handleAdminParishSupportTickets',
];
const adminEmailExports = ['handleAdminEmailDiagnostics'];
const bookstoreInventoryExports = [
  'BOOKSTORE_INVENTORY_ATTENTION',
  'BOOKSTORE_STARTER_CATALOG',
  'applyBookstoreInventoryAtCompletion',
  'changedRows',
  'closeBookstoreCountSession',
  'getBookstoreCountSession',
  'listBookstoreCountSessions',
  'listBookstoreLowStock',
  'normalizeBookstoreProduct',
  'patchBookstoreProduct',
  'patchBookstoreReorderThreshold',
  'promotePaidScannedBooksToCatalog',
  'receiveBookstoreStock',
  'startBookstoreCountSession',
];
const bookstoreFacadeExports = bookstoreInventoryExports.filter(
  (name) =>
    ![
      'BOOKSTORE_STARTER_CATALOG',
      'BOOKSTORE_INVENTORY_ATTENTION',
      'changedRows',
      'normalizeBookstoreProduct',
      'promotePaidScannedBooksToCatalog',
    ].includes(name)
);
const bookstoreHandlerExports = ['handleParishBookstore'];
const parishDomainExports = {
  'parish-donor-offerings.js': Object.keys(parishOfferingDomain),
  'parish-giving-read-models.js': Object.keys(parishGivingDomain),
  'parish-checkout.js': Object.keys(parishCheckoutDomain),
  'parish-dashboard-handler.js': Object.keys(parishDashboardDomain),
};
const stewardshipFacadeDomains = [
  [stewardshipFinancialDomain, ['handleStewardshipFinancials']],
  [stewardshipCommunicationsDomain, ['handleStewardshipNudge', 'handleStewardshipWebhook']],
];

assert.deepEqual(Object.keys(bookstoreDomain).sort(), bookstoreExports);
assert.deepEqual(Object.keys(calendarDomain).sort(), calendarExports);
assert.deepEqual(Object.keys(sacramentDomain).sort(), sacramentExports);
assert.deepEqual(Object.keys(notificationDomain).sort(), notificationExports);
assert.deepEqual(Object.keys(registrationAdminDomain).sort(), registrationAdminExports);
assert.deepEqual(Object.keys(adminLearningDomain).sort(), adminLearningExports);
assert.deepEqual(Object.keys(adminEmailDomain).sort(), adminEmailExports);
assert.deepEqual(Object.keys(bookstoreInventoryDomain).sort(), bookstoreInventoryExports);
assert.deepEqual(Object.keys(bookstoreHandlerDomain).sort(), bookstoreHandlerExports);
for (const name of bookstoreExports) {
  assert.equal(donorFacade[name], bookstoreDomain[name], `donor.js must preserve the ${name} compatibility export`);
}
for (const name of calendarExports) {
  assert.equal(donorFacade[name], calendarDomain[name], `donor.js must preserve the ${name} compatibility export`);
}
for (const name of sacramentExports) {
  assert.equal(donorFacade[name], sacramentDomain[name], `donor.js must preserve the ${name} compatibility export`);
}
for (const name of notificationExports) {
  assert.equal(donorFacade[name], notificationDomain[name], `donor.js must preserve the ${name} compatibility export`);
}
for (const name of registrationAdminExports) {
  assert.equal(
    donorFacade[name],
    registrationAdminDomain[name],
    `donor.js must preserve the ${name} compatibility export`
  );
}
for (const name of adminLearningExports) {
  assert.equal(adminFacade[name], adminLearningDomain[name], `admin.js must preserve the ${name} compatibility export`);
}
for (const name of adminEmailExports) {
  assert.equal(adminFacade[name], adminEmailDomain[name], `admin.js must preserve the ${name} compatibility export`);
}
for (const name of bookstoreFacadeExports) {
  assert.equal(
    commerceFacade[name],
    bookstoreInventoryDomain[name],
    `parish-commerce.js must preserve the ${name} compatibility export`
  );
}
assert.equal(
  commerceFacade.handleParishBookstore,
  bookstoreHandlerDomain.handleParishBookstore,
  'parish-commerce.js must preserve the handleParishBookstore compatibility export'
);
for (const [file, names] of Object.entries(parishDomainExports)) {
  const domain = {
    'parish-donor-offerings.js': parishOfferingDomain,
    'parish-giving-read-models.js': parishGivingDomain,
    'parish-checkout.js': parishCheckoutDomain,
    'parish-dashboard-handler.js': parishDashboardDomain,
  }[file];
  for (const name of names) {
    assert.equal(parishFacade[name], domain[name], `parish.js must preserve the ${name} compatibility export`);
  }
}
for (const [domain, names] of stewardshipFacadeDomains) {
  for (const name of names) {
    assert.equal(
      stewardshipFacade[name],
      domain[name],
      `stewardship.js must preserve the ${name} compatibility export`
    );
  }
}

const facadeSource = read('src/handlers/donor.js');
const bookstoreSource = read('src/handlers/donor-bookstore.js');
const calendarSource = read('src/handlers/donor-parish-calendar.js');
const sacramentSource = read('src/handlers/donor-sacraments.js');
const notificationSource = read('src/handlers/donor-notifications.js');
const registrationAdminSource = read('src/handlers/registration-admin-page.js');
const adminFacadeSource = read('src/handlers/admin.js');
const adminLearningSource = read('src/handlers/admin-learning-support.js');
const adminEmailSource = read('src/handlers/admin-email-diagnostics.js');
const commerceFacadeSource = read('src/handlers/parish-commerce.js');
const bookstoreInventorySource = read('src/handlers/parish-bookstore-inventory.js');
const bookstoreHandlerSource = read('src/handlers/parish-bookstore-handler.js');
const parishFacadeSource = read('src/handlers/parish.js');
const stewardshipFacadeSource = read('src/handlers/stewardship.js');
for (const name of [
  ...bookstoreExports,
  ...calendarExports,
  ...sacramentExports,
  ...notificationExports,
  ...registrationAdminExports,
]) {
  assert.doesNotMatch(
    facadeSource,
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
    `${name} implementation must move out of donor.js`
  );
}
for (const name of [...adminLearningExports, ...adminEmailExports]) {
  assert.doesNotMatch(
    adminFacadeSource,
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
    `${name} implementation must move out of admin.js`
  );
}
for (const name of [...bookstoreFacadeExports, ...bookstoreHandlerExports]) {
  assert.doesNotMatch(
    commerceFacadeSource,
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
    `${name} implementation must move out of parish-commerce.js`
  );
}
assert.match(facadeSource, /from ["']\.\/donor-bookstore\.js["']/);
assert.match(facadeSource, /from ["']\.\/donor-parish-calendar\.js["']/);
assert.match(facadeSource, /from ["']\.\/donor-sacraments\.js["']/);
assert.match(facadeSource, /from ["']\.\/donor-notifications\.js["']/);
assert.match(facadeSource, /from ["']\.\/registration-admin-page\.js["']/);
for (const [file, names] of Object.entries(parishDomainExports)) {
  assert.match(parishFacadeSource, new RegExp(`from ["']\\./${file.replace(/\.js$/, '\\.js')}["']`));
  for (const name of names) {
    assert.doesNotMatch(
      parishFacadeSource,
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
      `${name} implementation must move out of parish.js`
    );
  }
}
for (const [, names] of stewardshipFacadeDomains) {
  for (const name of names) {
    assert.doesNotMatch(
      stewardshipFacadeSource,
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
      `${name} implementation must move out of stewardship.js`
    );
  }
}
assert.ok(physicalLines(bookstoreSource) <= 1200, 'Donor Bookstore domain must stay below the source limit');
assert.ok(physicalLines(calendarSource) <= 1200, 'Donor Parish Calendar domain must stay below the source limit');
assert.ok(physicalLines(sacramentSource) <= 1200, 'Donor Sacraments domain must stay below the source limit');
assert.ok(physicalLines(notificationSource) <= 1200, 'Donor Notifications domain must stay below the source limit');
assert.ok(
  physicalLines(registrationAdminSource) <= 1200,
  'Registration Admin page domain must stay below the source limit'
);
for (const file of parishHandlerPaths.slice(1)) {
  assert.ok(physicalLines(read(file)) <= 1200, `${file} must stay below the source limit`);
}
for (const file of stewardshipHandlerPaths.slice(1)) {
  assert.ok(physicalLines(read(file)) <= 1200, `${file} must stay below the source limit`);
}
assert.ok(
  physicalLines(adminLearningSource) <= 1200,
  'Admin Learning and Support domain must stay below the source limit'
);
assert.ok(physicalLines(adminEmailSource) <= 1200, 'Admin Email Diagnostics domain must stay below the source limit');
assert.ok(
  physicalLines(bookstoreInventorySource) <= 1200,
  'Parish Bookstore Inventory domain must stay below the source limit'
);
assert.ok(
  physicalLines(bookstoreHandlerSource) <= 1200,
  'Parish Bookstore Handler domain must stay below the source limit'
);
assert.deepEqual(donorHandlerPaths, [
  'src/handlers/donor.js',
  'src/handlers/donor-bookstore.js',
  'src/handlers/donor-parish-calendar.js',
  'src/handlers/donor-sacraments.js',
  'src/handlers/donor-notifications.js',
  'src/handlers/registration-admin-page.js',
]);
assert.match(readDonorHandlerSource(), /Do not add any AGAPAY platform\/application fee to bookstore/);
assert.match(readDonorHandlerSource(), /loadPublishedCommerceCalendarEvents/);
assert.equal(parishFacadeSource.split(/\r?\n/).length <= 1200, true, 'parish.js must remain a bounded facade');
assert.ok(
  stewardshipFacadeSource.split(/\r?\n/).length <= 1400,
  'stewardship.js must remain within its reduced physical source budget'
);

assert.equal(bookstoreDomain.bookstoreOrderSource([{ source: 'catalog' }], false), 'catalog');
assert.equal(bookstoreDomain.bookstoreOrderSource([{ source: 'scan_and_go' }], true), 'scan_and_go');
assert.equal(
  bookstoreDomain.guestBookstoreItemError([
    { source: 'shopper_added', itemCategory: 'icon', specifics: { saint_or_feast: 'St. Nicholas' } },
  ]),
  ''
);
assert.match(
  bookstoreDomain.guestBookstoreItemError([{ source: 'shopper_added', itemCategory: 'other', specifics: {} }]),
  /Describe every shopper-added item/
);

const calendarEvents = calendarDomain.parseKoinoniaCalendarIcs(
  [
    'BEGIN:VEVENT',
    'UID:calendar-extraction-test',
    'SUMMARY:Parish\\, Picnic',
    'DTSTART:20300105T180000Z',
    'DTEND:20300105T190000Z',
    'END:VEVENT',
  ].join('\r\n'),
  new Date('2030-01-01T00:00:00Z')
);
assert.equal(calendarEvents.length, 1);
assert.equal(calendarEvents[0].title, 'Parish, Picnic');
assert.equal(calendarEvents[0].startsAt, '2030-01-05T18:00:00.000Z');

const wrongMethodResponse = await sacramentDomain.handleDonorSacramentAvailability(
  new Request('https://agapay.app/api/donor/sacraments/availability', { method: 'POST' }),
  {}
);
assert.equal(wrongMethodResponse.status, 405);
assert.deepEqual(await wrongMethodResponse.json(), { error: 'Method not allowed' });

const notificationWrongMethod = await notificationDomain.handleDonorNotifications(
  new Request('https://agapay.app/api/donor/notifications', { method: 'POST' }),
  {}
);
assert.equal(notificationWrongMethod.status, 405);
assert.deepEqual(await notificationWrongMethod.json(), { error: 'Method not allowed' });

assert.deepEqual(registrationAdminDomain.adminRegistrationSummary(null, 'fallback-reference'), {
  reference: 'fallback-reference',
  status: 'pending',
  parishName: '',
  communityType: '',
  liturgicalCalendar: 'julian',
  jurisdiction: '',
  city: '',
  state: '',
  priestEmail: '',
  treasurerEmail: '',
  givingStatus: 'active',
  subscriptionTier: 'parish',
  subscriptionStatus: 'not_started',
  stripeAccountStatus: 'not_started',
  dashboardInviteEmailStatus: '',
  adminNotificationEmailStatus: '',
  receivedAt: '',
});

const learnWrongMethod = await adminLearningDomain.handleAdminLearnFeedback(
  new Request('https://agapay.app/api/admin/learn/feedback/test', { method: 'GET' }),
  {}
);
assert.equal(learnWrongMethod.status, 405);
assert.deepEqual(await learnWrongMethod.json(), { error: 'Method not allowed' });

const diagnosticWrongMethod = await adminEmailDomain.handleAdminEmailDiagnostics(
  new Request('https://agapay.app/api/admin/email-diagnostics', { method: 'GET' }),
  {}
);
assert.equal(diagnosticWrongMethod.status, 405);
assert.deepEqual(await diagnosticWrongMethod.json(), { error: 'Method not allowed' });

assert.equal(bookstoreInventoryDomain.BOOKSTORE_STARTER_CATALOG.length, 3);
assert.deepEqual(
  bookstoreInventoryDomain.normalizeBookstoreProduct({ id: 'book-1', name: 'Book', unit_price_cents: 1250 }),
  {
    id: 'book-1',
    variantId: '',
    name: 'Book',
    description: '',
    category: 'other',
    sku: '',
    priceCents: 1250,
    salePriceCents: 0,
    onSale: false,
    costBasisCents: 0,
    stockQuantity: 0,
    reorderThreshold: 0,
    trackInventory: true,
    status: 'active',
    imageUrl: '',
    updatedAt: '',
  }
);
assert.equal(parishGivingDomain.recurringExpectedDays('weekly'), 10);
assert.equal(parishGivingDomain.recurringExpectedDays('annual'), 400);
assert.equal(stewardshipHttpDomain.displayToCents('12.34'), 1234);
assert.equal(stewardshipHttpDomain.centsToDisplay(1234), '12.34');
assert.deepEqual(Object.keys(stewardshipPresentationDomain).sort(), [
  'annualMeetingFormHtml',
  'billingHtml',
  'paywallHtml',
  'stewardshipHomeHtml',
]);
assert.deepEqual(Object.keys(stewardshipPacketDomain), ['packetPreviewHtml']);

console.log(
  `PASS - server domain facades preserve Donor, Admin, Parish, Commerce, and Stewardship exports with focused behavior`
);
