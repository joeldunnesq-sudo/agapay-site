import { testGroups } from '../test-manifest.mjs';

// Partition the full manifest, rather than running overlapping local test tags.
// Keep each job sequential: browser fixtures and tests may share local ports/files.
const domainNames = ['accounting', 'browser', 'payments', 'directory', 'core', 'other'];
const partitionCounts = { accounting: 2, browser: 3, core: 2 };
export const ciGroupNames = Object.freeze(
  domainNames.flatMap((name) =>
    partitionCounts[name] ? Array.from({ length: partitionCounts[name] }, (_, index) => `${name}-${index + 1}`) : [name]
  )
);

export function partitionCiTests(tests = testGroups.all) {
  const groups = Object.fromEntries(ciGroupNames.map((name) => [name, []]));
  const counts = Object.fromEntries(domainNames.map((name) => [name, 0]));
  for (const test of tests) {
    let group = 'other';
    if (/browser|learn-(?:html-sanitization|boundary-controls)/.test(test)) group = 'browser';
    else if (/accounting/.test(test)) group = 'accounting';
    else if (/payment|stripe|settlement|pricing|tax-|giving|commerce|bookstore|fund-|outside-gifts/.test(test))
      group = 'payments';
    else if (/directory/.test(test)) group = 'directory';
    else if (testGroups.core.includes(test) || testGroups.critical.includes(test)) group = 'core';
    const partition = partitionCounts[group] ? `${group}-${(counts[group] % partitionCounts[group]) + 1}` : group;
    counts[group] += 1;
    groups[partition].push(test);
  }
  return groups;
}
