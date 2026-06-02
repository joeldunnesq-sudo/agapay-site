# AGAPAY Donor PWA Testing

AGAPAY includes a donor-facing Progressive Web App shell so donors can add a home-screen shortcut that opens the donor login at `/donor/login?source=pwa`.

## Manifest validity

1. Open `https://agapay.app/donor/login`.
2. In Chrome DevTools, open **Application -> Manifest**.
3. Confirm:
   - `name` and `short_name` are `AGAPAY`.
   - `start_url` is `/donor/login?source=pwa`.
   - `display` is `standalone`.
   - Icons load from `/favicons/apple-touch-icon.png`, `/favicons/android-chrome-192x192.png`, and `/favicons/android-chrome-512x512.png`.

## Android / Chrome install prompt

1. Open `https://agapay.app/donor/login` in Chrome for Android.
2. Wait for the browser to fire `beforeinstallprompt`.
3. Confirm the AGAPAY install card appears.
4. Tap **Install AGAPAY**.
5. Confirm Chrome shows its native install prompt.

Browsers do not allow websites to install shortcuts silently. The native prompt appears only after the donor taps the install button.

## iPhone / Safari Add to Home Screen

1. Open `https://agapay.app/donor/login` in Safari on iPhone.
2. Confirm the AGAPAY install card explains: "Tap Share, then Add to Home Screen."
3. Tap Safari's **Share** button.
4. Choose **Add to Home Screen**.
5. Confirm the icon uses the AGAPAY favicon/logo asset.

iOS Safari does not support the Android-style install prompt, so this remains a manual donor action.

## Shortcut routing

1. Install the PWA/home-screen shortcut.
2. Open it from the home screen.
3. Confirm it launches `/donor/login?source=pwa`.
4. If no donor session is present, confirm it stays on donor login.
5. If a valid donor session is present, confirm it verifies `/api/donor/dashboard` and redirects to `/donor/dashboard`.

## Privacy checks

1. In DevTools, inspect **Application -> Cache Storage**.
2. Confirm only login shell/static assets are cached.
3. Confirm `/api/*`, donor dashboard pages, and authenticated responses are not cached.
