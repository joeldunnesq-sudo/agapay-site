import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ownedDeclarationDiagnostics } from './lib/owned-declaration-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { diagnostics, files } = ownedDeclarationDiagnostics(path.join(root, 'tsconfig.worker.json'), root);
if (!files.length) throw new Error('No application Worker declarations were checked.');
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    })
  );
  process.exit(1);
}
console.log(`PASS - ${files.length} application Worker declarations checked without skipLibCheck`);
