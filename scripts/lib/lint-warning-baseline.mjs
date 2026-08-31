import { relative, sep } from 'node:path';

export const lintTargets = ['src', 'public', 'scripts', 'server.mjs'];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Count warnings by file and rule, never by line number: cleanup can move a
// diagnostic without creating new debt. Errors are never eligible for a baseline.
export function checkLintBaseline(results, baseline, cwd) {
  if (!isRecord(baseline)) throw new Error('Lint warning baseline must map files to rule counts.');
  const expected = new Map();
  for (const [file, rules] of Object.entries(baseline)) {
    if (
      !/^(?:src|public|scripts)\/.+\.(?:js|mjs)$|^server\.mjs$/.test(file) ||
      file.includes('\\') ||
      file.split('/').some((part) => part === '.' || part === '..' || !part)
    ) {
      throw new Error(`Invalid lint baseline path: ${file}`);
    }
    if (!isRecord(rules) || !Object.keys(rules).length) throw new Error(`Missing rule counts for ${file}`);
    for (const [rule, count] of Object.entries(rules)) {
      if (!rule || !Number.isSafeInteger(count) || count < 1) {
        throw new Error(`Invalid lint baseline count for ${file} (${rule})`);
      }
      expected.set(`${file} (${rule})`, count);
    }
  }

  const actual = new Map();
  let errorCount = 0;
  for (const result of results) {
    errorCount += result.errorCount;
    const file = relative(cwd, result.filePath).split(sep).join('/');
    for (const message of result.messages) {
      if (message.severity !== 1) continue;
      const key = `${file} (${message.ruleId || 'unclassified'})`;
      actual.set(key, (actual.get(key) || 0) + 1);
    }
  }

  const violations = [];
  for (const [key, count] of actual) {
    const allowed = expected.get(key) || 0;
    if (count > allowed) violations.push(`${key}: ${count} warning(s), baseline allows ${allowed}.`);
  }
  for (const [key, count] of expected) {
    const remaining = actual.get(key) || 0;
    if (remaining < count) {
      violations.push(`${key}: baseline has ${count}, found ${remaining}; reduce or remove the stale entry.`);
    }
  }
  return { errorCount, violations };
}
