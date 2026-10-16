import { readFileSync } from 'node:fs';
import { serverTypeScriptSources, serverTypeScriptSupportSources } from './server-typescript.mjs';
import { browserTypeScriptEntries } from './browser-typescript.mjs';
const baseline = JSON.parse(
  readFileSync(new URL('../../config/typescript-runtime-baseline.json', import.meta.url), 'utf8')
);
export function typeScriptMigrationInventory() {
  const generated = new Set([
    ...serverTypeScriptSources.map((path) => path.replace(/\.ts$/, '.js')),
    ...browserTypeScriptEntries.map((entry) => entry.output),
  ]);
  const scope = new Set(baseline.runtimePaths);
  const converted = baseline.runtimePaths.filter((path) => generated.has(path));
  const remaining = baseline.runtimePaths.filter((path) => !generated.has(path));
  const support = serverTypeScriptSupportSources.map((path) => path.replace(/\.ts$/, '.js'));
  return {
    baselineCommit: baseline.baselineCommit,
    total: scope.size,
    converted: converted.length,
    remaining: remaining.length,
    percentage: Math.round((1000 * converted.length) / scope.size) / 10,
    supportModules: support.length,
    privateBrowserSupportSources: browserTypeScriptEntries.flatMap((entry) => entry.supportSources || []),
    convertedPaths: converted,
    remainingPaths: remaining,
    supportPaths: support,
  };
}
