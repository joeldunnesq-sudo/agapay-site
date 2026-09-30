// Generated from src/lib/giving-statement-storage.ts by npm run build:server. Do not edit.
function generateGivingStatementStorageKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `gstmt/${hex}`;
}
async function putGivingStatementPdf(env, { parishId, storageKey, bytes }) {
  if (!env.GIVING_STATEMENTS) {
    throw new Error('GIVING_STATEMENTS R2 binding is not configured');
  }
  await env.GIVING_STATEMENTS.put(storageKey, bytes, {
    customMetadata: { agapayParishId: parishId },
    httpMetadata: { contentType: 'application/pdf' },
  });
}
async function streamGivingStatementPdf(env, { storageKey, filename }) {
  if (!env.GIVING_STATEMENTS) {
    return new Response('Storage not configured', { status: 500 });
  }
  const object = await env.GIVING_STATEMENTS.get(storageKey);
  if (!object) {
    return new Response('Statement not found', { status: 404 });
  }
  const safeName = String(filename || 'giving-statement.pdf').replace(/[^\x20-\x7e]/g, '_');
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
async function deleteGivingStatementPdf(env, storageKey) {
  if (!env.GIVING_STATEMENTS || !storageKey) return;
  await env.GIVING_STATEMENTS.delete(storageKey);
}
export { deleteGivingStatementPdf, generateGivingStatementStorageKey, putGivingStatementPdf, streamGivingStatementPdf };
