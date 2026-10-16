import ts from 'typescript';
const canonicalCache = new Map();
function canonicalTokens(source) {
  if (canonicalCache.has(source)) return canonicalCache.get(source);
  const file = ts.createSourceFile('source-contract.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const tokens = [];
  function visit(node) {
    const children = node.getChildren(file);
    if (children.length) {
      children.forEach(visit);
      return;
    }
    if (node.kind === ts.SyntaxKind.EndOfFileToken || !node.getWidth(file)) return;
    const value = ts.isStringLiteral(node)
      ? node.text
      : ts.isNumericLiteral(node)
        ? String(Number(node.text))
        : node.getText(file);
    tokens.push(JSON.stringify([node.kind, value]));
  }
  visit(file);
  const result = '\n' + tokens.join('\n') + '\n';
  canonicalCache.set(source, result);
  return result;
}
// Keep exact substring guards, while accepting equivalent JS quote/spacing styles.
// Parse the complete source so regexes and template expressions cannot disrupt token boundaries.
// String contents, identifiers, operators and token order remain significant.
export function includesJavaScriptFragment(source, fragment) {
  return source.includes(fragment) || canonicalTokens(source).includes(canonicalTokens(fragment));
}

export function javascriptCalls(source, name) {
  const file = ts.createSourceFile('contract.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const result = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === name)
      result.push({
        text: node.getText(file),
        arguments: node.arguments.map((argument) => ({
          text: argument.getText(file),
          string: ts.isStringLiteral(argument) ? argument.text : undefined,
        })),
      });
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}
export function javascriptStringPairs(source, name) {
  const file = ts.createSourceFile('contract.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(file) === name &&
      node.initializer &&
      ts.isNewExpression(node.initializer) &&
      node.initializer.expression.getText(file) === 'Map'
    ) {
      const array = node.initializer.arguments?.[0];
      if (!array || !ts.isArrayLiteralExpression(array)) throw Error(name + ' must remain a literal Map');
      result = array.elements.map((entry) => {
        if (
          !ts.isArrayLiteralExpression(entry) ||
          entry.elements.length !== 2 ||
          !entry.elements.every(ts.isStringLiteral)
        )
          throw Error(name + ' must contain string pairs');
        return entry.elements.map((value) => value.text);
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw Error('Missing Map ' + name);
  return result;
}

export function javascriptExportNames(source) {
  const file = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const node of file.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
      for (const entry of node.exportClause.elements) names.add(entry.name.text);
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) names.add(node.name.text);
      if (ts.isVariableStatement(node))
        for (const entry of node.declarationList.declarations)
          if (ts.isIdentifier(entry.name)) names.add(entry.name.text);
    }
  }
  return [...names];
}
export function javascriptFunctionNames(source) {
  return ts
    .createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true)
    .statements.filter(ts.isFunctionDeclaration)
    .map((node) => node.name.text);
}
