import { readFileSync } from 'node:fs';
import path from 'node:path';
import { htmlFilesUnder, readRepositoryFiles, repoRoot, scriptsReferencedByPages } from './browser-composed-source.mjs';

const candidatePages = Object.freeze([...htmlFilesUnder('public/donor'), ...htmlFilesUnder('public/myagapay')]);

export const donorAppPagePaths = Object.freeze(
  candidatePages.filter((file) =>
    /<script\b[^>]*\bsrc=["']\/donor\/app\.js(?:[?#][^"']*)?["']/i.test(readFileSync(path.join(repoRoot, file), 'utf8'))
  )
);

export function donorAppScriptPaths() {
  return scriptsReferencedByPages(donorAppPagePaths, (file) => file.startsWith('public/donor/'));
}

export function readDonorAppSource() {
  return readRepositoryFiles(donorAppScriptPaths());
}
