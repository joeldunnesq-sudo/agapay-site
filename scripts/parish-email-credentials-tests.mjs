import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleParishEmailCredentials } from "../src/handlers/parish-email-credentials.js";
import { sendEmail, validateResendApiKey } from "../src/lib/email.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "migrations", "0071_parish_email_credentials.sql"), "utf8");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(migration);

const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) { this.parameters = parameters; return this; },
      async first() { return sqlite.prepare(sql).get(...this.parameters) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...this.parameters);
        return { success: true, meta: { changes: result.changes } };
      },
    };
  },
};

const parishId = "phase-6-parish";
const registration = {
  parishId,
  parishName: "St. Phase Six",
  website: "https://www.phase-six.example",
  treasurerEmail: "treasurer@phase-six.example",
};
const dependencies = {
  rateLimit: async () => null,
  findRegistrationByParishId: async () => ({ key: "registration", registration }),
  verifyParishDashboardBearer: async () => true,
};
const env = { AGAPAY_DB: db, RESEND_API_KEY: "re_shared_platform_key" };
const request = (method, body) => new Request(`https://agapay.test/api/parish/dashboard/${parishId}/email-credentials`, {
  method,
  headers: { Authorization: "Bearer test-session", ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

let response = await handleParishEmailCredentials(request("POST", { resendApiKey: "re_invalid_key_123" }), env, parishId, {
  ...dependencies,
  validateResendApiKey: async () => ({ valid: false, reason: "Resend rejected this API key." }),
});
assert.equal(response.status, 422, "an invalid key must be rejected during save");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM parish_email_credentials").get().count, 0);

const parishKey = "re_parish_secret_key_123456";
response = await handleParishEmailCredentials(request("POST", { resendApiKey: parishKey }), env, parishId, {
  ...dependencies,
  validateResendApiKey: async () => ({ valid: true, permission: "sending_access" }),
});
assert.equal(response.status, 200);
let payload = await response.json();
assert.equal(payload.configured, true);
assert.equal(payload.sendingDomain, "phase-six.example");
assert.ok(payload.configuredAt);
assert.equal(JSON.stringify(payload).includes(parishKey), false, "save responses must never return the key");
assert.equal(sqlite.prepare("SELECT resend_api_key FROM parish_email_credentials WHERE parish_id = ?").get(parishId).resend_api_key, parishKey);

response = await handleParishEmailCredentials(request("GET"), env, parishId, dependencies);
payload = await response.json();
assert.deepEqual(Object.keys(payload).sort(), ["configured", "configuredAt", "sendingDomain"].sort());
assert.equal(JSON.stringify(payload).includes(parishKey), false, "status responses must never return the key");

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  return new Response(JSON.stringify({ id: `email_${requests.length}` }), { status: 200 });
};
try {
  let result = await sendEmail(env, {
    from: "AGAPAY <onboarding@agapay.app>", to: ["donor@example.test"], subject: "Parish digest",
  }, {
    parishId,
    parishFrom: "St. Phase Six <announcements@phase-six.example>",
  });
  assert.equal(result.status, "sent");
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${parishKey}`, "configured parishes must use their own key");
  assert.equal(JSON.parse(requests[0].init.body).from, "St. Phase Six <announcements@phase-six.example>");

  result = await sendEmail(env, {
    from: "AGAPAY <onboarding@agapay.app>", to: ["donor@example.test"], subject: "Shared digest",
  }, { parishId: "parish-without-override", parishFrom: "Other Parish <announcements@other.example>" });
  assert.equal(result.status, "sent");
  assert.equal(requests[1].init.headers.Authorization, "Bearer re_shared_platform_key", "unconfigured parishes must retain shared-key behavior");
  assert.equal(JSON.parse(requests[1].init.body).from, "AGAPAY <onboarding@agapay.app>");
} finally {
  globalThis.fetch = originalFetch;
}

const restrictedValidation = await validateResendApiKey("re_sending_only_key_123", async () => new Response(
  JSON.stringify({ name: "restricted_api_key", message: "This API key is restricted to only send emails." }),
  { status: 401, headers: { "Content-Type": "application/json" } },
));
assert.deepEqual(restrictedValidation, { valid: true, permission: "sending_access" }, "send-only Resend keys must validate without requiring full account access");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : entry.name.endsWith(".js") ? [file] : [];
  });
}
const sources = sourceFiles(path.join(root, "src")).map((file) => ({ file, source: readFileSync(file, "utf8") }));
const definitions = sources.flatMap(({ file, source }) => [
  ...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(sendEmail|agapayEmailHtml)\s*\(/g),
].map((match) => ({ file, name: match[1] })));
assert.deepEqual(definitions.map(({ name }) => name).sort(), ["agapayEmailHtml", "sendEmail"], "email helper definitions must have exactly one canonical copy each");
assert.ok(definitions.every(({ file }) => file.endsWith(path.join("src", "lib", "email.js"))));
for (const { file, source } of sources) {
  const legacyImports = [...source.matchAll(/import\s*{([^}]*)}\s*from\s*["'][^"']*parish-notifications\.js["']/g)];
  for (const match of legacyImports) {
    assert.doesNotMatch(match[1], /\b(?:sendEmail|agapayEmailHtml)\b/, `${file} must import canonical email helpers from lib/email.js`);
  }
}

const dashboard = readFileSync(path.join(root, "public", "parish", "dashboard.html"), "utf8");
const parishApp = readFileSync(path.join(root, "public", "parish", "app.js"), "utf8");
assert.match(dashboard, /Parish Email Sending/);
assert.match(parishApp, /The key alone does not verify a domain or improve deliverability/);
assert.match(parishApp, /type="password"[\s\S]*?autocomplete="new-password"/);
assert.doesNotMatch(parishApp, /value="\$\{[^}]*resend/i, "the UI must never redisplay a stored credential");

console.log("PASS - Phase 6 consolidates email helpers and safely applies validated per-parish Resend credentials");
