# Apple App Store submission

## Native package

1. Create the Xcode iOS shell with bundle ID `app.agapay.myagapay`, display name `My AGAPAY`, and deployment target supported by the current App Store requirements.
2. Load `https://agapay.app/myagapay/login?source=ios-app` in `WKWebView`. Keep normal My AGAPAY navigation in the web view, but open Stripe, `learn/pricing`, and other purchase/authentication domains in the system browser.
3. Add `MyAGAPAY.entitlements.template` to the signed target after replacing it with the actual target entitlements file.
4. Add `PrivacyInfo.xcprivacy` to the application target’s Copy Bundle Resources phase and validate the generated privacy report in Xcode.
5. Add complete AppIcon and launch-screen assets. Use the existing 1024×1024 artwork as the source, but verify it has no alpha channel for App Store Connect.
6. Set Cloudflare secret `APPLE_DEVELOPER_TEAM_ID`, deploy, and validate the Apple App Site Association file before testing universal links.
7. Archive, validate, and upload with the current Xcode release on macOS. Windows cannot sign or produce an App Store archive.

## App Store Connect

- Privacy Policy URL: `https://agapay.app/privacy`
- User Privacy Choices URL: `https://agapay.app/account-deletion`
- Support URL: `https://agapay.app/contact`
- Complete App Privacy details for all data collected by AGAPAY and its service providers.
- Provide reviewer credentials, a parish-access explanation, and notes describing donations, physical bookstore purchases, account deletion, and the external Learn website.
- Explain the app-like utility: giving history and statements, parish directory, calendar, Koinonia communications/media, bookstore, notifications, and parent-managed Learn planning.
- Supply iPhone and iPad screenshots and test every supported size class.
- Confirm any required external-purchase-link entitlement or storefront eligibility before leaving a Learn purchase link in the submitted build. Otherwise, remove the direct purchase link from the iOS build while continuing to permit access for subscribers who purchased on the website.

Apple may reject a simple website wrapper under Guideline 4.2. The submitted shell should include native-quality navigation, external-link handling, offline/error presentation, push-notification integration, and universal links rather than behaving as an unrestricted browser.
