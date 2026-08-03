# My AGAPAY mobile-store release configuration

The stable application identifier for both stores is `app.agapay.myagapay`.

The web application remains the source of product functionality. Android should be packaged as a Trusted Web Activity. iOS should use a reviewed native `WKWebView` shell with external-navigation handling, universal links, and the privacy manifest in this folder. Do not commit Android keystores, Apple signing certificates, provisioning profiles, or store API keys.

## Credentials that stores issue

Set these only after the app records exist in Google Play Console and Apple Developer:

- Cloudflare secret `ANDROID_APP_SIGNING_SHA256`: the **Play App Signing** SHA-256 fingerprint. Multiple colon-delimited fingerprints may be comma-separated for local and production signing.
- Cloudflare secret `APPLE_DEVELOPER_TEAM_ID`: the 10-character Apple Developer Team ID.

After setting either value, deploy the Worker and verify:

- `https://agapay.app/.well-known/assetlinks.json`
- `https://agapay.app/.well-known/apple-app-site-association`

Learn purchase links intentionally open `https://agapay.app/learn/pricing` outside the installed app. Existing subscribers may still use Learn in My AGAPAY.

The final Android AAB and iOS archive must be built from their native projects with store-issued signing credentials. See the platform checklists in the subfolders.
