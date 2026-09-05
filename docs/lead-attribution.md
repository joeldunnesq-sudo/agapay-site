# Lead attribution

## Architecture and storage

Before this change, marketing-funnel.js copied selected URL parameters into links.
The demo and registration pages appended those values to message/notes text.
There was no first-touch storage, normalized source, referrer capture, or contact
database record: /api/contact only sent an email. Registration records already
used the registrations table's JSON data (with the existing KV fallback).

Contact and demo submissions save lead JSON in D1 `contact_leads.data` before
notification delivery. Migration 0124 imports existing D1 `contact:*` settings
with unknown historical delivery status. Contact submission now requires D1;
registration records continue using their existing storage. See
[contact recovery and security operations](operations/contact-and-security-hardening.md)
for deployment requirements, delivery status, idempotency, and admin recovery.

## Lifecycle

1. Public site chrome and the marketing funnel eagerly load `/attribution.js`.
   Authenticated dashboard chrome is excluded. The module captures the five UTM
   fields, sanitized referrer, landing URL, and ISO timestamp.
2. `agapay.attribution.first.v1` in first-party localStorage preserves the first
   touch for 90 days from capture (not extended by later visits).
3. `agapay.attribution.visit.v1` retains the current visit source through internal
   navigation. A direct or external arrival, changed explicit campaign, or an
   internal navigation after 30 minutes of inactivity starts a new last touch.
   Identical campaign tags copied onto internal links preserve the visit source.
4. Contact, demo and registration forms synchronously read the in-memory utility.
   First-touch remains unchanged. Last-touch receives the conversion URL, browser
   submission timestamp, immediate referring URL, and `currentUtms`. Its source,
   medium, campaign, content and term describe the current visit, even when the
   conversion page itself has no UTM parameters. `currentUtms` distinguishes those
   carried values from tags actually present at conversion.
5. The server independently bounds and sanitizes each accepted field, recomputes
   source categories, and assigns a server submission timestamp to last-touch.
   Invalid/missing attribution is omitted or null, without rejecting the form.
6. The same sanitized record is saved with the lead and rendered as separate
   first-touch and last-touch email sections. HTML is escaped; empty fields are
   omitted. Email dates explicitly use America/Chicago. Existing contact and
   registration recipients remain, with onboarding@agapay.app added and duplicates
   removed within each recipient list.

Each touch has `source`, `medium`, `campaign`, `content`, `term`, `category`,
`rawReferrer`, `referringUrl`, `page`, `timestamp`, and `currentUtms`.
`firstTouch.page` is the landing URL; `lastTouch.page` is the conversion URL.
The outer record has `version: 1`, `firstTouch`, and `lastTouch`.
For reporting, D1 can extract fields from the existing JSON, for example:

```sql
SELECT json_extract(data, '$.attribution.firstTouch.category') AS first_source,
       json_extract(data, '$.attribution.lastTouch.category') AS last_source,
       COUNT(*) AS leads
FROM contact_leads
GROUP BY first_source, last_source;
```

## Privacy and limitations

- No visitor ID, cookie, fingerprint, IP, or user-agent is added by attribution.
- `rawReferrer` means the original referrer host/path rather than a source label.
  All stored URLs exclude queries, fragments and credentials. UTM fields are
  separately allowlisted and bounded; avoid putting personal data in campaigns.
- Browser referrer policies may hide or shorten referrers. A hidden referrer with
  no UTMs is Direct; the server cannot reconstruct unavailable visit history.
- Clearing storage, another device/browser, or expiry starts a new first touch.
  Storage denial falls back to page memory, so cross-page/return attribution may
  be unavailable. If the module is blocked or still loading, forms submit without
  attribution and without waiting for it to download.
- Visits are based on page navigation, not fingerprinting or an identity/session
  service. New direct arrivals reset last-touch even within 30 minutes. Reloads
  inherit what the browser reports as referrer. Tabs share first-party storage.
- An unknown Orthodox website is grouped as Referral, with its domain retained
  as source for more specific reporting. Paid Google/Bing traffic is Other rather
  than incorrectly labeled Organic; source and medium remain available.
- Existing records are not backfilled. Client timestamps/source evidence are
  untrusted marketing signals; they are not authentication or billing evidence.
- Lead persistence is required before email sending. A database outage produces
  a form error. Email failure leaves a saved lead visible in the admin inbox.
  Contact and demo forms reuse a submission key for retries in the same page;
  reloading the page starts a new key. Provider retries use a frozen payload and
  a stable idempotency key, with manual review required after the safe retry window.

## Verification and deployment

```powershell
node scripts/lead-attribution-tests.mjs
node scripts/lead-attribution-browser-tests.mjs
node scripts/meta-referral-tracking-tests.mjs
node scripts/registration-security-tests.mjs
```

The browser test uses the project's existing Playwright Chromium installation and
routes all traffic locally. It never sends a real contact message or email.
The unit/integration suite is included in the standard core test manifest.

Deploy through the existing `.github/workflows/deploy.yml` production workflow
after review and its quality/test gates. The notification recovery migration and
Durable Object rate limiter binding must deploy with the Worker and public assets;
the production workflow applies the D1 migration before publishing the Worker.
