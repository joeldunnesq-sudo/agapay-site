import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// A second full Wrangler declaration would merge two different mainModule entries.
// Retain its generated binding interfaces in the shared project, without merging its runtime namespace.
export async function extractProvisionerEnvironment(sourcePath, outputPath) {
  const source = await readFile(sourcePath, 'utf8');
  const ast = ts.createSourceFile(String(sourcePath), source, ts.ScriptTarget.Latest, true);
  const names = new Set(['__BaseEnv_AccountingProvisionerEnv', 'AccountingProvisionerEnv']);
  const declarations = ast.statements.filter((node) => ts.isInterfaceDeclaration(node) && names.has(node.name.text));
  if (declarations.length !== names.size || new Set(declarations.map((node) => node.name.text)).size !== names.size) {
    throw new Error('Wrangler did not generate the expected Accounting provisioner environment interfaces.');
  }
  await writeFile(
    outputPath,
    '// Generated from wrangler.accounting-provisioner.json by npm run typecheck. Do not edit.\n' +
      declarations.map((node) => node.getText(ast)).join('\n') +
      '\n'
  );
}
