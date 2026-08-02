import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [wrangler, deploy, backup, privacy, terms, dependabot, smokeWorkflow, learnLogin, learnShell, listenOpml] = await Promise.all([
  readFile("wrangler.toml", "utf8"),
  readFile(".github/workflows/deploy.yml", "utf8"),
  readFile(".github/workflows/production-d1-backup.yml", "utf8"),
  readFile("public/privacy.html", "utf8"),
  readFile("public/terms.html", "utf8"),
  readFile(".github/dependabot.yml", "utf8"),
  readFile(".github/workflows/smoke-check.yml", "utf8"),
  readFile("public/learn/odyssey/dashboard/login.html", "utf8"),
  readFile("public/learn/dashboard-shell.js", "utf8"),
  readFile("public/listen/opml.js", "utf8"),
]);

assert.match(wrangler, /\[observability\][\s\S]*enabled = true[\s\S]*head_sampling_rate = 1/);
assert.match(wrangler, /\[env\.staging\.observability\][\s\S]*enabled = true[\s\S]*head_sampling_rate = 1/);
assert.match(deploy, /AGAPAY_BUILD_SHA:\$\{\{ github\.sha \}\}/);
assert.match(deploy, /AGAPAY_DEPLOYED_AT:\$\{\{ env\.AGAPAY_DEPLOYED_AT \}\}/);
assert.match(deploy, /AGAPAY_BASE_URL: https:\/\/agapay\.app/);

assert.match(backup, /d1 export agapay-production --remote --skip-confirmation/);
assert.match(backup, /PRAGMA foreign_keys=OFF/);
assert.match(backup, /sha256sum/);
assert.match(backup, /agapay-accounting-backups\/platform-d1/);
assert.match(backup, /r2 object put[^\n]+--remote --force/);
assert.doesNotMatch(backup, /upload-artifact/, "production database dumps must never become GitHub artifacts");

assert.match(privacy, /AGAPAY Learn child and education records/);
assert.match(privacy, /Household &amp; Directory Data/);
assert.match(privacy, /Resend/);
assert.match(privacy, /Application hosting through Cloudflare Workers/);
assert.doesNotMatch(privacy, /GitHub Pages/);
assert.doesNotMatch(privacy, /MailerLite/);
assert.match(terms, /href="https:\/\/stripe\.com\/privacy"[^>]*>Privacy Policy<\/a>/);

assert.match(dependabot, /package-ecosystem: npm/);
assert.match(dependabot, /package-ecosystem: github-actions/);
assert.match(smokeWorkflow, /permissions:\s*\n\s*contents: read/);
assert.doesNotMatch(learnLogin, /window\.location\.replace\(next\)/, "login must not redirect to an untrusted query parameter");
assert.match(learnLogin, /window\.location\.replace\("\/learn\/odyssey\/dashboard"\)/);
assert.match(learnShell, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
assert.match(listenOpml, /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/);

console.log("Launch-control regression tests passed.");
