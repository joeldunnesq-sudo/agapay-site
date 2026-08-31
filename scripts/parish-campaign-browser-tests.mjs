import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { openParishFixture, parish, origin } from './lib/parish-browser-fixture.mjs';

/* global loadDashboard */

const browser = await chromium.launch({ headless: true });
const imageBytes = await readFile(new URL('../public/favicons/favicon-32x32.png', import.meta.url));
const photo = (name) => ({ name, mimeType: 'image/png', buffer: imageBytes });
const imageUrl = (name) => `${origin}/favicons/favicon-32x32.png?campaign-photo=${name}`;
const previousUpdate = { id: 'update-before', date: '2026-01-01T12:00:00.000Z', body: 'Original update' };
const existing = {
  id: 'roof',
  name: 'Roof & restoration',
  slug: 'roof-campaign',
  goalCents: 100000,
  raisedCents: 120000,
  giftCount: 2,
  description: 'Repair the roof',
  status: 'active',
  endsAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  coverPhotoUrl: imageUrl('original-cover'),
  photos: [imageUrl('legacy'), { url: imageUrl('saved'), key: 'saved-key' }],
  updates: [previousUpdate],
};
const other = { id: 'outreach', name: 'Outreach', status: 'paused', goalCents: 0, updates: [], customMetadata: 'keep' };
const campaignParish = (campaigns) => ({
  ...parish,
  subscriptionTier: 'giving',
  subscriptionTierLabel: 'Give +',
  campaigns,
  onboarding: { enabled: true, state: 'LIVE' },
});

async function scenario(name, dashboardResponse, run, apiResponses) {
  const fixture = await openParishFixture(browser, dashboardResponse, apiResponses);
  try {
    await fixture.open();
    const { page } = fixture;
    await page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
    await page.locator('#nav-campaigns').click();
    await run(page);
    fixture.assertClean();
    console.log(`PASS - ${name}`);
  } finally {
    await fixture.close();
  }
}

function patchBody(request) {
  assert.equal(request.method(), 'PATCH');
  assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
  assert.equal(request.headers()['content-type'], 'application/json');
  const payload = request.postDataJSON();
  assert.deepEqual(Object.keys(payload), ['campaigns'], 'campaign saves must not submit unrelated dashboard settings');
  return payload.campaigns;
}

async function saved(page) {
  await page.locator('#campSaveStatus a').waitFor();
  assert.equal(await page.locator('#saveCampaignBtn').isEnabled(), true);
}

