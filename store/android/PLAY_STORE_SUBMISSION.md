# Google Play submission

## Native package

1. Generate a Trusted Web Activity project from `https://agapay.app/myagapay/manifest.webmanifest` with Bubblewrap or PWABuilder.
2. Use package/application ID `app.agapay.myagapay`.
3. Use launch URL `https://agapay.app/myagapay/login?source=play-app` and scope `https://agapay.app/myagapay/`.
4. Target Android 16 / API 36 or newer and produce a signed Android App Bundle (`.aab`).
5. Enable Play App Signing. Never commit the upload keystore.
6. Copy the Play App Signing SHA-256 fingerprint from Play Console > Setup > App integrity into the Cloudflare secret `ANDROID_APP_SIGNING_SHA256`, deploy, and verify Digital Asset Links before production rollout.

## Play Console

- Privacy policy: `https://agapay.app/privacy`
- Account deletion URL: `https://agapay.app/account-deletion`
- Support URL: `https://agapay.app/contact`
- Declare no ads unless advertising is added.
- Complete Data Safety for identity, contact, financial/transaction, photos, user content, app activity, directory/household, and child education data as applicable.
- Complete the Financial Features declaration. Tax-exempt donations and physical bookstore goods use external payment processing.
- Provide working reviewer credentials and explain parish-gated content in Review access.
- Set the target audience to adults; My AGAPAY accounts are not for children.
- Upload phone and tablet screenshots separately; web-manifest screenshots do not populate the Play listing.
- Test verified TWA launch, sign-in, Stripe donation/physical-goods handoff, external Learn purchase handoff, notifications, offline/error handling, and account deletion on a Play-delivered internal-test build.

Learn is a digital subscription. Before review, confirm eligibility and enroll in any Google Play external-content-link program required for the countries where the app is distributed. If not enrolled, ship a store-specific build without a direct purchase link.
