import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';
const browser = await chromium.launch({headless:true});
let verified = 0;
const fixture = await openParishFixture(browser, undefined, {
  '/api/mfa/parish-authenticator': {body:{mfaRequired:true,enrollmentRequired:true,methods:['totp'],pendingToken:'synthetic-pending'}},
  '/api/mfa/enrollment/options': request => {
    assert.equal(request.postDataJSON().method, 'totp');
    return {body:{secret:'JBSWY3DPEHPK3PXP',otpauthUri:'otpauth://totp/AGAPAY?secret=JBSWY3DPEHPK3PXP'}};
  },
  '/api/mfa/enrollment/verify': request => {
    assert.equal(request.postDataJSON().code,'123456'); verified++;
    return {body:{ok:true}};
  },
});
try {
  await fixture.open();
  await fixture.page.locator('#nav-settings').click();
  const button = fixture.page.getByRole('button',{name:'Add authenticator app',exact:true});
  await button.click();
  await fixture.page.locator('#agapayMfaCode').waitFor();
  assert.equal(await fixture.page.locator('.agapay-mfa-secret strong').textContent(),'JBSWY3DPEHPK3PXP');
  assert.equal(await fixture.page.locator('[data-mfa-action="passkey"]').count(),0);
  await fixture.page.getByRole('button',{name:'Cancel setup',exact:true}).click();
  await fixture.page.waitForFunction(()=>!document.getElementById('agapayMfaDialog').open);
  assert.equal(verified,0);
  await button.click();
  await fixture.page.locator('#agapayMfaCode').fill('123456');
  await fixture.page.getByRole('button',{name:'Verify and continue',exact:true}).click();
  await fixture.page.waitForFunction(()=>document.getElementById('parishAuthenticatorStatus').textContent.includes('Authenticator added'));
  assert.equal(verified,1);
  assert.equal(await button.isEnabled(),true);
  fixture.assertClean();
  console.log('PASS - Settings authenticator enrollment, cancellation, retry, and completion');
} finally { await fixture.close(); await browser.close(); }
