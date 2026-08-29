import { json, rateLimit } from '../lib/core.js';
import { DirectoryServiceError } from '../directory/foundation.js';
import { authorizeDirectoryImport, previewDirectoryImport, startDirectoryImport, processDirectoryImport, getDirectoryImport, listDirectoryImports } from '../directory/imports.js';
import { findRegistrationByParishId } from './parish.js';

const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (data, status = 200) => json({ ok: true, ...data }, { status, headers });

export async function readDirectoryImportBody(request) {
  const max = 1024 * 1024;
  if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new DirectoryServiceError('unsupported_type', 'Send the reviewed rows as JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > max) throw new DirectoryServiceError('too_large', 'Import data exceeds 1 MB.', 413);
  if (!request.body) throw new DirectoryServiceError('validation_failed', 'Import data is required.', 422);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new DirectoryServiceError('too_large', 'Import data exceeds 1 MB.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw new DirectoryServiceError('validation_failed', 'Import data must be valid JSON.', 422); }
}

export async function handleDirectoryImports(request, env, context, path) {
  if (path !== '/imports' && !path.startsWith('/imports/')) return null;
  authorizeDirectoryImport(context);
  if (request.method === 'GET' && path === '/imports') return reply({ imports: await listDirectoryImports(env, { context }) });
  if (request.method === 'POST') {
    const limited = await rateLimit(request, env, `directory-import:${context.parishId}`, { limit: 200, windowSeconds: 300 });
    if (limited) return limited;
    const data = await readDirectoryImportBody(request);
    if (path === '/imports/preview') return reply({ preview: await previewDirectoryImport(env, { context, rows: data.rows }) });
    if (path === '/imports') return reply({ batch: await startDirectoryImport(env, { context, rows: data.rows, previewHash: data.previewHash, filename: data.filename, sendInvitations: data.sendInvitations, confirmed: data.confirmed, requestKey: data.requestKey }) }, 201);
    const process = path.match(/^\/imports\/([a-zA-Z0-9_-]+)\/process$/);
    if (process) {
      const found = await findRegistrationByParishId(env, context.parishId);
      return reply({ batch: await processDirectoryImport(env, { context, id: process[1], retryFailed: data.retryFailed === true, parishName: found?.registration?.parishName || 'Your parish' }) });
    }
  }
  const item = path.match(/^\/imports\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && item) return reply({ batch: await getDirectoryImport(env, { context, id: item[1] }) });
  return json({ ok: false, message: 'Import route not found.' }, { status: 404, headers });
}
