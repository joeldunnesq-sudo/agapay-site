import { includesJavaScriptFragment } from './lib/javascript-source-contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const html = read('public/give/index.html');
const css = read('public/styles/give.css');
const worker = read('src/worker.js');
const server = read('server.mjs');
const chrome = read('public/site-chrome.js');
const core = read('src/lib/core.js');
const structuredData = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || '{}');

assert.ok(
  includesJavaScriptFragment(worker, '["security", "security"]'),
  'the production Worker must redirect /give/security to the consolidated section'
);
assert.ok(
  includesJavaScriptFragment(server, '["security", "security"]'),
  'the local server must mirror the security redirect'
);
assert.match(
  html,
  /give-section-links[\s\S]*?<a href="#security">Security<\/a>/,
  'the Give secondary navigation must link directly to the security section'
);
assert.ok(
  includesJavaScriptFragment(chrome, '<a href="/give#security">Security</a>'),
  'the canonical footer must retain a direct link to the security section'
);
assert.ok(
  structuredData['@graph'].some((item) => item['@type'] === 'FAQPage'),
  'the consolidated page must retain valid FAQ structured data'
);
assert.ok(includesJavaScriptFragment(html, 'PBKDF2-SHA256'), 'password handling must be described precisely');
assert.ok(
  includesJavaScriptFragment(html, 'Stripe-hosted Checkout'),
  'the page must explain that Stripe collects sensitive payment details'
);
assert.ok(
  includesJavaScriptFragment(html, 'do not pass through or get stored by the AGAPAY application'),
  'the page must distinguish Stripe data from AGAPAY records'
);
assert.ok(
  includesJavaScriptFragment(html, 'cryptographic signature and timestamp'),
  'the page must explain Stripe webhook verification'
);
assert.ok(
  includesJavaScriptFragment(html, 'Cross-parish requests are denied'),
  'the page must describe parish data isolation'
);
assert.ok(
  includesJavaScriptFragment(html, 'does not initiate or approve transfers'),
  'the page must preserve the bank-transfer control boundary'
);
assert.ok(
  includesJavaScriptFragment(html, 'automatically encrypted at rest with AES-256'),
  'the page must explain Cloudflare-managed storage encryption'
);
assert.ok(
  includesJavaScriptFragment(html, 'tokens expire after five minutes and can be used only once'),
  'the page must describe Turnstile token behavior'
);
assert.ok(
  includesJavaScriptFragment(core, 'turnstile/v0/siteverify'),
  'AGAPAY must verify Turnstile tokens server-side'
);
assert.ok(
  includesJavaScriptFragment(core, 'if (!result.success) return json'),
  'failed Turnstile verification must reject the protected request'
);
assert.ok(
  includesJavaScriptFragment(html, 'No responsible online service can promise zero risk'),
  'the page must avoid absolute security promises'
);
assert.doesNotMatch(
  html,
  /AGAPAY is (?:unhackable|bank-grade|PCI(?:-DSS)? certified)/i,
  'the page must not make unsupported compliance claims'
);
assert.ok(
  includesJavaScriptFragment(css, '@media (max-width: 560px)'),
  'the security section must include a phone layout'
);
assert.ok(
  includesJavaScriptFragment(css, 'prefers-reduced-motion: reduce'),
  'the page must respect reduced-motion preferences'
);

console.log(
  'PASS - consolidated AGAPAY Give security content is precise, prominent, responsive, and responsibly stated'
);
