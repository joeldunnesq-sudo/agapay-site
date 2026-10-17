import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { serverTypeScriptSources } from './lib/server-typescript.mjs';
import { browserTypeScriptEntries } from './lib/browser-typescript.mjs';

const paths = new Set([
  ...serverTypeScriptSources,
  ...browserTypeScriptEntries.flatMap((e) => [
    e.source,
    ...(e.supportSources || []),
    ...(e.classicSupportSources || []),
  ]),
]);
const helpers = [];
const trees = [];
for (const path of paths) {
  const source = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  trees.push(tree);
  function visit(node) {
    if (ts.isAsExpression(node) && node.type.getText(tree).endsWith('TruthyFilter')) {
      assert.fail(`${path}: truthy adapters must use an implemented predicate`);
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text.startsWith('truthy')) {
      const owner = path.startsWith('src/browser/')
        ? browserTypeScriptEntries.find(
            (e) => e.source === path || e.supportSources?.includes(path) || e.classicSupportSources?.includes(path)
          )?.output
        : path.replace(/\.ts$/, '.js');
      assert.ok(owner, `${path}: emitted owner`);
      const generated = readFileSync(owner, 'utf8');
      const generatedTree = ts.createSourceFile(owner, generated, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      let emitted;
      function find(candidate) {
        if (ts.isFunctionDeclaration(candidate) && candidate.name?.text === node.name.text)
          emitted = candidate.getText(generatedTree);
        ts.forEachChild(candidate, find);
      }
      find(generatedTree);
      assert.ok(emitted, `${path}: helper is present in its deployed artifact`);
      helpers.push({ name: node.name.text, declaration: node.getText(tree), emitted });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
for (const tree of trees) {
  const localNames = new Set(helpers.map((h) => h.name));
  function checkUse(node) {
    if (ts.isIdentifier(node) && localNames.has(node.text)) {
      const parent = node.parent;
      const declaration = ts.isFunctionDeclaration(parent) && parent.name === node;
      const typeBinding =
        ts.isTypeQueryNode(parent) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node && !parent.initializer && parent.type !== undefined);
      const filterCallback =
        ts.isCallExpression(parent) &&
        parent.arguments[0] === node &&
        ts.isPropertyAccessExpression(parent.expression) &&
        parent.expression.name.text === 'filter';
      assert.ok(
        declaration || typeBinding || filterCallback,
        node.text + ' is filter-only; it must not narrow an else branch'
      );
    }
    ts.forEachChild(node, checkUse);
  }
  checkUse(tree);
}
assert.equal(helpers.length, 28);
assert.equal(
  new Set(helpers.map((h) => h.name)).size,
  helpers.length,
  'Composed artifacts cannot collide on helper names'
);
const object = Object.freeze({ id: 'retained' });
const noCoercion = {
  [Symbol.toPrimitive]() {
    throw Error('Truth testing must not invoke object coercion');
  },
};
const values = [
  undefined,
  null,
  false,
  0,
  -0,
  NaN,
  0n,
  '',
  true,
  1,
  -1,
  Infinity,
  1n,
  '0',
  'false',
  ' ',
  [],
  {},
  object,
  object,
  Object(false),
  Symbol('value'),
  noCoercion,
];
const expected = values.filter(Boolean);
for (const helper of helpers) {
  const predicate = vm.runInNewContext(`(${helper.emitted})`);
  for (const value of values) assert.equal(predicate(value), Boolean(value), helper.name);
  assert.deepEqual(values.filter(predicate), expected, helper.name);
  assert.equal(
    values.filter(predicate).filter((v) => v === object).length,
    2,
    'Object identity and duplicates survive'
  );
  const sparse = Array(8);
  sparse[1] = null;
  sparse[3] = 0;
  sparse[4] = 'kept';
  sparse[5] = undefined;
  sparse[7] = object;
  assert.deepEqual(sparse.filter(predicate), sparse.filter(Boolean));
  assert.equal(sparse.length, 8, 'Filtering does not mutate the source');
  // Calls may occur before a later composed part initializes: function declarations must hoist.
  assert.equal(vm.runInNewContext(`${helper.name}('ready'); ${helper.emitted}`), true);
}
const directory = mkdtempSync(join(tmpdir(), 'agapay-truthy-contracts-'));
try {
  const path = join(directory, 'contracts.ts');
  writeFileSync(
    path,
    helpers.map((h) => h.declaration).join('\n') +
      '\n' +
      helpers
        .map(
          (h, index) => `
    const input${index}: (number | null | undefined)[] = [0, 1, null, undefined];
    const output${index}: number[] = input${index}.filter(${h.name});
    // @ts-expect-error Unfiltered nullable inputs are still rejected.
    const rejected${index}: number[] = input${index};
  `
        )
        .join('\n')
  );
  const program = ts.createProgram([path], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
    []
  );
} finally {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('agapay-truthy-contracts-'));
  rmSync(directory, { recursive: true, force: true });
}
console.log(
  'PASS - all 28 emitted truthy predicates preserve falsy filtering, order, identity, sparse arrays, hoisting and strict caller contracts'
);
