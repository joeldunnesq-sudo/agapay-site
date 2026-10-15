// Generated from src/lib/accounting-availability.ts by npm run build:server. Do not edit.
import { d1 } from './core.js';
import { accountingEnabledFor } from './entitlements.js';
import { loadAccountingDatabaseForEntity, loadAccountingEntityByParish } from '../accounting/control-plane.js';
import { detectAccountingEnvironment } from '../accounting/environment.js';
async function accountingReadinessForParish(env, parishId, registration) {
  if (!accountingEnabledFor(registration)) return { status: 'not_included', ready: false };
  const entity = d1(env) ? await loadAccountingEntityByParish(env, parishId) : null;
  if (!entity) return { status: 'setup_required', ready: false };
  const registry = await loadAccountingDatabaseForEntity(env, entity.id, detectAccountingEnvironment(env));
  const ready =
    entity.entityStatus === 'ready' &&
    entity.activationStatus === 'active' &&
    registry?.provisioningStatus === 'ready' &&
    registry?.healthStatus === 'healthy';
  return { status: ready ? 'ready' : 'unavailable', ready };
}
async function accountingCatalogRequiredForParish(env, parishId, registration) {
  const linked = [...(registration.funds || []), ...(registration.campaigns || [])].some(
    (item) => item.accountingFundId
  );
  return linked || Boolean(d1(env) && (await loadAccountingEntityByParish(env, parishId)));
}
export { accountingCatalogRequiredForParish, accountingReadinessForParish };
