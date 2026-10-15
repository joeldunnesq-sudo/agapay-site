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
    const value = ts.isStringLiteral(node) ? node.text : node.getText(file);
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
