import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';
import { transform } from 'esbuild';
import { format } from 'prettier';
import { repoRoot } from './server-typescript.mjs';

// These are classic scripts: no bundling, module wrapper, exports, or global renaming.
export const browserTypeScriptEntries = Object.freeze([
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
