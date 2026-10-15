import type { PortabilityEnvironment } from '../portability/contracts.js';
import { assertParishWritable, objectOwnership } from '../portability/storage.js';
import { parsePublicMediaPath, workerPublicMediaDeliveryEnabled } from '../portability/public-media.js';

const headersFor = (object: R2Object) => {
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

const unavailable = (status = 404) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function handlePublicParishAsset(request: Request, env: PortabilityEnvironment) {
  if (!['GET', 'HEAD'].includes(request.method)) return unavailable(405);
  if (!workerPublicMediaDeliveryEnabled(env)) return unavailable();
  const target = parsePublicMediaPath(new URL(request.url).pathname);
  if (!target || !((env as Record<string, unknown>)[target.binding] as R2Bucket)) return unavailable();
  const owner = await objectOwnership(env, target.binding, target.key);
  if (!owner || owner.state !== 'stored' || !owner.parish_id) return unavailable();
  try {
    await assertParishWritable(env, owner.parish_id);
  } catch (error) {
    if ((error as { code?: unknown } | null | undefined)?.code === 'parish_closed') return unavailable(410);
    throw error;
  }
  try {
    if (request.method === 'HEAD') {
      const head = await ((env as Record<string, unknown>)[target.binding] as R2Bucket).head(target.key);
      return head && head.etag === owner.etag
        ? new Response(null, { status: 200, headers: headersFor(head) })
        : unavailable();
    }
    const rangeRequested = request.headers.has('range');
    const object = await ((env as Record<string, unknown>)[target.binding] as R2Bucket).get(
      target.key,
      rangeRequested ? { range: request.headers } : undefined
    );
    if (!object?.body || object.etag !== owner.etag) return unavailable();
    const headers = headersFor(object);
    let status = 200;
    if (
      object.range &&
      Number.isSafeInteger((object.range as { offset: number; length: number }).offset) &&
      Number.isSafeInteger((object.range as { offset: number; length: number }).length)
    ) {
      status = 206;
      headers.set('Content-Length', String((object.range as { offset: number; length: number }).length));
      headers.set(
        'Content-Range',
        `bytes ${(object.range as { offset: number; length: number }).offset}-${(object.range as { offset: number; length: number }).offset + (object.range as { offset: number; length: number }).length - 1}/${object.size}`
      );
    }
    return new Response(object.body, { status, headers });
  } catch (error) {
    if ((error as { code?: unknown } | null | undefined)?.code === 'parish_closed') return unavailable(410);
    if (request.headers.has('range')) return unavailable(416);
    throw error;
  }
}
