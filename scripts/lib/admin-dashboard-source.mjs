import { readRepositoryFiles, scriptsReferencedByPages } from './browser-composed-source.mjs';

export const adminAppPagePaths = Object.freeze(['public/admin.html', 'public/admin/login.html']);

export function adminAppScriptPaths() {
  return scriptsReferencedByPages(adminAppPagePaths, (file) => file.startsWith('public/admin/'));
}

export function readAdminAppSource() {
  return readRepositoryFiles(adminAppScriptPaths());
}
