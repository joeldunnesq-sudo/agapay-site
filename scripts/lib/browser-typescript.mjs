import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';
import { transform } from 'esbuild';
import { format } from 'prettier';
import { repoRoot } from './server-typescript.mjs';

// These are classic scripts: no bundling, module wrapper, exports, or global renaming.
export const browserTypeScriptEntries = Object.freeze([
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
  for (const { source, output } of browserTypeScriptEntries) {
    const { code } = await transform(await readFile(resolve(root, source), 'utf8'), {
      loader: 'ts',
      target: 'es2022',
      charset: 'utf8',
      legalComments: 'none',
    });
    // Fail before writing if a runtime import/export would turn a classic script into a module.
    new Script(code, { filename: output });
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
