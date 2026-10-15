import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';
import { transform } from 'esbuild';
import { format } from 'prettier';
import { repoRoot } from './server-typescript.mjs';

// Classic scripts retain lexical globals; explicitly marked native modules retain ESM.
// Neither delivery mode bundles, wraps, or renames runtime bindings.
export const browserTypeScriptEntries = Object.freeze([
  { source: 'src/browser/attribution.ts', output: 'public/attribution.js', module: true, delivery: 'native-module' },
  {
    source: 'src/browser/attribution-core.ts',
    output: 'public/attribution-core.js',
    module: true,
    delivery: 'native-module',
  },
  { source: 'src/browser/listen/db.ts', output: 'public/listen/db.js', module: true, delivery: 'native-module' },
  { source: 'src/browser/listen/opml.ts', output: 'public/listen/opml.js', module: true, delivery: 'native-module' },
  {
    source: 'src/browser/listen/player.ts',
    output: 'public/listen/player.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/learn/sanitized-render.ts',
    output: 'public/learn/sanitized-render.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/parish/directory-import-format.ts',
    output: 'public/parish/directory-import-format.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/parish/accounting-report-pdf.ts',
    output: 'public/parish/accounting-report-pdf.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/parish/directory-import-file-worker.ts',
    output: 'public/parish/directory-import-file-worker.js',
    delivery: 'worker',
  },
  {
    source: 'src/browser/listen/service-worker.ts',
    output: 'public/listen/service-worker.js',
    delivery: 'unreferenced-worker',
  },
  { source: 'src/browser/service-worker.ts', output: 'public/service-worker.js', delivery: 'worker' },
  { source: 'src/browser/site-mobile-nav.ts', output: 'public/site-mobile-nav.js', delivery: 'unreferenced-classic' },
  { source: 'src/browser/events/app.ts', output: 'public/events/app.js' },
  { source: 'src/browser/myagapay/events.ts', output: 'public/myagapay/events.js' },
  { source: 'src/browser/scripts/consumer-passkeys.ts', output: 'public/scripts/consumer-passkeys.js' },
  { source: 'src/browser/scripts/privileged-mfa.ts', output: 'public/scripts/privileged-mfa.js' },
  { source: 'src/browser/bookstore/app.ts', output: 'public/bookstore/app.js' },
  { source: 'src/browser/give/parish-giving/app.ts', output: 'public/give/parish-giving/app.js' },
  { source: 'src/browser/parish/features/campaigns.ts', output: 'public/parish/features/campaigns.js' },
  {
    source: 'src/browser/parish/features/sacraments/preparation.ts',
    output: 'public/parish/features/sacraments/preparation.js',
  },
  { source: 'src/browser/parish/recovery.ts', output: 'public/parish/recovery.js' },
  { source: 'src/browser/parish/directory-import.ts', output: 'public/parish/directory-import.js' },
  { source: 'src/browser/parish/features/koinonia/media.ts', output: 'public/parish/features/koinonia/media.js' },
  {
    source: 'src/browser/parish/features/koinonia/ministries.ts',
    output: 'public/parish/features/koinonia/ministries.js',
  },
  { source: 'src/browser/parish/features/stewardship.ts', output: 'public/parish/features/stewardship.js' },
  {
    source: 'src/browser/parish/features/stewardship/metrics.ts',
    output: 'public/parish/features/stewardship/metrics.js',
  },
  {
    source: 'src/browser/parish/features/stewardship/financials.ts',
    output: 'public/parish/features/stewardship/financials.js',
  },
  {
    source: 'src/browser/parish/features/stewardship/meetings.ts',
    output: 'public/parish/features/stewardship/meetings.js',
  },
  { source: 'src/browser/parish/features/koinonia.ts', output: 'public/parish/features/koinonia.js' },
  { source: 'src/browser/parish/features/koinonia/prayers.ts', output: 'public/parish/features/koinonia/prayers.js' },
  {
    source: 'src/browser/parish/features/koinonia/announcements.ts',
    output: 'public/parish/features/koinonia/announcements.js',
  },
  {
    source: 'src/browser/parish/features/commerce/bookstore-catalog.ts',
    output: 'public/parish/features/commerce/bookstore-catalog.js',
  },
  {
    source: 'src/browser/parish/features/commerce/bookstore-counts.ts',
    output: 'public/parish/features/commerce/bookstore-counts.js',
  },
  {
    source: 'src/browser/parish/features/commerce/bookstore-inventory.ts',
    output: 'public/parish/features/commerce/bookstore-inventory.js',
  },
  {
    source: 'src/browser/parish/features/commerce/bookstore-sales.ts',
    output: 'public/parish/features/commerce/bookstore-sales.js',
  },
  {
    source: 'src/browser/parish/features/commerce/offerings.ts',
    output: 'public/parish/features/commerce/offerings.js',
  },
  {
    source: 'src/browser/parish/features/accounting/activation.ts',
    output: 'public/parish/features/accounting/activation.js',
  },
  { source: 'src/browser/parish/features/accounting/close.ts', output: 'public/parish/features/accounting/close.js' },
  {
    source: 'src/browser/parish/features/accounting/migration.ts',
    output: 'public/parish/features/accounting/migration.js',
  },
  { source: 'src/browser/parish/features/accounting/funds.ts', output: 'public/parish/features/accounting/funds.js' },
  { source: 'src/browser/parish/features/accounting.ts', output: 'public/parish/features/accounting.js' },
  {
    source: 'src/browser/parish/features/accounting/report-loaders.ts',
    output: 'public/parish/features/accounting/report-loaders.js',
  },
  {
    source: 'src/browser/parish/features/accounting/report-documents.ts',
    output: 'public/parish/features/accounting/report-documents.js',
  },
  { source: 'src/browser/giving-box.ts', output: 'public/giving-box.js', externalEmbed: true },
  { source: 'src/browser/admin/relationships.ts', output: 'public/admin/relationships.js' },
  { source: 'src/browser/site-chrome.ts', output: 'public/site-chrome.js' },
  { source: 'src/browser/donor/bookstore-experience.ts', output: 'public/donor/bookstore-experience.js' },
  { source: 'src/browser/give/parish-giving/embed.ts', output: 'public/give/parish-giving/embed.js' },
  { source: 'src/browser/parish/backup.ts', output: 'public/parish/backup.js' },
  { source: 'src/browser/parish/portability.ts', output: 'public/parish/portability.js' },
  { source: 'src/browser/parish/library.ts', output: 'public/parish/library.js' },
  {
    source: 'src/browser/parish/features/commerce/bookstore-checkout.ts',
    output: 'public/parish/features/commerce/bookstore-checkout.js',
  },
  {
    source: 'src/browser/parish/features/stewardship/financials-editor.ts',
    output: 'public/parish/features/stewardship/financials-editor.js',
  },
  {
    source: 'src/browser/parish/features/stewardship/outside-giving.ts',
    output: 'public/parish/features/stewardship/outside-giving.js',
  },
  { source: 'src/browser/parish/features/staff-access.ts', output: 'public/parish/features/staff-access.js' },
  {
    source: 'src/browser/parish/features/stewardship/nudges.ts',
    output: 'public/parish/features/stewardship/nudges.js',
  },
  {
    source: 'src/browser/parish/features/stewardship/reports.ts',
    output: 'public/parish/features/stewardship/reports.js',
  },
  { source: 'src/browser/parish/dashboard-runtime.ts', output: 'public/parish/dashboard-runtime.js' },
  { source: 'src/browser/parish/features/commerce.ts', output: 'public/parish/features/commerce.js' },
  { source: 'src/browser/registration-assistance.ts', output: 'public/registration-assistance.js' },
  { source: 'src/browser/parish/features/giving.ts', output: 'public/parish/features/giving.js' },
  { source: 'src/browser/parish/features/library.ts', output: 'public/parish/features/library.js' },
  { source: 'src/browser/parish/features/stewardship/fees.ts', output: 'public/parish/features/stewardship/fees.js' },
  {
    source: 'src/browser/parish/features/campaigns/website-embed.ts',
    output: 'public/parish/features/campaigns/website-embed.js',
  },
  { source: 'src/browser/parish/feature-registry.ts', output: 'public/parish/feature-registry.js' },
  { source: 'src/browser/parish/diagnostics.ts', output: 'public/parish/diagnostics.js' },
  { source: 'src/browser/parish/mfa-settings.ts', output: 'public/parish/mfa-settings.js' },
  { source: 'src/browser/parish/staff-login.ts', output: 'public/parish/staff-login.js' },
  { source: 'src/browser/marketing-funnel.ts', output: 'public/marketing-funnel.js' },
  { source: 'src/browser/meta-pixel.ts', output: 'public/meta-pixel.js' },
  { source: 'src/browser/home-giving-impact.ts', output: 'public/home-giving-impact.js' },
  { source: 'src/browser/pwa-register.ts', output: 'public/pwa-register.js' },
  { source: 'src/browser/admin/pwa.ts', output: 'public/admin/pwa.js' },
  { source: 'src/browser/donor/pwa-install.ts', output: 'public/donor/pwa-install.js' },
  { source: 'src/browser/donor/session.ts', output: 'public/donor/session.js' },
  { source: 'src/browser/security.ts', output: 'public/security.js' },
  { source: 'src/browser/learn/mobile-gate.ts', output: 'public/learn/mobile-gate.js' },
  { source: 'src/browser/pwa-home-install.ts', output: 'public/pwa-home-install.js' },
  { source: 'src/browser/koinonia-preview.ts', output: 'public/koinonia-preview.js' },
  { source: 'src/browser/campaign-box.ts', output: 'public/campaign-box.js', externalEmbed: true },
  { source: 'src/browser/learn/legacy-planner.ts', output: 'public/learn/legacy-planner.js' },
  { source: 'src/browser/myagapay/signups.ts', output: 'public/myagapay/signups.js' },
  { source: 'src/browser/myagapay/app-header.ts', output: 'public/myagapay/app-header.js' },
  { source: 'src/browser/myagapay/prayer-requests.ts', output: 'public/myagapay/prayer-requests.js' },
  { source: 'src/browser/myagapay/feed.ts', output: 'public/myagapay/feed.js' },
  { source: 'src/browser/myagapay/media.ts', output: 'public/myagapay/media.js' },
  { source: 'src/browser/myagapay/watch.ts', output: 'public/myagapay/watch.js' },
  { source: 'src/browser/myagapay/church-year.ts', output: 'public/myagapay/church-year.js' },
  { source: 'src/browser/myagapay/push-notifications.ts', output: 'public/myagapay/push-notifications.js' },
  { source: 'src/browser/myagapay/koinonia-experience.ts', output: 'public/myagapay/koinonia-experience.js' },
  { source: 'src/browser/myagapay/ministry-home.ts', output: 'public/myagapay/ministry-home.js' },
  { source: 'src/browser/myagapay/library.ts', output: 'public/myagapay/library.js' },
  { source: 'src/browser/myagapay/news.ts', output: 'public/myagapay/news.js' },
  { source: 'src/browser/liturgical-calendar.ts', output: 'public/liturgical-calendar.js' },
  {
    source: 'src/browser/parish/features/giving/outside-gifts.ts',
    output: 'public/parish/features/giving/outside-gifts.js',
  },
  { source: 'src/browser/parish/features/giving/options.ts', output: 'public/parish/features/giving/options.js' },
  { source: 'src/browser/parish/features/giving/feasts.ts', output: 'public/parish/features/giving/feasts.js' },
  {
    source: 'src/browser/parish/features/giving/reconciliation.ts',
    output: 'public/parish/features/giving/reconciliation.js',
  },
  {
    source: 'src/browser/parish/features/giving/reconciliation-reports.ts',
    output: 'public/parish/features/giving/reconciliation-reports.js',
  },
  { source: 'src/browser/parish/features/giving/transfers.ts', output: 'public/parish/features/giving/transfers.js' },
  {
    source: 'src/browser/parish/features/giving/embed-theme.ts',
    output: 'public/parish/features/giving/embed-theme.js',
  },
  { source: 'src/browser/parish/features/giving/sharing.ts', output: 'public/parish/features/giving/sharing.js' },
  { source: 'src/browser/parish/features/giving/statements.ts', output: 'public/parish/features/giving/statements.js' },
  { source: 'src/browser/parish/features/giving/givers.ts', output: 'public/parish/features/giving/givers.js' },
  {
    source: 'src/browser/parish/features/giving/commemorations.ts',
    output: 'public/parish/features/giving/commemorations.js',
  },
  { source: 'src/browser/parish/features/giving/history.ts', output: 'public/parish/features/giving/history.js' },
  {
    source: 'src/browser/parish/features/giving/weekly-funds.ts',
    output: 'public/parish/features/giving/weekly-funds.js',
  },
  { source: 'src/browser/parish/features/giving/insights.ts', output: 'public/parish/features/giving/insights.js' },
  { source: 'src/browser/parish/features/giving/overview.ts', output: 'public/parish/features/giving/overview.js' },
  { source: 'src/browser/parish/features/giving/recurring.ts', output: 'public/parish/features/giving/recurring.js' },
  { source: 'src/browser/admin/controllers/contact-leads.ts', output: 'public/admin/controllers/contact-leads.js' },
  { source: 'src/browser/admin/navigation.ts', output: 'public/admin/navigation.js' },
  { source: 'src/browser/admin/metrics.ts', output: 'public/admin/metrics.js' },
  { source: 'src/browser/admin/presentation.ts', output: 'public/admin/presentation.js' },
  { source: 'src/browser/donor/bookstore-presentation.ts', output: 'public/donor/bookstore-presentation.js' },
]);

