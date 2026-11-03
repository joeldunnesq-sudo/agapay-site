import { json } from '../lib/core.js';
import { setupAssetAccounts, type AssetAccountSetup } from '../accounting/assets/setup.js';
import { accountingContext } from './accounting-ledger.js';
import {
  acquisitionLines,
  assetDetail,
  assetRegister,
  registerAsset,
  updateAssetMetadata,
  type RegisterInput,
} from '../accounting/assets/service.js';
import { postAssetOperation, previewAssetOperation, type AssetOperation } from '../accounting/assets/posting.js';

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Authorization' };
const reply = (data: unknown, status = 200) => json(data, { status, headers });
export async function handleAccountingAssets(request: Request, env: Partial<Env>, parishId: string) {
  const url = new URL(request.url),
    base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting/assets`;
  if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return null;
  const path = url.pathname.slice(base.length),
    match = path.match(/^\/([^/]+)(?:\/(depreciation-preview|depreciation-post|disposal-preview|dispose))?$/);
  try {
    const ctx = await accountingContext(
      request,
      env,
      parishId,
      request.method === 'GET' || path.endsWith('-preview') ? 'accounting.view' : 'accounting.configure'
    );
    if (!ctx) return reply({ error: 'Unauthorized' }, 401);
    if (ctx.error) return ctx.error;
    const { db, actor } = ctx;
    if (request.method === 'POST' && path === '/account-setup')
      return reply({
        ok: true,
        accounts: await setupAssetAccounts(db, actor, (await request.json()) as AssetAccountSetup),
      });
    if (request.method === 'GET' && !path)
      return reply({
        ok: true,
        ...(await assetRegister(db, actor, url.searchParams.get('asOf') || new Date().toISOString().slice(0, 10))),
      });
    if (request.method === 'GET' && path === '/acquisition-lines')
      return reply({ ok: true, rows: await acquisitionLines(db, actor) });
    if (request.method === 'POST' && !path)
      return reply({ ok: true, asset: await registerAsset(db, actor, (await request.json()) as RegisterInput) }, 201);
    if (match) {
      const id = decodeURIComponent(match[1]),
        action = match[2];
      if (request.method === 'GET' && !action) return reply({ ok: true, ...(await assetDetail(db, actor, id)) });
      if (request.method === 'PATCH' && !action)
        return reply({
          ok: true,
          asset: await updateAssetMetadata(
            db,
            actor,
            id,
            (await request.json()) as Parameters<typeof updateAssetMetadata>[3]
          ),
        });
      if (request.method === 'POST' && action) {
        const input = (await request.json()) as AssetOperation,
          kind = action.startsWith('depreciation') ? 'depreciation' : 'disposal';
        return reply({
          ok: true,
          ...(await (action.endsWith('-preview')
            ? previewAssetOperation(db, actor, id, kind, input)
            : postAssetOperation(db, actor, id, kind, input))),
        });
      }
    }
    return reply({ error: 'Asset route not found' }, 404);
  } catch (error) {
    const failure = error as { status?: number; message?: string; code?: string };
    return reply(
      {
        error: failure.status ? failure.message : 'Asset request failed. Reload and review the asset before retrying.',
        code: failure.code || 'asset_request_failed',
      },
      failure.status || 409
    );
  }
}
