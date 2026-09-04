import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readLearnDashboardSource } from './lib/learn-dashboard-source.mjs';

const sanitizerSource = await readFile(new URL('../public/vendor/dompurify.es.mjs', import.meta.url), 'utf8');
const shellSource = readLearnDashboardSource();
const renderBoundarySource = await readFile(new URL('../public/learn/sanitized-render.js', import.meta.url), 'utf8');

assert.match(
  renderBoundarySource,
  /target\.innerHTML = DOMPurify\.sanitize/,
  'the live Learn root must receive only DOMPurify-sanitized markup'
);
assert.equal(
  (shellSource.match(/root\.innerHTML\s*=/g) || []).length,
  0,
  'no Learn page may bypass the centralized sanitized render boundary'
);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({
    type: 'module',
    content: `${sanitizerSource}\nwindow.__AGAPAY_DOMPURIFY__ = purify;`,
  });

  const sanitized = await page.evaluate(() =>
    window.__AGAPAY_DOMPURIFY__.sanitize(`
    <section data-safe-marker="kept">
      <img src="x" onerror="window.__xss = true">
      <a href="javascript:window.__xss = true">Unsafe link</a>
      <script>window.__xss = true<\/script>
      <p style="color:navy" onclick="window.__xss = true">Safe content</p>
    </section>
  `)
  );

  assert.match(sanitized, /data-safe-marker="kept"/, 'ordinary Learn data attributes should survive sanitization');
  assert.match(sanitized, /style="color:navy"/, 'ordinary Learn inline presentation should survive sanitization');
  assert.doesNotMatch(
    sanitized,
    /onerror|onclick|javascript:|<script/i,
    'scripts, event handlers, and script URLs must be removed before Learn markup reaches the DOM'
  );
} finally {
  await browser.close();
}

console.log('PASS - Learn root rendering sanitizes hostile HTML while preserving required presentation attributes');
