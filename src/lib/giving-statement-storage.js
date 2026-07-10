// src/lib/giving-statement-storage.js
//
// Private document storage for annual donor giving statements. Uses a
// dedicated, non-public R2 binding (GIVING_STATEMENTS) -- never the public
// CAMPAIGN_ASSETS bucket. Every access goes through a Worker route that
// re-checks authorization (parish dashboard bearer token, or the owning
// donor's session) on every request and streams the object directly.
//
// Mirrors src/lib/tax-exemption-storage.js: a fully randomized object key
// with no parish id, donor email, or fiscal year embedded in it, so the key
// itself leaks nothing and can't be guessed/enumerated. Ownership is
// resolved via the giving_statements D1 row, never via the storage key.

export function generateGivingStatementStorageKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `gstmt/${hex}`;
}

export async function putGivingStatementPdf(env, { storageKey, bytes }) {
  if (!env.GIVING_STATEMENTS) {
    throw new Error("GIVING_STATEMENTS R2 binding is not configured");
  }
  await env.GIVING_STATEMENTS.put(storageKey, bytes, {
    httpMetadata: { contentType: "application/pdf" }
  });
}

/**
 * Streams a stored statement PDF back as a Response with safe headers.
 * Caller must already have authorized the request and resolved the correct
 * giving_statements row before calling this.
 */
export async function streamGivingStatementPdf(env, { storageKey, filename }) {
  if (!env.GIVING_STATEMENTS) {
    return new Response("Storage not configured", { status: 500 });
  }
  const object = await env.GIVING_STATEMENTS.get(storageKey);
  if (!object) {
    return new Response("Statement not found", { status: 404 });
  }
  const safeName = String(filename || "giving-statement.pdf").replace(/[^\x20-\x7e]/g, "_");
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

export async function deleteGivingStatementPdf(env, storageKey) {
  if (!env.GIVING_STATEMENTS || !storageKey) return;
  await env.GIVING_STATEMENTS.delete(storageKey);
}
