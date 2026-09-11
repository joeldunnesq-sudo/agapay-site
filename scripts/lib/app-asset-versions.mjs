import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './browser-composed-source.mjs';

// Shared My AGAPAY assets. Add extracted shared scripts here with their page
// references so one content version is used by every consumer.
export const appAssets = Object.freeze([
  '/donor/app.js',
  '/donor/style.css',
  '/myagapay-shell.js',
  '/donor/session.js',
  '/scripts/consumer-passkeys.js',
  '/donor/controllers/calendar.js',
]);

export function contentVersion(source) {
  // Git checkouts use CRLF on Windows and LF in CI; both must name the same asset.
  return createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex').slice(0, 16);
}

export function appAssetUrl(asset, root = repoRoot) {
  if (!appAssets.includes(asset)) throw new Error(`Unknown versioned app asset: ${asset}`);
  return `${asset}?v=${contentVersion(readFileSync(path.join(root, 'public', asset.slice(1)), 'utf8'))}`;
}

export function versionAppAssetReferences(html, urls) {
  return html.replace(/\b(src|href)=(['"])([^'"]+)\2/g, (attribute, name, quote, value) => {
    const [pathname] = value.split(/[?#]/);
    if (!urls.has(pathname)) return attribute;
    const url = new URL(value, 'https://agapay.invalid');
    url.searchParams.set('v', new URL(urls.get(pathname), url.origin).searchParams.get('v'));
    return `${name}=${quote}${url.pathname}${url.search}${url.hash}${quote}`;
  });
}
