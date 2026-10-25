import { testGroups } from '../test-manifest.mjs';
import { readFileSync } from 'node:fs';

const timing = JSON.parse(readFileSync(new URL('../../config/ci-test-durations.json', import.meta.url), 'utf8'));

// Partition the full manifest, rather than running overlapping local test tags.
// Keep each job sequential: browser fixtures and tests may share local ports/files.
const domainNames = ['accounting', 'browser', 'payments', 'directory', 'core', 'other'];
const partitionCounts = { browser: 6, core: 3 };
export const ciGroupNames = Object.freeze(
  domainNames.flatMap((name) =>
    partitionCounts[name] ? Array.from({ length: partitionCounts[name] }, (_, index) => `${name}-${index + 1}`) : [name]
  )
);

export function partitionCiTests(tests = testGroups.all, durationSeconds = timing.durationSeconds) {
  const groups = Object.fromEntries(ciGroupNames.map((name) => [name, []]));
  const domains = Object.fromEntries(domainNames.map((name) => [name, []]));
  for (const test of tests) {
    let group = 'other';
    if (test === 'scripts/browser-typescript-tests.mjs') group = 'core';
    else if (/browser|learn-(?:html-sanitization|boundary-controls)/.test(test)) group = 'browser';
    else if (/accounting/.test(test)) group = 'accounting';
    else if (/payment|stripe|settlement|pricing|tax-|giving|commerce|bookstore|fund-|outside-gifts/.test(test))
      group = 'payments';
    else if (/directory/.test(test)) group = 'directory';
    else if (testGroups.core.includes(test) || testGroups.critical.includes(test)) group = 'core';
    domains[group].push(test);
  }
  for (const domain of domainNames) {
    const names = partitionCounts[domain]
      ? Array.from({ length: partitionCounts[domain] }, (_, index) => `${domain}-${index + 1}`)
      : [domain];
    const loads = Object.fromEntries(names.map((name) => [name, 0]));
    // Assign expensive commands first. Timing only controls placement; new and
    // unmeasured commands still run, with the default cost of one second.
    const seconds = (test) => durationSeconds[test] ?? timing.defaultSeconds;
    const assignment = new Map();
    for (const test of [...domains[domain]].sort((a, b) => seconds(b) - seconds(a))) {
      const name = names.reduce((best, next) => (loads[next] < loads[best] ? next : best));
      assignment.set(test, name);
      loads[name] += seconds(test);
    }
    // Preserve manifest order within each runner, including fixture setup.
    for (const test of domains[domain]) groups[assignment.get(test)].push(test);
  }
  return groups;
}