try {
  let latest = { ...campaignParish([]), subscriptionTier: 'starter', subscriptionTierLabel: 'Give' };
  await scenario(
    'empty list, escaped names, status, progress, links, and live dashboard refresh',
    () => ({ parish: latest }),
    async (page) => {
      assert.ok((await page.locator('#campaignListPane').textContent()).includes('No campaigns yet'));
      assert.equal(await page.locator('#tab-campaigns > .starter-tier-paywall').count(), 1);
      latest = campaignParish([
        existing,
        other,
        { id: 'done', name: '<img src=x onerror=alert(1)>', status: 'completed' },
      ]);
      await page.evaluate(() => loadDashboard());
      assert.equal(await page.locator('#tab-campaigns > .starter-tier-paywall').count(), 0);
      const rows = page.locator('.campaign-list-item');
      assert.equal(await rows.count(), 3);
      assert.equal(await rows.locator('img').count(), 0, 'campaign names must remain text');
      assert.ok((await rows.nth(2).textContent()).includes('<img src=x onerror=alert(1)>'));
      assert.equal(await rows.nth(0).locator('.status-active').textContent(), 'Active');
      assert.equal(await rows.nth(1).locator('.status-paused').textContent(), 'Paused');
      assert.equal(await rows.nth(2).locator('.status-completed').textContent(), 'Completed');
      assert.ok((await rows.nth(0).textContent()).includes('$1,200 raised of $1,000'));
      assert.ok((await rows.nth(0).textContent()).includes('2 gifts'));
      assert.equal(
        await rows
          .nth(0)
          .locator('[style*="linear-gradient"]')
          .evaluate((el) => el.style.width),
        '100%'
      );
      assert.equal(
        await rows.nth(0).getByTitle('View public page').getAttribute('href'),
        '/give/synthetic-parish/roof-campaign'
      );
      await page.locator('#nav-giving').click();
      await page.locator('#nav-campaigns').click();
      assert.equal(await rows.count(), 3);
    }
  );

  let releaseSave;
  let acknowledgeSave;
  const receivedSave = new Promise((resolve) => {
    acknowledgeSave = resolve;
  });
  const heldSave = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const created = [];
  await scenario(
    'new campaign validation, failed save, retry, busy controls, and server-confirmed list',
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: campaignParish([]) };
      const campaigns = patchBody(request);
      created.push(campaigns);
      if (created.length === 1) return { status: 503, body: { error: 'Synthetic save unavailable' } };
      acknowledgeSave();
      return heldSave;
    },
    async (page) => {
      await page.getByRole('button', { name: '+ New Campaign', exact: true }).click();
      assert.equal(await page.locator('#campaignUpdateCard').isHidden(), true);
      await page.locator('#saveCampaignBtn').click();
      assert.equal(await page.locator('#campSaveStatus').textContent(), 'Campaign name is required.');
      assert.equal(created.length, 0);
      await page.locator('#campName').fill('  New Roof & Bell  ');
      await page.locator('#campGoal').fill('1234.56');
      await page.locator('#campDescription').fill('  A parish building need  ');
      await page.locator('#campEndsAt').fill('2026-12-31');
      await page.locator('#campStatus').selectOption('paused');
      await page.locator('#saveCampaignBtn').click();
      await page.locator('#campSaveStatus').filter({ hasText: 'Error: Synthetic save unavailable' }).waitFor();
      assert.equal(await page.locator('#saveCampaignBtn').isEnabled(), true);
      assert.equal(await page.locator('#campName').inputValue(), '  New Roof & Bell  ');
      assert.equal(await page.locator('.campaign-list-item').count(), 0);
      assert.equal(await page.locator('#campaignUpdateCard').isHidden(), true);
      const first = created[0][0];
      assert.match(first.id, /^camp_[a-f0-9]{10}$/);
      assert.deepEqual(
        { ...first, id: null, createdAt: null },
        {
          id: null,
          name: 'New Roof & Bell',
          slug: 'new-roof-bell',
          goalCents: 123456,
          description: 'A parish building need',
          status: 'paused',
          endsAt: '2026-12-31',
          coverPhotoUrl: '',
          photos: [],
          createdAt: null,
          updates: [],
        }
      );
      const sent = page.waitForRequest((request) => request.method() === 'PATCH');
      await page.locator('#saveCampaignBtn').click();
      await sent;
      await receivedSave;
      assert.equal(await page.locator('#saveCampaignBtn').isDisabled(), true);
      assert.equal(await page.locator('#campSaveStatus').textContent(), 'Saving…');
      releaseSave({ campaigns: [{ ...created[1][0], name: 'Server-confirmed campaign' }] });
      await saved(page);
      assert.equal(await page.locator('.campaign-list-item').count(), 1);
      assert.ok((await page.locator('.campaign-list-item').textContent()).includes('Server-confirmed campaign'));
      assert.equal(
        await page.locator('#campSaveStatus a').getAttribute('href'),
        '/give/synthetic-parish/new-roof-bell-campaign'
      );
      assert.equal(await page.locator('#campaignUpdateCard').isVisible(), true);
      await page.locator('#campaignEditorCard').getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await page.locator('#campaignEditorCard').isHidden(), true);
      assert.equal(await page.locator('#campaignUpdateCard').isHidden(), true);
    }
  );

  const edits = [];
  await scenario(
    'editing preserves creation, updates, and other campaigns; cancel and new reset the draft',
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: campaignParish([existing, other]) };
      edits.push(patchBody(request));
      return { campaigns: edits.at(-1) };
    },
    async (page) => {
      const edit = page.locator('.campaign-list-item').first().getByRole('button', { name: 'Edit', exact: true });
      await edit.click();
      assert.equal(await page.locator('#campName').inputValue(), existing.name);
      assert.equal(await page.locator('#campGoal').inputValue(), '1000');
      assert.equal(await page.locator('#campEndsAt').inputValue(), '2026-12-31');
      assert.equal(await page.locator('#campDescription').inputValue(), existing.description);
      assert.equal(await page.locator('#campCoverImg').getAttribute('src'), existing.coverPhotoUrl);
      assert.equal(await page.locator('#campPhotosGrid img').count(), 2);
      await page.locator('#campName').fill('Unsaved draft');
      await page.locator('#campaignEditorCard').getByRole('button', { name: 'Cancel', exact: true }).click();
      await edit.click();
      assert.equal(await page.locator('#campName').inputValue(), existing.name);
      await page.locator('#campName').fill('Restoration complete');
      await page.locator('#campStatus').selectOption('completed');
      await page.locator('#saveCampaignBtn').click();
      await saved(page);
      const updated = edits[0][0];
      assert.equal(updated.id, existing.id);
      assert.equal(updated.createdAt, existing.createdAt);
      assert.deepEqual(updated.updates, existing.updates);
      assert.deepEqual(updated.photos, [{ url: existing.photos[0], key: '' }, existing.photos[1]]);
      assert.deepEqual(edits[0][1], other);
      assert.equal(
        await page.locator('.campaign-list-item').first().locator('.status-completed').textContent(),
        'Completed'
      );
      await page.getByRole('button', { name: '+ New Campaign', exact: true }).click();
      assert.equal(await page.locator('#campName').inputValue(), '');
      assert.equal(await page.locator('#campStatus').inputValue(), 'active');
      assert.equal(await page.locator('#campCoverPreview').isHidden(), true);
      assert.equal(await page.locator('#campPhotosGrid img').count(), 0);
      assert.equal(await page.locator('#campaignUpdateCard').isHidden(), true);
    }
  );

  await scenario(
    'new, switched, and reopened editors reset the heading, update draft, and stale status',
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: campaignParish([existing, other]) };
      patchBody(request);
      return { status: 503, body: { error: 'Synthetic update unavailable' } };
    },
    async (page) => {
      const editFirst = page.locator('.campaign-list-item').first().getByRole('button', { name: 'Edit', exact: true });
      const editOther = page.locator('.campaign-list-item').nth(1).getByRole('button', { name: 'Edit', exact: true });
      const post = page.getByRole('button', { name: 'Post Update', exact: true });
      await editFirst.click();
      await page.locator('#updateBody').fill('Unposted roof update');
      await post.click();
      await page.locator('#updatePostStatus').filter({ hasText: 'Error: Synthetic update unavailable' }).waitFor();
      await page.getByRole('button', { name: '+ New Campaign', exact: true }).click();
      assert.equal(await page.locator('#campaignEditorTitle').textContent(), 'New Campaign');
      assert.equal(await page.locator('#updateBody').inputValue(), '');
      assert.equal(await page.locator('#updatePostStatus').textContent(), '');
      assert.equal(await page.locator('#campaignUpdateCard').isHidden(), true);
      await editFirst.click();
      await page.locator('#updateBody').fill('Another roof update');
      await post.click();
      await page.locator('#updatePostStatus').filter({ hasText: 'Error: Synthetic update unavailable' }).waitFor();
      await editOther.click();
      assert.equal(await page.locator('#campaignEditorTitle').textContent(), 'Edit Campaign');
      assert.equal(await page.locator('#campName').inputValue(), other.name);
      assert.equal(await page.locator('#updateBody').inputValue(), '', 'a draft must not carry into another campaign');
      assert.equal(await page.locator('#updatePostStatus').textContent(), '');
      await page.locator('#updateBody').fill('Cancelled outreach update');
      await page.locator('#campaignEditorCard').getByRole('button', { name: 'Cancel', exact: true }).click();
      await editOther.click();
      assert.equal(
        await page.locator('#updateBody').inputValue(),
        '',
        'cancel must discard the update draft on reopen'
      );
    }
  );

  const uploads = [];
  const mediaSaves = [];
  const alerts = [];
  await scenario(
    'cover failures recover, gallery uploads continue after failure, and removal is saved',
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: campaignParish([existing]) };
      mediaSaves.push(patchBody(request));
      return { campaigns: mediaSaves.at(-1) };
    },
    async (page) => {
      page.on('dialog', async (dialog) => {
        alerts.push(dialog.message());
        await dialog.accept();
      });
      await page.locator('.campaign-list-item').getByRole('button', { name: 'Edit', exact: true }).click();
      await page.locator('#campCoverInput').setInputFiles(photo('cover.png'));
      await page.waitForFunction(
        () =>
          document.getElementById('campCoverInput').value === '' &&
          document.getElementById('campCoverUploadZone').style.opacity === ''
      );
      assert.equal(alerts[0], 'Cover upload failed: Synthetic cover rejection');
      assert.equal(await page.locator('#campCoverImg').getAttribute('src'), existing.coverPhotoUrl);
      await page.locator('#campCoverInput').setInputFiles(photo('cover-retry.png'));
      await page.waitForFunction((url) => document.getElementById('campCoverImg').src === url, imageUrl('upload-2'));
      assert.equal(await page.locator('#campCoverPreview').isVisible(), true);
      let fileChoosers = 0;
      page.on('filechooser', () => {
        fileChoosers++;
      });
      await page.locator('#campCoverPreview button').click();
      assert.equal(await page.locator('#campCoverPreview').isHidden(), true);
      assert.equal(fileChoosers, 0, 'remove must not bubble into the upload-zone click');
      await page.locator('#campPhotosInput').setInputFiles([photo('one.png'), photo('bad.png'), photo('three.png')]);
      await page.waitForFunction(
        () =>
          document.querySelectorAll('#campPhotosGrid img').length === 4 &&
          document.getElementById('campPhotosInput').value === ''
      );
      assert.deepEqual(alerts, [
        'Cover upload failed: Synthetic cover rejection',
        'Photo upload failed: Synthetic gallery rejection',
      ]);
      assert.equal(uploads.length, 5);
      await page.locator('#campPhotosGrid button').first().click();
      assert.equal(await page.locator('#campPhotosGrid img').count(), 3);
      await page.locator('#saveCampaignBtn').click();
      await saved(page);
      assert.equal(mediaSaves[0][0].coverPhotoUrl, '');
      assert.deepEqual(mediaSaves[0][0].photos, [
        existing.photos[1],
        { url: imageUrl('upload-3'), key: 'key-3' },
        { url: imageUrl('upload-5'), key: 'key-5' },
      ]);
      await page.getByRole('button', { name: '+ New Campaign', exact: true }).click();
      await page.locator('#campCoverInput').setInputFiles(photo('new-cover.png'));
      await page.waitForFunction((url) => document.getElementById('campCoverImg').src === url, imageUrl('upload-6'));
      assert.equal(new URL(uploads.at(-1)).search, '', 'a new campaign upload has no existing campaign ID');
    },
    {
      '/campaign-upload': (request) => {
        assert.equal(request.method(), 'POST');
        assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
        assert.equal(request.headers()['content-type'], 'image/png');
        assert.deepEqual(request.postDataBuffer(), imageBytes);
        uploads.push(request.url());
        if (uploads.length <= 5) assert.equal(new URL(request.url()).searchParams.get('campaign'), existing.id);
        if (uploads.length === 1) return { status: 400, body: { error: 'Synthetic cover rejection' } };
        if (uploads.length === 4) return { status: 400, body: { error: 'Synthetic gallery rejection' } };
        return { body: { url: imageUrl(`upload-${uploads.length}`), key: `key-${uploads.length}` } };
      },
    }
  );

  const updates = [];
  await scenario(
    'posting updates validates text, preserves failed drafts, prepends history, and uses latest state',
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: campaignParish([existing, other]) };
      updates.push(patchBody(request));
      return updates.length === 1
        ? { status: 503, body: { error: 'Synthetic update unavailable' } }
        : { campaigns: updates.at(-1) };
    },
    async (page) => {
      await page.locator('.campaign-list-item').first().getByRole('button', { name: 'Edit', exact: true }).click();
      const post = page.getByRole('button', { name: 'Post Update', exact: true });
      await post.click();
      assert.equal(await page.locator('#updatePostStatus').textContent(), 'Write something first.');
      assert.equal(updates.length, 0);
      await page.locator('#updateBody').fill('  Work has started  ');
      await post.click();
      await page.locator('#updatePostStatus').filter({ hasText: 'Error: Synthetic update unavailable' }).waitFor();
      assert.equal(await page.locator('#updateBody').inputValue(), '  Work has started  ');
      await post.click();
      await page.locator('#updatePostStatus').filter({ hasText: '✓ Update posted' }).waitFor();
      assert.equal(await page.locator('#updateBody').inputValue(), '');
      assert.equal(updates[1][0].updates.length, 2, 'failed attempt must not add an update to local state');
      assert.equal(updates[1][0].updates[0].body, 'Work has started');
      assert.match(updates[1][0].updates[0].id, /^upd_[a-f0-9]{10}$/);
      assert.deepEqual(updates[1][0].updates[1], previousUpdate);
      assert.deepEqual(updates[1][1], other);
      await page.locator('#campDescription').fill('Description after the update');
      await page.locator('#saveCampaignBtn').click();
      await saved(page);
      assert.deepEqual(
        updates[2][0].updates,
        updates[1][0].updates,
        'a later edit must use the newly saved update history'
      );
    }
  );
} finally {
  await browser.close();
}
