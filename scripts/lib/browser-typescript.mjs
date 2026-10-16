import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';
import { transform, transformSync, buildSync } from 'esbuild';
import { format } from 'prettier';
import { repoRoot } from './server-typescript.mjs';

// Classic scripts retain lexical globals; explicitly marked native modules retain ESM.
// Existing entries retain their bindings. Private support sources can opt into one isolated response.
export const browserTypeScriptEntries = Object.freeze([
  {
    source: 'src/browser/admin/app-accounting-and-audit.ts',
    output: 'public/admin/app-accounting-and-audit.js',
    declarationsOnly: true,
  },
  {
    source: 'src/browser/admin/app.ts',
    output: 'public/admin/app.js',
    classicSupportSources: [
      'src/browser/admin/app-session-and-platform.ts',
      'src/browser/admin/app-learn-and-support.ts',
      'src/browser/admin/app-parish-tools-and-diagnostics.ts',
      'src/browser/admin/app-registration-queue.ts',
      'src/browser/admin/app-registration-details.ts',
      'src/browser/admin/app-onboarding-and-review.ts',
      'src/browser/admin/app-subscription-and-navigation.ts',
      'src/browser/admin/app-bulk-and-history.ts',
    ],
    runtimeSupportSources: ['src/browser/admin/app-accounting-and-audit.ts'],
  },
  {
    source: 'src/browser/parish/app-subscriptions-and-settlement.ts',
    output: 'public/parish/app-subscriptions-and-settlement.js',
    declarationsOnly: true,
  },
  {
    source: 'src/browser/parish/app.ts',
    output: 'public/parish/app.js',
    classicSupportSources: [
      'src/browser/parish/app-session-and-navigation.ts',
      'src/browser/parish/app-tax-exemption.ts',
      'src/browser/parish/app-settings-and-nonprofit.ts',
    ],
    runtimeSupportSources: ['src/browser/parish/app-subscriptions-and-settlement.ts'],
  },
  {
    source: 'src/browser/donor/app.ts',
    output: 'public/donor/app.js',
    classicSupportSources: [
      'src/browser/donor/app-session-and-parish.ts',
      'src/browser/donor/app-giving-and-login.ts',
      'src/browser/donor/app-account-and-dashboard.ts',
      'src/browser/donor/app-commemorations-and-checkout.ts',
    ],
  },
  {
    source: 'src/browser/myagapay/teaching-presentation.ts',
    output: 'public/myagapay/teaching-presentation.js',
    declarationsOnly: true,
  },
  {
    source: 'src/browser/myagapay/teaching.ts',
    output: 'public/myagapay/teaching.js',
    runtimeSupportSources: ['src/browser/myagapay/teaching-presentation.ts'],
  },
  {
    source: 'src/browser/myagapay/groups-presentation.ts',
    output: 'public/myagapay/groups-presentation.js',
    declarationsOnly: true,
  },
  {
    source: 'src/browser/myagapay/groups.ts',
    output: 'public/myagapay/groups.js',
    runtimeSupportSources: ['src/browser/myagapay/groups-presentation.ts'],
  },
  {
    source: 'src/browser/parish/features/sacraments.ts',
    output: 'public/parish/features/sacraments.js',
    classicSupportSources: ['src/browser/parish/sacrament-feature-presentation.ts'],
  },
  {
    source: 'src/browser/parish/features/directory.ts',
    output: 'public/parish/features/directory.js',
    classicSupportSources: ['src/browser/parish/directory-feature-presentation.ts'],
  },
  {
    source: 'src/browser/listen/app-panels.ts',
    output: 'public/listen/app-panels.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/listen/app-catalog.ts',
    output: 'public/listen/app-catalog.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/listen/app-presentation.ts',
    output: 'public/listen/app-presentation.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/listen/app-events.ts',
    output: 'public/listen/app-events.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/listen/app.ts',
    output: 'public/listen/app.js',
    module: true,
    runtimeSupportSources: [
      'src/browser/listen/app-catalog.ts',
      'src/browser/listen/app-presentation.ts',
      'src/browser/listen/app-events.ts',
      'src/browser/listen/app-panels.ts',
    ],
  },
  {
    source: 'src/browser/learn/dashboard-view-models-shared.ts',
    output: 'public/learn/dashboard-view-models-shared.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/learn/view-model-dashboard-planner.ts',
    output: 'public/learn/view-model-dashboard-planner.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/learn/view-model-academic.ts',
    output: 'public/learn/view-model-academic.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/learn/view-model-setup-print.ts',
    output: 'public/learn/view-model-setup-print.js',
    module: true,
    delivery: 'native-module',
  },
  {
    source: 'src/browser/learn/dashboard-view-models.ts',
    output: 'public/learn/dashboard-view-models.js',
    module: true,
    delivery: 'native-module',
    runtimeSupportSources: [
      'src/browser/learn/dashboard-view-models-shared.ts',
      'src/browser/learn/view-model-dashboard-planner.ts',
      'src/browser/learn/view-model-academic.ts',
      'src/browser/learn/view-model-setup-print.ts',
    ],
  },
  {
    source: 'src/browser/donor/controllers/sacraments.ts',
    output: 'public/donor/controllers/sacraments.js',
    classicSupportSources: ['src/browser/donor/sacrament-presentation.ts'],
  },
  {
    source: 'src/browser/myagapay-shell.ts',
    output: 'public/myagapay-shell.js',
    supportSources: ['src/browser/myagapay/shell-icons.ts', 'src/browser/myagapay/shell-products.ts'],
  },
  {
    source: 'src/browser/parish/features/accounting/payables.ts',
    output: 'public/parish/features/accounting/payables.js',
  },
  { source: 'src/browser/myagapay/parish-life.ts', output: 'public/myagapay/parish-life.js' },
  { source: 'src/browser/donor/controllers/calendar.ts', output: 'public/donor/controllers/calendar.js' },
  { source: 'src/browser/donor/controllers/bookstore.ts', output: 'public/donor/controllers/bookstore.js' },
  { source: 'src/browser/donor/controllers/history.ts', output: 'public/donor/controllers/history.js' },
  {
    source: 'src/browser/parish/features/koinonia/bulletins.ts',
    output: 'public/parish/features/koinonia/bulletins.js',
  },
  {
    source: 'src/browser/parish/features/sacraments/pastoral-followup.ts',
    output: 'public/parish/features/sacraments/pastoral-followup.js',
  },
  { source: 'src/browser/parish/features/onboarding.ts', output: 'public/parish/features/onboarding.js' },
  { source: 'src/browser/admin/controllers/tax-exemptions.ts', output: 'public/admin/controllers/tax-exemptions.js' },
  { source: 'src/browser/myagapay/exchange.ts', output: 'public/myagapay/exchange.js' },
  { source: 'src/browser/give/embed.ts', output: 'public/give/embed.js' },
  {
    source: 'src/browser/parish/features/accounting/workspace.ts',
    output: 'public/parish/features/accounting/workspace.js',
  },
  {
    source: 'src/browser/parish/features/accounting/reports.ts',
    output: 'public/parish/features/accounting/reports.js',
  },
  { source: 'src/browser/parish/features/accounting/ledger.ts', output: 'public/parish/features/accounting/ledger.js' },
  {
    source: 'src/browser/parish/features/accounting/banking.ts',
    output: 'public/parish/features/accounting/banking.js',
  },
  {
    source: 'src/browser/parish/features/accounting/treasurer.ts',
    output: 'public/parish/features/accounting/treasurer.js',
  },
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

// Private support files share one classic-script response; existing runtime dependencies are never bundled.
export function compilePrivateBrowserEntry(entry, root = repoRoot) {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [entry.source],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    metafile: true,
  });
  const actual = Object.keys(result.metafile.inputs).sort(),
    expected = [entry.source, ...entry.supportSources].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Unregistered private browser dependency: ' + actual.join(', '));
  return result.outputFiles[0].text;
}
// After type erasure only function declarations may be composed: no runtime initialization can move.
export function readClassicBrowserEntry(entry, root = repoRoot) {
  const pieces = (entry.classicSupportSources || []).map((p) => {
    const code = readFileSync(resolve(root, p), 'utf8'),
      erased = transformSync(code, { loader: 'ts', target: 'es2022', legalComments: 'none' }).code,
      ast = ts.createSourceFile(p, erased, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (ast.statements.some((n) => !ts.isFunctionDeclaration(n)))
      throw new Error('Classic support must contain only function declarations: ' + p);
    return code;
  });
  const main = readFileSync(resolve(root, entry.source), 'utf8');
  const ast = ts.createSourceFile(entry.source, main, ts.ScriptTarget.Latest, true);
  let prologueEnd = 0;
  for (const statement of ast.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    prologueEnd = statement.end;
  }
  // A classic entry's directive prologue must remain before every composed declaration.
  return [main.slice(0, prologueEnd), ...pieces, main.slice(prologueEnd)].join('\n');
}
export async function synchronizeBrowserTypeScript({ check = true, root = repoRoot } = {}) {
  const prettier = JSON.parse(await readFile(resolve(root, '.prettierrc.json'), 'utf8'));
  const stale = [];
  for (const entry of browserTypeScriptEntries) {
    const { source, output, module: nativeModule } = entry;
    const { code } = entry.supportSources
      ? { code: compilePrivateBrowserEntry(entry, root) }
      : await transform(
          entry.classicSupportSources
            ? readClassicBrowserEntry(entry, root)
            : await readFile(resolve(root, source), 'utf8'),
          {
            loader: 'ts',
            ...(nativeModule ? { format: 'esm' } : {}),
            target: 'es2022',
            charset: 'utf8',
            legalComments: 'none',
          }
        );
    if (entry.declarationsOnly) {
      const ast = ts.createSourceFile(source, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      if (ast.statements.some((node) => !ts.isFunctionDeclaration(node)))
        throw new Error('Classic runtime support must contain only function declarations: ' + source);
    }
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

// Inspect authored browser logic without coupling source guards to emitted quote style.
export function readBrowserContractSourceSync(runtimePath, root = repoRoot) {
  const entry = browserTypeScriptEntries.find((e) => e.output === runtimePath);
  const code = [
    entry?.source || runtimePath,
    ...(entry?.supportSources || []),
    ...(entry?.classicSupportSources || []),
    ...(!entry?.module ? entry?.runtimeSupportSources || [] : []),
  ]
    .map((p) => readFileSync(resolve(root, p), 'utf8'))
    .join('\n');
  if (!entry) return code;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  const comments = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia)
      comments.push(scanner.getTokenText());
  }
  let contractCode = code;
  if (entry.supportSources) {
    contractCode = [...entry.supportSources, entry.source]
      .map((p) => {
        const raw = readFileSync(resolve(root, p), 'utf8'),
          ast = ts.createSourceFile(p, raw, ts.ScriptTarget.Latest, true),
          edits = [];
        for (const node of ast.statements) {
          if (ts.isImportDeclaration(node)) edits.push({ start: node.getStart(ast), end: node.end, text: '' });
          else
            for (const modifier of node.modifiers || [])
              if (modifier.kind === ts.SyntaxKind.ExportKeyword)
                edits.push({ start: modifier.getStart(ast), end: modifier.end, text: '' });
        }
        return edits
          .sort((a, b) => b.start - a.start)
          .reduce((text, e) => text.slice(0, e.start) + e.text + text.slice(e.end), raw);
      })
      .join('\n');
  }
  return (
    comments.join('\n') +
    '\n' +
    transformSync(contractCode, { loader: 'ts', target: 'es2022', legalComments: 'inline', charset: 'utf8' }).code
  );
}
