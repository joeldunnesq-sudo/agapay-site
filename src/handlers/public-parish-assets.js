import { POLICY_VERSION } from '../portability/catalog.js';
import { assertParishWritable, objectOwnership } from '../portability/storage.js';
import { parsePublicMediaPath, workerPublicMediaVerified } from '../portability/public-media.js';

const headersFor = object => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Accept-Ranges': 'bytes',
  });
  object?.writeHttpMetadata?.(headers);
  headers.set('Cache-Control', 'no-store');
  if (Number(object?.size) >= 0) headers.set('Content-Length', String(object.size));
  return headers;
};

const unavailable = (status = 404) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handlePublicParishAsset(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return unavailable(405);
  if (env.PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED !== POLICY_VERSION || !workerPublicMediaVerified(env)) return unavailable();
  const target = parsePublicMediaPath(new URL(request.url).pathname);
  if (!target || !env[target.binding]) return unavailable();
  const owner = await objectOwnership(env, target.binding, target.key);
  if (!owner || owner.state !== 'stored' || !owner.parish_id) return unavailable();
  try { await assertParishWritable(env, owner.parish_id); }
  catch (error) { if (error?.code === 'parish_closed') return unavailable(410); throw error; }
  try {
    if (request.method === 'HEAD') {
      const head = await env[target.binding].head(target.key);
      return head && head.etag === owner.etag ? new Response(null, { status: 200, headers: headersFor(head) }) : unavailable();
    }
    const rangeRequested = request.headers.has('range');
    const object = await env[target.binding].get(target.key, rangeRequested ? { range: request.headers } : undefined);
    if (!object?.body || object.etag !== owner.etag) return unavailable();
    const headers = headersFor(object);
    let status = 200;
    if (object.range && Number.isSafeInteger(object.range.offset) && Number.isSafeInteger(object.range.length)) {
      status = 206;
      headers.set('Content-Length', String(object.range.length));
      headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    }
    return new Response(object.body, { status, headers });
  } catch (error) {
    if (error?.code === 'parish_closed') return unavailable(410);
    if (request.headers.has('range')) return unavailable(416);
    throw error;
  }
}
