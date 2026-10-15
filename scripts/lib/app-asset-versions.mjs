import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

// Shared My AGAPAY assets. Add extracted shared scripts here with their page
// references so one content version is used by every consumer.
// Admin keeps its network-only service-worker policy while using content versions.
export const pageAssets = Object.freeze([
  '/parish/features/campaigns.js',
  '/parish/features/accounting.js',
  '/parish/features/accounting/report-loaders.js',
  '/parish/features/accounting/report-documents.js',
  '/parish/features/accounting/funds.js',
  '/parish/features/accounting/activation.js',
  '/parish/features/accounting/close.js',
  '/parish/features/accounting/migration.js',
  '/parish/features/commerce/bookstore-catalog.js',
  '/parish/features/commerce/bookstore-counts.js',
  '/parish/features/commerce/bookstore-inventory.js',
  '/parish/features/commerce/bookstore-sales.js',
  '/parish/features/commerce/offerings.js',
  '/parish/features/koinonia.js',
  '/parish/features/koinonia/prayers.js',
  '/parish/features/koinonia/announcements.js',
  '/parish/features/stewardship.js',
  '/parish/features/stewardship/metrics.js',
  '/parish/features/stewardship/financials.js',
  '/parish/features/stewardship/meetings.js',
  '/parish/features/koinonia/media.js',
  '/parish/features/koinonia/ministries.js',
  '/parish/features/sacraments/preparation.js',
  '/parish/recovery.js',
  '/parish/directory-import.js',
  '/parish/feature-registry.js',
  '/parish/diagnostics.js',
  '/parish/mfa-settings.js',
  '/parish/staff-login.js',
  '/parish/features/giving.js',
  '/parish/features/library.js',
  '/parish/features/stewardship/fees.js',
  '/parish/features/campaigns/website-embed.js',
  '/parish/dashboard-runtime.js',
  '/parish/features/commerce.js',
  '/registration-assistance.js',
  '/parish/features/staff-access.js',
  '/parish/features/stewardship/nudges.js',
  '/parish/features/stewardship/reports.js',
  '/parish/features/stewardship/financials-editor.js',
  '/parish/features/stewardship/outside-giving.js',
  '/parish/backup.js',
  '/parish/portability.js',
  '/parish/library.js',
  '/parish/features/commerce/bookstore-checkout.js',
  '/admin/relationships.js',
  '/site-chrome.js',
  '/give/parish-giving/embed.js',
  '/marketing-funnel.js',
  '/meta-pixel.js',
  '/home-giving-impact.js',
  '/pwa-register.js',
  '/admin/pwa.js',
  '/donor/pwa-install.js',
  '/security.js',
  '/learn/mobile-gate.js',
  '/pwa-home-install.js',
  '/koinonia-preview.js',
  '/liturgical-calendar.js',
  '/parish/features/giving/outside-gifts.js',
  '/parish/features/giving/options.js',
  '/parish/features/giving/feasts.js',
  '/parish/features/giving/reconciliation.js',
  '/parish/features/giving/reconciliation-reports.js',
  '/parish/features/giving/transfers.js',
  '/parish/features/giving/embed-theme.js',
  '/parish/features/giving/sharing.js',
  '/parish/features/giving/statements.js',
  '/parish/features/giving/givers.js',
  '/parish/features/giving/commemorations.js',
  '/parish/features/giving/history.js',
  '/parish/features/giving/weekly-funds.js',
  '/parish/features/giving/insights.js',
  '/parish/features/giving/overview.js',
  '/parish/features/giving/recurring.js',
  '/admin/presentation.js',
  '/admin/navigation.js',
  '/admin/metrics.js',
  '/admin/controllers/contact-leads.js',
]);

export const appAssets = Object.freeze([
  '/learn/legacy-planner.js',
  '/donor/app.js',
  '/donor/style.css',
  '/myagapay-shell.js',
  '/donor/session.js',
  '/scripts/consumer-passkeys.js',
  '/donor/controllers/calendar.js',
  '/donor/controllers/history.js',
  '/donor/controllers/sacraments.js',
  '/donor/bookstore-presentation.js',
  '/donor/controllers/bookstore.js',
  '/donor/bookstore-experience.js',
  '/donor/bookstore-experience.css',
  '/myagapay/news.js',
  '/myagapay/feed.js',
  '/myagapay/signups.js',
  '/myagapay/prayer-requests.js',
  '/myagapay/media.js',
  '/myagapay/watch.js',
  '/myagapay/library.js',
  '/myagapay/push-notifications.js',
  '/myagapay/parish-life.js',
  '/myagapay/koinonia-experience.js',
  '/myagapay/koinonia-experience.css',
  '/myagapay/koinonia-subpages.css',
  '/myagapay/church-year.js',
  '/myagapay/liturgical-hero.css',
  '/myagapay/library.css',
  '/myagapay/app-header.css',
  '/myagapay/app-header.js',
  '/myagapay/groups.js',
  '/myagapay/ministry-home.js',
  '/myagapay/ministry-home.css',
]);

export function contentVersion(source) {
  // Git checkouts use CRLF on Windows and LF in CI; both must name the same asset.
  return createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex').slice(0, 16);
}

export function appAssetUrl(asset, root = repoRoot) {
  if (![...appAssets, ...pageAssets].includes(asset)) throw new Error(`Unknown versioned app asset: ${asset}`);
  return `${asset}?v=${contentVersion(readFileSync(path.join(root, 'public', asset.slice(1)), 'utf8'))}`;
}

export function versionAppAssetReferences(html, urls) {
  return html.replace(/\b(src|href)=(['"])([^'"]+)\2/g, (attribute, name, quote, value) => {
    const [pathname] = value.split(/[?#]/);
    if (!urls.has(pathname)) return attribute;
    const url = new URL(value, 'https://agapay.invalid');
    url.searchParams.set('v', new URL(urls.get(pathname), url.origin).searchParams.get('v'));
    return `${name}=${quote}${url.pathname}${url.search}${url.hash}${quote}`;
  });
}
