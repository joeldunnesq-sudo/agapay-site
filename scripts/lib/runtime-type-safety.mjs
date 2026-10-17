import path from 'node:path';
import ts from 'typescript';

export function uncheckedRuntimeParameters(program, root) {
  const checker = program.getTypeChecker();
  const sourceRoot = path.resolve(root, 'src') + path.sep;
  const unchecked = [];
  let parameters = 0;
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || !path.resolve(file.fileName).startsWith(sourceRoot)) continue;
    function visit(node) {
      if (ts.isParameter(node)) {
        parameters++;
        if (checker.getTypeAtLocation(node).flags & ts.TypeFlags.Any) {
          unchecked.push({
            file: path.relative(root, file.fileName),
            line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            name: node.name.getText(file),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return { parameters, unchecked };
}
