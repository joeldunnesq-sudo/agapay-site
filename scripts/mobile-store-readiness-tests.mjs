import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const manifest = JSON.parse(read("public/myagapay/manifest.webmanifest"));
const worker = read("src/worker.js");
const donorHandler = read("src/handlers/donor.js");
const account = read("public/myagapay/account.html");
const donorApp = read("public/donor/app.js");
const learnShell = read("public/learn/dashboard-shell.js");
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
assert.match(worker, /ANDROID_APP_SIGNING_SHA256/);
assert.match(worker, /\.well-known\/apple-app-site-association/);
assert.match(worker, /APPLE_DEVELOPER_TEAM_ID/);

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
