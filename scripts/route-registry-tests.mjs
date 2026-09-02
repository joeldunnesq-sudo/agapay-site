import assert from 'node:assert/strict';
import { routeAccountingRequest } from '../src/routes/accounting.js';
import { routeAdminRequest } from '../src/routes/admin.js';
import { routeDirectoryRequest } from '../src/routes/directory.js';
import { routeDonorRequest } from '../src/routes/donor.js';
import { routeLearnRequest } from '../src/routes/learn.js';
import { routeOrganizationRequest } from '../src/routes/organization.js';
import { routeParishRequest } from '../src/routes/parish.js';
import { dispatchRouteRegistries } from '../src/routes/registry.js';
import { routeStewardshipRequest } from '../src/routes/stewardship.js';

function requestContext(path, method = 'GET', overrides = {}) {
  const request = new Request(`https://agapay.test${path}`, { method });
  const calls = [];
  const actions = new Proxy(overrides, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => {
        calls.push({ action: property, args });
        return new Response(String(property));
      };
    },
  });
  return { request, env: {}, ctx: {}, url: new URL(request.url), actions, calls };
}

const order = [];
const orderedResponse = await dispatchRouteRegistries(
  [
    async () => {
      order.push('first');
      return null;
    },
    async () => {
      order.push('second');
      return new Response('matched');
    },
    async () => {
      order.push('third');
      return new Response('wrong');
    },
  ],
  {}
);
assert.deepEqual(order, ['first', 'second']);
assert.equal(await orderedResponse.text(), 'matched');

const organization = requestContext('/api/v1/organizations/demo', 'GET', {
  findRegistrationByParishId: async () => null,
  json: (body, init) => Response.json(body, init),
});
assert.equal((await routeOrganizationRequest(organization)).status, 404);

const directory = requestContext('/api/parish/dashboard/st%20fiacre/directory/admin/settings');
assert.equal(await (await routeDirectoryRequest(directory)).text(), 'handleDirectoryAdmin');
assert.equal(directory.calls[0].args[2], 'st fiacre');

const accountingCalls = [];
const accounting = requestContext('/api/parish/dashboard/demo/accounting/reports', 'GET', {
  handleAccountingRecurring: () => {
    accountingCalls.push('recurring');
    return null;
  },
  handleAccountingPayablesBudgets: () => {
    accountingCalls.push('payables');
    return new Response('payables');
  },
});
assert.equal(await (await routeAccountingRequest(accounting)).text(), 'payables');
assert.deepEqual(accountingCalls, ['recurring', 'payables']);

const learn = requestContext('/api/learn/google-calendar/callback?state=sac.payload');
assert.equal(await (await routeLearnRequest(learn)).text(), 'handleSacramentsGoogleCallback');

const donor = requestContext('/api/public/bookstore/st%20fiacre');
assert.equal(await (await routeDonorRequest(donor)).text(), 'handleDonorBookstore');
assert.equal(donor.calls[0].args[2], 'st fiacre');

const admin = requestContext('/api/admin/registrations/ref-1/dashboard-invite', 'POST');
assert.equal(await (await routeAdminRequest(admin)).text(), 'handleDashboardInvite');
assert.equal(admin.calls[0].args[2], 'ref-1');
assert.equal(await routeAdminRequest(requestContext('/api/admin/seed-demo', 'POST')), null);

const stewardship = requestContext('/api/parish/dashboard/demo/stewardship/income/manual/entry-9', 'DELETE');
assert.equal(await (await routeStewardshipRequest(stewardship)).text(), 'handleStewardshipManualIncomeDelete');
assert.equal(stewardship.calls[0].args[3], 'entry-9');

const attendance = requestContext('/api/parish/dashboard/demo/stewardship/attendance?weeks=26');
assert.equal(await (await routeStewardshipRequest(attendance)).text(), 'handleStewardshipAttendance');
const attendanceDelegation = requestContext('/api/parish/dashboard/demo/stewardship/attendance/delegation', 'PATCH');
assert.equal(
  await (await routeStewardshipRequest(attendanceDelegation)).text(),
  'handleStewardshipAttendanceDelegation'
);

const sacramentRules = requestContext('/api/parish/dashboard/demo/sacraments/availability/rules', 'POST');
assert.equal(await (await routeParishRequest(sacramentRules)).text(), 'handleParishAvailabilityRuleCreate');

const bulletins = requestContext('/api/parish/dashboard/demo/bulletins');
assert.equal(await (await routeParishRequest(bulletins)).text(), 'handleParishBulletins');

const sacramentPreparation = requestContext(
  '/api/parish/dashboard/demo/sacraments/request-1/preparation/items',
  'PATCH'
);
assert.equal(await (await routeParishRequest(sacramentPreparation)).text(), 'handleParishSacramentPreparation');

const pastoralFollowUp = requestContext('/api/parish/dashboard/demo/sacraments/follow-up/followup-1/contacts', 'POST');
assert.equal(await (await routeParishRequest(pastoralFollowUp)).text(), 'handleParishPastoralFollowUp');
assert.equal(pastoralFollowUp.calls[0].args[3], '/followup-1/contacts');
assert.equal(pastoralFollowUp.calls[0].args[4], pastoralFollowUp.ctx);

const parishFallback = requestContext('/api/parish/dashboard/demo/unknown');
assert.equal(await (await routeParishRequest(parishFallback)).text(), 'handleParishDashboard');
assert.equal(parishFallback.calls[0].args[2], 'demo/unknown');

console.log('PASS - ordered Worker domain routers preserve critical precedence and parameters');
