import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceFiles = [
  "src/lib/core.js",
  "src/lib/email.js",
  "src/lib/format.js",
  "src/lib/registrations.js",
  "src/handlers/parish.js",
  "src/handlers/donor.js",
  "src/handlers/admin.js",
  "src/handlers/stripe.js",
  "src/worker.js"
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function namedImports(source) {
  const imports = [];
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/g)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({
        imported: part.split(/\s+as\s+/)[0].trim(),
        local: (part.split(/\s+as\s+/)[1] || part.split(/\s+as\s+/)[0]).trim()
      }));
    imports.push({ specifier: match[2], names });
  }
  return imports;
}

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(fromDir, specifier));
  return resolved.endsWith(".js") ? resolved.replaceAll("\\", "/") : `${resolved.replaceAll("\\", "/")}.js`;
}

function declaredNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const item of namedImports(source)) {
    for (const name of item.names) names.add(name.local);
  }
  return names;
}

const sources = new Map(sourceFiles.map((file) => [file, read(file)]));
const exportsByFile = new Map([...sources].map(([file, source]) => [file, exportedNames(source)]));
const errors = [];

for (const [file, source] of sources) {
  for (const importBlock of namedImports(source)) {
    const resolved = resolveSpecifier(file, importBlock.specifier);
    if (!resolved || !exportsByFile.has(resolved)) continue;
    const available = exportsByFile.get(resolved);
    for (const name of importBlock.names) {
      if (!available.has(name.imported)) {
        errors.push(`${file}: imports ${name.imported} from ${importBlock.specifier}, but ${resolved} does not export it`);
      }
    }
  }
}

const worker = sources.get("src/worker.js");
const workerDeclared = declaredNames(worker);
for (const match of worker.matchAll(/\b(handle[A-Z][A-Za-z0-9_]*)\s*\(/g)) {
  const name = match[1];
  if (!workerDeclared.has(name)) {
    errors.push(`src/worker.js: calls ${name}(...), but it is not imported or declared`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("worker split check ok");
