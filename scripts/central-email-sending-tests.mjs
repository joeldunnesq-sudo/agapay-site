import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendEmail } from "../src/lib/email.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(read("migrations/0071_parish_email_credentials.sql"));
sqlite.prepare(`
  INSERT INTO parish_email_credentials (parish_id, resend_api_key, configured_by)
  VALUES (?, ?, ?)
`).run("legacy-parish", "re_legacy_parish_key", "legacy@example.test");
sqlite.exec(read("migrations/0098_retire_parish_email_credentials.sql"));
assert.equal(
  sqlite.prepare("SELECT COUNT(*) AS count FROM parish_email_credentials").get().count,
  0,
  "the retirement migration must purge previously stored parish credentials",
);

const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  return new Response(JSON.stringify({ id: "email_central" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

try {
  const message = {
    from: "AGAPAY <onboarding@agapay.app>",
    to: ["donor@example.test"],
    subject: "Parish digest",
  };
  const result = await sendEmail(
    { RESEND_API_KEY: "re_agapay_platform_key" },
    message,
    { parishId: "legacy-parish", parishFrom: "Legacy Parish <announcements@legacy.example>" },
  );
  assert.equal(result.status, "sent");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Authorization, "Bearer re_agapay_platform_key");
  assert.deepEqual(JSON.parse(requests[0].init.body), message, "parish options must not override AGAPAY's sender");
} finally {
  globalThis.fetch = originalFetch;
}

const dashboard = read("public/parish/dashboard.html");
const parishApp = read("public/parish/app.js");
const worker = read("src/worker.js");
const emailLibrary = read("src/lib/email.js");
assert.doesNotMatch(dashboard, /Parish Email Sending|parishEmailCredentialsBody/);
assert.doesNotMatch(parishApp, /Parish Resend|parishResendApiKey|email-credentials/);
assert.doesNotMatch(worker, /handleParishEmailCredentials|email-credentials/);
assert.doesNotMatch(emailLibrary, /parish_email_credentials|resolveResendApiKey|validateResendApiKey/);

console.log("PASS - outbound email uses only AGAPAY's centrally managed Resend account");
