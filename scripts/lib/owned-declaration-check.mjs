import path from 'node:path';
import ts from 'typescript';

// Wrangler's runtime and Node's ambient libraries overlap. Check application
// declarations with library checking enabled without treating those upstream
// duplicate globals as application errors. No diagnostic in an owned file is filtered.
export function ownedDeclarationDiagnostics(configPath, root) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return { diagnostics: [config.error], files: [] };
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length) return { diagnostics: parsed.errors, files: [] };
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, skipLibCheck: false });
  const sourceRoot = path.resolve(root, 'src') + path.sep;
  const files = program
    .getSourceFiles()
    .filter((file) => file.isDeclarationFile && path.resolve(file.fileName).startsWith(sourceRoot));
  const diagnostics = files.flatMap((file) => [
    ...program.getSyntacticDiagnostics(file),
    ...program.getSemanticDiagnostics(file),
  ]);
  return { diagnostics, files: files.map((file) => file.fileName) };
}
