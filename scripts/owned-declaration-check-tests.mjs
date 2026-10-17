import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ownedDeclarationDiagnostics } from './lib/owned-declaration-check.mjs';
import { uncheckedRuntimeParameters } from './lib/runtime-type-safety.mjs';
import ts from 'typescript';

const root = await mkdtemp(path.join(tmpdir(), 'agapay-owned-declarations-'));
try {
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, 'upstream'));
  const config = path.join(root, 'tsconfig.json');
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, types: [], noLib: true },
      include: ['src/**/*.d.ts', 'upstream/**/*.d.ts'],
    })
  );
  // Overlapping upstream declarations must not prevent checking our contracts.
  await writeFile(path.join(root, 'upstream/runtime.d.ts'), 'interface Upstream { value: string; value: number; }');
  const owned = path.join(root, 'src/contracts.d.ts');
  await writeFile(owned, 'interface Base { value: string }\ninterface Child extends Base { value: number }');
  let result = ownedDeclarationDiagnostics(config, root);
  assert.equal(result.files.length, 1);
  assert.ok(
    result.diagnostics.some((d) => d.code === 2430),
    'Invalid owned inheritance must fail despite skipLibCheck in the project.'
  );
  assert.ok(result.diagnostics.every((d) => path.resolve(d.file.fileName) === owned));
  await writeFile(owned, 'interface Base { value: string }\ninterface Child extends Base { other?: number }');
  result = ownedDeclarationDiagnostics(config, root);
  assert.deepEqual(result.diagnostics, []);
  await writeFile(owned, "export { missing } from './implementation';");
  await writeFile(path.join(root, 'src/implementation.ts'), 'export const present = 1;');
  assert.ok(
    ownedDeclarationDiagnostics(config, root).diagnostics.some((d) => d.code === 2305),
    'Stale declaration re-exports must fail.'
  );
  await writeFile(owned, 'interface Duplicate { value: string; value: number; }');
  assert.ok(ownedDeclarationDiagnostics(config, root).diagnostics.length > 0, 'Duplicate owned fields must fail.');
  const runtime = path.join(root, 'src/runtime.ts');
  const inspect = () =>
    uncheckedRuntimeParameters(
      ts.createProgram([runtime], {
        strict: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
      }),
      root
    );
  await writeFile(
    runtime,
    'export function probe(input: unknown) { if (Array.isArray(input)) return input.map(value => value); }'
  );
  assert.ok(
    inspect().unchecked.some((item) => item.name === 'value'),
    'Array narrowing must not silently introduce unchecked callbacks.'
  );
  await writeFile(
    runtime,
    'export function probe(input: unknown) { if (Array.isArray(input)) return input.map((value: unknown) => value); }'
  );
  assert.deepEqual(inspect().unchecked, []);
  await writeFile(runtime, 'export function probe() { return Promise.reject().catch(error => error); }');
  assert.ok(
    inspect().unchecked.some((item) => item.name === 'error'),
    'Promise rejection callbacks need an explicit boundary type.'
  );
  await writeFile(runtime, 'export function probe() { return [...new Map().values()].map(value => value); }');
  assert.ok(
    inspect().unchecked.some((item) => item.name === 'value'),
    'Untyped collections must not silently erase callback contracts.'
  );
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
  await rm(root, { recursive: true, force: true });
}
console.log(
  'PASS - owned declaration gate rejects inheritance, duplicate and stale-export errors while isolating upstream libraries'
);
