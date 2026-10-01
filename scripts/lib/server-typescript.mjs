import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { format } from 'prettier';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// Authoritative sources. Runtime consumers retain the adjacent .js import paths.
export const serverTypeScriptSources = Object.freeze([
  'src/organizations/types.ts',
  'src/organizations/terminology.ts',
  'src/organizations/module-profiles.ts',
  'src/organizations/verification-policies.ts',
  'src/organizations/context.ts',
  'src/organizations/module-access.ts',
  'src/organizations/api-policy.ts',
  'src/lib/xml-text.ts',
  'src/lib/format.ts',
  'src/lib/giving-contributions.ts',
  'src/lib/database-reads.ts',
  'src/lib/fund-report-period.ts',
  'src/lib/fund-allocation.ts',
  'src/lib/numeric-cents.ts',
  'src/lib/offering-fee-breakdown.ts',
  'src/lib/fund-reporting.ts',
  'src/lib/monthly-giving-csv.ts',
  'src/lib/outside-gift-error.ts',
  'src/lib/outside-gift-reads.ts',
  'src/lib/giving-fee-report.ts',
  'src/lib/pledge-report-reads.ts',
  'src/lib/stewardship-summary.ts',
  'src/lib/stewardship-income.ts',
  'src/lib/stewardship-giving.ts',
  'src/lib/request-context.ts',
  'src/lib/logging.ts',
  'src/lib/http-responses.ts',
  'src/lib/request-diagnostics.ts',
  'src/lib/content-reads.ts',
  'src/lib/safe-external-url.ts',
  'src/lib/koinonia-calendar.ts',
  'src/lib/rich-text.ts',
  'src/lib/giving-statement-storage.ts',
  'src/lib/sacrament-document-storage.ts',
  'src/lib/tax-exemption-storage.ts',
  'src/lib/nonprofit-pricing-storage.ts',
  'src/lib/accounting-attachment-storage.ts',
  'src/sacraments/document-upload.ts',
  'src/stewardship/giving-fee-presentation.ts',
  'src/stewardship/ledger-cost-presentation.ts',
  'src/stewardship/council-reports.ts',
]);

export function serverSourcePath(runtimePath) {
  const candidate = runtimePath.replace(/\.js$/, '.ts');
  return serverTypeScriptSources.includes(candidate) ? candidate : runtimePath;
}

export async function readServerModuleSource(runtimePath, root = repoRoot) {
  return readFile(resolve(root, serverSourcePath(runtimePath)), 'utf8');
}

export async function synchronizeServerTypeScript({ check = true, root = repoRoot } = {}) {
  const prettier = JSON.parse(await readFile(resolve(root, '.prettierrc.json'), 'utf8'));
  const stale = [];
  for (const sourcePath of serverTypeScriptSources) {
    const outputPath = sourcePath.replace(/\.ts$/, '.js');
    const source = await readFile(resolve(root, sourcePath), 'utf8');
    const { code } = await transform(source, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      charset: 'utf8',
      legalComments: 'none',
    });
    const generated = await format(`// Generated from ${sourcePath} by npm run build:server. Do not edit.\n${code}`, {
      ...prettier,
      parser: 'babel',
      endOfLine: 'lf',
    });
    if (check) {
      let existing;
      try {
        existing = await readFile(resolve(root, outputPath), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (existing?.replaceAll('\r\n', '\n') !== generated) stale.push(outputPath);
    } else {
      await writeFile(resolve(root, outputPath), generated);
    }
  }
  if (stale.length) {
    throw new Error(
      `Stale or missing TypeScript output: ${stale.join(', ')}. Run npm run build:server and include the generated files.`
    );
  }
}
