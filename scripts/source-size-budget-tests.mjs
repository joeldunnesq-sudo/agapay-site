import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'config/source-size-budgets.json'), 'utf8'));
const normalize = (path) => relative(root, path).split(sep).join('/');

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relativePath = normalize(path);
    if (relativePath.startsWith('public/vendor/')) continue;
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:js|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

const actual = new Map();
for (const directory of ['src', 'public', 'scripts']) {
  for (const path of sourceFiles(join(root, directory))) {
    actual.set(normalize(path), readFileSync(path, 'utf8').split(/\r?\n/).length - 1);
  }
}

for (const [file, maximum] of Object.entries(config.files)) {
  assert.ok(actual.has(file), `Source-size budget references missing file ${file}.`);
  const lines = actual.get(file);
  assert.ok(
    lines <= maximum,
    `${file} grew from its ${maximum}-line budget to ${lines}; extract the changed domain instead.`
  );
  assert.ok(
    lines > config.maximumUnbudgetedLines,
    `${file} is now under ${config.maximumUnbudgetedLines} lines; remove its legacy budget entry.`
  );
}

const unbudgeted = [...actual.entries()]
  .filter(([file, lines]) => lines > config.maximumUnbudgetedLines && config.files[file] === undefined)
  .map(([file, lines]) => `${file} (${lines})`);
assert.deepEqual(
  unbudgeted,
  [],
  `New oversized source files are not allowed. Add a smaller boundary instead of a budget: ${unbudgeted.join(', ')}`
);

console.log(
  `PASS - ${Object.keys(config.files).length} legacy hotspots cannot grow and new source files stay at or below ${config.maximumUnbudgetedLines} lines`
);
