import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function repositoryPath(value) {
  return value.split(path.sep).join('/');
}

function publicScriptPath(source) {
  const pathname = String(source || '').split(/[?#]/, 1)[0];
  if (!pathname.startsWith('/') || !pathname.endsWith('.js')) return '';
  const resolved = path.resolve(repoRoot, `public${pathname}`);
  const publicRoot = path.resolve(repoRoot, 'public');
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) return '';
  return repositoryPath(path.relative(repoRoot, resolved));
}

export function readRepositoryFiles(files) {
  return files.map((file) => readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
}

export function scriptsReferencedByPages(pageFiles, predicate = () => true) {
  const scripts = [];
  const seen = new Set();
  for (const pageFile of pageFiles) {
    const html = readFileSync(path.join(repoRoot, pageFile), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)) {
      const file = publicScriptPath(match[1]);
      if (!file || seen.has(file) || !predicate(file, pageFile)) continue;
      assertRepositoryFile(file, `${pageFile} references missing script ${match[1]}`);
      seen.add(file);
      scripts.push(file);
    }
  }
  return scripts;
}

export function htmlFilesUnder(directory) {
  const absolute = path.join(repoRoot, directory);
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = repositoryPath(path.join(directory, entry.name));
    if (entry.isDirectory()) files.push(...htmlFilesUnder(relative));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(relative);
  }
  return files.sort();
}

function assertRepositoryFile(file, message = `Missing repository file ${file}`) {
  if (!existsSync(path.join(repoRoot, file))) throw new Error(message);
}

function relativeModuleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+[^"']*?\s+from\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith('.')) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

export function moduleGraphPaths(entryFile) {
  const entry = repositoryPath(entryFile);
  assertRepositoryFile(entry);
  const pending = [entry];
  const visited = new Set();
  const ordered = [];

  while (pending.length) {
    const file = pending.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    ordered.push(file);
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const specifier of relativeModuleSpecifiers(source)) {
      const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
      const resolved = repositoryPath(path.normalize(path.join(path.dirname(file), cleanSpecifier)));
      assertRepositoryFile(resolved, `${file} imports missing module ${specifier}`);
      if (!visited.has(resolved)) pending.push(resolved);
    }
  }

  return ordered;
}

export function readModuleGraphSource(entryFile) {
  return readRepositoryFiles(moduleGraphPaths(entryFile));
}
