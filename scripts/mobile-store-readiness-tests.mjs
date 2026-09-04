import assert from "node:assert/strict";
import fs from "node:fs";
import { readDonorAppSource } from './lib/donor-app-source.mjs';
import { readDonorHandlerSource } from './lib/donor-handler-source.mjs';
import { readLearnDashboardSource } from './lib/learn-dashboard-source.mjs';
import {
  androidAssetLinks,
  appleAppSiteAssociation,
} from '../src/handlers/mobile-app-associations.js';

const read = (path) => fs.readFileSync(path, "utf8");
const manifest = JSON.parse(read("public/myagapay/manifest.webmanifest"));
const worker = read("src/worker.js");
const mobileAssociationHandler = read("src/handlers/mobile-app-associations.js");
const donorHandler = readDonorHandlerSource();
const account = read("public/myagapay/account.html");
const donorApp = readDonorAppSource();
const learnShell = readLearnDashboardSource();
const deletionPage = read("public/account-deletion.html");
const androidManifest = JSON.parse(read("store/android/twa-manifest.json"));
const privacyManifest = read("store/ios/PrivacyInfo.xcprivacy");
const iosProject = read("store/ios/project.yml");

assert.equal(manifest.scope, "/myagapay/", "PWA scope must have an exact directory boundary");
assert.equal(manifest.orientation, "portrait-primary", "My AGAPAY must prefer portrait orientation");
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), "maskable icon is required");

assert.equal(androidManifest.packageId, "app.agapay.myagapay");
assert.equal(androidManifest.startUrl, "/myagapay/login?source=play-app");
assert.equal(androidManifest.fullScopeUrl, "https://agapay.app/myagapay/");
assert.match(worker, /\.well-known\/assetlinks\.json/);
assert.match(mobileAssociationHandler, /ANDROID_APP_SIGNING_SHA256/);
assert.match(worker, /\.well-known\/apple-app-site-association/);
assert.match(mobileAssociationHandler, /APPLE_DEVELOPER_TEAM_ID/);

const androidFingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':').toUpperCase();
const androidResponse = androidAssetLinks(new Request('https://agapay.app/.well-known/assetlinks.json'), {
  ANDROID_APP_PACKAGE_ID: 'app.agapay.test',
  ANDROID_APP_SIGNING_SHA256: `invalid, ${androidFingerprint.toLowerCase()}`,
});
assert.equal(androidResponse.status, 200);
assert.equal(androidResponse.headers.get('content-type'), 'application/json; charset=utf-8');
assert.equal(androidResponse.headers.get('cache-control'), 'public, max-age=3600');
assert.equal(androidResponse.headers.get('x-content-type-options'), 'nosniff');
assert.deepEqual(await androidResponse.json(), [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'app.agapay.test',
    sha256_cert_fingerprints: [androidFingerprint],
  },
}]);

const androidHead = androidAssetLinks(new Request('https://agapay.app/.well-known/assetlinks.json', { method: 'HEAD' }), {});
assert.equal(await androidHead.text(), '');
assert.deepEqual(await androidAssetLinks(new Request('https://agapay.app/.well-known/assetlinks.json'), {}).json(), []);

const appleResponse = appleAppSiteAssociation(new Request('https://agapay.app/.well-known/apple-app-site-association'), {
  APPLE_DEVELOPER_TEAM_ID: 'a1b2c3d4e5',
  APPLE_APP_BUNDLE_ID: 'app.agapay.test',
});
assert.deepEqual(await appleResponse.json(), {
  applinks: {
    details: [{
      appIDs: ['A1B2C3D4E5.app.agapay.test'],
      components: [
        { '/': '/myagapay/*', comment: 'Open My AGAPAY routes in the app.' },
        { '/': '/account-deletion', comment: 'Open account privacy controls in the app.' },
        { '/': '/learn/pricing*', exclude: true, comment: 'Keep Learn purchases on the public website.' },
      ],
    }],
  },
});
assert.deepEqual(
  await appleAppSiteAssociation(new Request('https://agapay.app/apple-app-site-association'), {}).json(),
  { applinks: { details: [] } },
);

assert.match(donorHandler, /handleDonorAccountDeletion/);
assert.match(donorHandler, /accountDeletionRequestedAt/);
assert.match(account, /id="delete-account"/);
assert.match(account, /requestDonorAccountDeletion/);
assert.match(donorApp, /\/api\/donor\/account-deletion/);
assert.match(deletionPage, /Sign in to request deletion/);

assert.match(account, /https:\/\/agapay\.app\/learn\/pricing\?source=myagapay-app/);
assert.match(account, /target="_blank"/);
assert.match(donorApp, /display-mode: standalone/);
assert.match(learnShell, /display-mode: standalone/);

assert.match(privacyManifest, /NSPrivacyTracking/);
assert.match(privacyManifest, /NSPrivacyCollectedDataTypes/);
assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER: app\.agapay\.myagapay/);
assert.ok(fs.existsSync("store/ios/Assets.xcassets/AppIcon.appiconset/appstore.png"), "iOS App Store icon is required");

console.log("mobile store readiness checks passed");