export async function synchronizeBrowserTypeScript({ check = true, root = repoRoot } = {}) {
  const prettier = JSON.parse(await readFile(resolve(root, '.prettierrc.json'), 'utf8'));
  const stale = [];
  for (const { source, output, module: nativeModule } of browserTypeScriptEntries) {
    const { code } = await transform(await readFile(resolve(root, source), 'utf8'), {
      loader: 'ts',
      ...(nativeModule ? { format: 'esm' } : {}),
      target: 'es2022',
      charset: 'utf8',
      legalComments: 'none',
    });
    // Fail before writing if a runtime import/export would turn a classic script into a module.
    if (!nativeModule) new Script(code, { filename: output });
    const generated = await format(`// Generated from ${source} by npm run build:browser. Do not edit.\n${code}`, {
      ...prettier,
      parser: 'babel',
      endOfLine: 'lf',
    });
    if (check) {
      let existing;
      try {
        existing = await readFile(resolve(root, output), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (existing?.replaceAll('\r\n', '\n') !== generated) stale.push(output);
    } else {
      await mkdir(dirname(resolve(root, output)), { recursive: true });
      await writeFile(resolve(root, output), generated);
    }
  }
  if (stale.length) {
    throw new Error(
      `Stale or missing browser TypeScript output: ${stale.join(', ')}. Run npm run build:browser and npm run assets:version, and include the generated files.`
    );
  }
}
