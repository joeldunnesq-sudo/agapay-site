import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const parish = { id: 'parish', name: 'Test Parish', directoryEnabled: true };
const donor = { email: 'parent@example.test', defaultParishId: parish.id, defaultParish: parish };
const person = { id: 'parent', preferredName: 'Test Parent', version: 1 };
const inviteToken = 'a'.repeat(64);
const invitePath = `/myagapay/join-household?token=${inviteToken}`;
const families = [
  {
    id: 'first',
    displayName: 'First Household',
    version: 1,
    members: [
      { personId: person.id, preferredName: person.preferredName },
      { personId: 'spouse', preferredName: 'Test Spouse', relationship: 'spouse' },
    ],
  },
  {
    id: 'second',
    displayName: 'Second Household',
    version: 1,
    members: Array.from({ length: 9 }, (_, index) => ({
      personId: `child-${index + 1}`,
      preferredName: `Child ${index + 1}`,
      child: true,
      relationship: 'child',
    })),
  },
];
const browser = await chromium.launch({ executablePath: process.env.AGAPAY_TEST_CHROMIUM || undefined });
try {
  for (const width of [412, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    let claimed = false;
    let directoryEnabled = true;
    let optedIn = false;
    const edits = [];
    const childPublicationWrites = [];
    const invitationRequests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      ({ donor }) => {
        localStorage.setItem('agapayDonorEmail', donor.email);
        localStorage.setItem('agapayDonorToken', 'test-session');
        localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
      },
      { donor }
    );
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204 });
      if (path === '/api/directory/self/start-profile') {
        claimed = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (path === '/api/directory/self/profile') {
        return route.fulfill({
          json: {
            profile: claimed
              ? {
                  claimed,
                  currentPerson: person,
                  profile: { person },
                  manageableHouseholds: families,
                }
              : { claimed },
          },
        });
      }
      if (path === '/api/donor/dashboard')
        return route.fulfill({ json: { donor, parish: { ...parish, directoryEnabled } } });
      if (path === '/api/directory/self/statement-sharing') {
        return route.fulfill({
          json: {
            linkedChoices:
              !directoryEnabled && claimed
                ? [
                    {
                      id: 'first',
                      householdName: 'First Household',
                      parishName: parish.name,
                      receivesStatement: true,
                      optedIn,
                      bothOptedIn: false,
                    },
                  ]
                : [],
          },
        });
      }
      if (path === '/api/directory/self/statement-sharing/first') {
        assert.equal(route.request().method(), 'PUT');
        optedIn = route.request().postDataJSON().enabled;
        return route.fulfill({ json: { ok: true } });
      }
      if (path === '/api/directory/households/first/self/members/spouse/share-link') {
        assert.equal(route.request().method(), 'POST');
        assert.deepEqual(route.request().postDataJSON(), { combineGiving: true });
        return route.fulfill({ json: { invitation: { sharePath: invitePath } } });
      }
      if (path === `/api/directory/household-share/${inviteToken}`) {
        return route.fulfill({
          json: {
            invitation: {
              personName: 'Test Spouse',
              householdName: 'First Household',
              expiresAt: Date.now() + 86400000,
              combineGivingOffered: true,
            },
          },
        });
      }
      if (path === `/api/directory/household-share/${inviteToken}/claim`) {
        invitationRequests.push(route.request().postDataJSON());
        return route.fulfill({ json: { result: { message: 'Request sent to your parish.' } } });
      }
      if (path.startsWith('/api/directory/children/')) {
        if (route.request().method() !== 'GET') childPublicationWrites.push(path);
        return route.fulfill({
          json: { request: path.endsWith('/child-1/publication') ? { id: 'shared-child', status: 'approved' } : null },
        });
      }
      const [, householdId, memberId] =
        path.match(/^\/api\/directory\/households\/([^/]+)\/self(?:\/members\/([^/]+))?$/) || [];
      if (householdId) {
        const family = families.find(({ id }) => id === householdId);
        if (memberId) {
          edits.push({ householdId, memberId, body: route.request().postDataJSON() });
          assert.equal(route.request().method(), 'PATCH');
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({ json: { household: { household: family, members: family.members } } });
      }
      if (path.startsWith('/api/')) return route.fulfill({ json: {} });
      try {
        const filename = ['/myagapay/join-household', '/myagapay/directory'].includes(path) ? `${path}.html` : path;
        return await route.fulfill({ path: fileURLToPath(new URL(`../public${filename}`, import.meta.url)) });
      } catch {
        return route.fulfill({ status: 404 });
      }
    });
    await page.goto('https://agapay.test/myagapay/directory.html');
    await page.getByRole('tab', { name: 'Family Information' }).click();
    await page.getByRole('button', { name: 'Create a new household' }).click();
    const starter = page.locator('#startProfileForm');
    await starter.locator('[name="preferredName"]').fill(person.preferredName);
    await starter.getByRole('button', { name: 'Create my private profile' }).click();
    await page.getByRole('checkbox', { name: /Offer a combined annual statement/ }).check();
    await page.getByRole('button', { name: 'Invite Test Spouse' }).click();
    const copiedLink = await page.getByLabel('Household review link for Test Spouse').inputValue();
    assert.equal(copiedLink, `https://agapay.test${invitePath}`);
    const picker = page.locator('#directoryHouseholdSelect');
    await picker.selectOption('second');
    const roster = page.locator('#householdMemberList');
    await roster.getByText('Child 9', { exact: true }).waitFor();
    assert.equal(await roster.locator('[data-household-member-id]').count(), 9);
    await roster
      .locator('[data-household-member-id="child-9"]')
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await page.locator('#memberEditForm [name="dateOfBirth"]').fill('2018-03-12');
    await page.getByRole('button', { name: 'Save family member' }).click();
    await page.locator('#editWizardStatus').getByText('Family member, birthday, and nameday saved.').waitFor();
    assert.equal(edits.length, 1);
    assert.equal(edits[0].householdId, 'second');
    assert.equal(edits[0].memberId, 'child-9');
    assert.equal(edits[0].body.dateOfBirth, '2018-03-12');
    await roster.getByText('Child 9', { exact: true }).waitFor();
    assert.equal(await picker.inputValue(), 'second');
    await page.getByRole('button', { name: /Privacy choices/ }).click();
    await page.getByText('9 children', { exact: true }).waitFor();
    const privacy = page.locator('#contactForm');
    assert.equal(await privacy.locator('[name="shareChildren"]').evaluate((input) => input.indeterminate), true);
    await privacy.locator('[name="shareNameVisibility"]').selectOption('staff');
    await privacy.getByRole('button', { name: 'Save privacy choices' }).click();
    await page.getByText('Directory sharing choices saved.', { exact: true }).last().waitFor();
    assert.deepEqual(childPublicationWrites, []);
    await picker.selectOption('first');
    await page.getByText('No children entered', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Review & submit/i }).click();
    await page.getByRole('heading', { name: 'Review your directory listing' }).waitFor();

    directoryEnabled = false;
    await page.goto('https://agapay.test/myagapay/account.html');
    await page.getByRole('link', { name: 'Manage household' }).click();
    await page.getByRole('button', { name: 'Invite Test Spouse' }).waitFor();
    assert.equal(await page.locator('#memberDirectory').isVisible(), false);
    assert.equal(await page.locator('[data-go-to-step="3"]').isVisible(), false);
    await page.getByRole('button', { name: 'Opt in to a combined statement' }).click();
    await page.getByText('Waiting for the other adult').waitFor();
    await page.getByRole('button', { name: 'Withdraw my consent' }).click();
    await page.getByText('Your consent is needed').waitFor();

    claimed = false;
    await page.goto('https://agapay.test/myagapay/directory?view=household');
    const invitation = page.getByLabel('Household invitation link');
    await invitation.fill(`https://unrelated.example${invitePath}`);
    const openInvitation = page.getByRole('button', { name: 'Open household invitation' });
    await openInvitation.click();
    await page.locator('#joinExistingHouseholdError').waitFor();
    await invitation.fill(copiedLink);
    await openInvitation.click();
    await page.getByRole('heading', { name: 'Connect as Test Spouse?' }).waitFor();
    await page.getByRole('checkbox', { name: /Combine my annual giving/ }).check();
    await page.getByRole('button', { name: 'Submit for parish review' }).click();
    await page.getByText('Request sent to your parish.').waitFor();
    assert.deepEqual(invitationRequests, [{ combineGiving: true }]);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('My AGAPAY directory browser tests passed.');
