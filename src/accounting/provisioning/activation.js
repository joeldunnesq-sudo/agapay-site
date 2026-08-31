import { accountingEnabledFor } from '../../lib/entitlements.js';
import { parishClosureState } from '../../portability/closure.js';
import { detectAccountingEnvironment } from '../environment.js';
import { deterministicAccountingDatabaseName } from './naming.js';
import { ValidationError } from '../errors.js';

export const ACTIVATION_STEPS = ['queued', 'database', 'schema', 'calendar', 'funds', 'validation', 'ready'];
export const activationEnvironment = (env) => detectAccountingEnvironment(env);
export const first = (env, sql, ...params) =>
  env.AGAPAY_DB.prepare(sql)
    .bind(...params)
    .first();
export const run = (env, sql, ...params) =>
  env.AGAPAY_DB.prepare(sql)
    .bind(...params)
    .run();

export function activationOptions(input = {}) {
  const startDate = String(input.startDate || '');
  const date = new Date(`${startDate}T12:00:00Z`);
  const fiscalYearStartMonth = Number(input.fiscalYearStartMonth);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== startDate ||
    date.getUTCFullYear() < 2000 ||
    date.getUTCFullYear() > new Date().getUTCFullYear() + 1 ||
    !Number.isInteger(fiscalYearStartMonth) ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  )
    throw new ValidationError('Choose a valid accounting start date and fiscal-year start month.');
  return { startDate, fiscalYearStartMonth }; // Explicit allowlist: no uploaded files, PINs or provider identifiers.
}

export async function requireActivationParish(env, parishId) {
  if (await parishClosureState(env, parishId)) throw new ValidationError('This parish is closed.');
  const row = await first(
    env,
    `SELECT data FROM registrations WHERE parish_id=?
    ORDER BY COALESCE(json_extract(data,'$.updatedAt'),updated_at,received_at) DESC,updated_at DESC,reference DESC LIMIT 1`,
    parishId
  );
  const registration = row ? JSON.parse(row.data) : null;
  if (registration?.status !== 'verified' || !accountingEnabledFor(registration))
    throw new ValidationError('An eligible, verified parish is required to activate Accounting.');
  return registration;
}

export async function activationOperation(env, parishId) {
  return first(
    env,
    `SELECT o.*, e.parish_id, e.entity_status, e.activation_status, d.database_identifier,
    d.provisioning_status, d.health_status FROM accounting_provisioning_operations o
    JOIN accounting_entities e ON e.id=o.accounting_entity_id
    JOIN accounting_databases d ON d.accounting_entity_id=e.id AND d.environment=o.environment
    WHERE e.parish_id=? AND o.environment=? AND o.idempotency_key='activation-v1'`,
    parishId,
    activationEnvironment(env)
  );
}

export function activationDto(operation, available = true) {
  return operation
    ? {
        available,
        status: operation.status,
        step: operation.progress_step,
        migrationCount: Number(operation.progress_current),
        options: JSON.parse(operation.options_json),
        reference: operation.correlation_id,
        completed: Boolean(operation.wizard_completed_at),
        retryable: operation.status === 'failed' && operation.failure_code !== 'ownership_review',
        message:
          operation.status === 'failed'
            ? operation.failure_code === 'ownership_review'
              ? 'The books need an ownership review. Contact AGAPAY support with this reference.'
              : 'Setup paused safely. Your books were preserved. You can retry without creating another database.'
            : '',
      }
    : { available, status: 'not_started', step: 'queued', completed: false };
}

export async function reserveActivation(env, parishId, input) {
  const registration = await requireActivationParish(env, parishId);
  const previous = await activationOperation(env, parishId);
  if (previous) return previous;
  const options = activationOptions(input);
  if (await first(env, 'SELECT id FROM accounting_entities WHERE parish_id=?', parishId))
    throw new ValidationError('Existing Accounting books require support review; they will not be replaced.');
  const environment = activationEnvironment(env);
  const databaseName = await deterministicAccountingDatabaseName({ parishId, environment });
  const suffix = databaseName.slice(-20),
    entityId = `acct_entity_${suffix}`,
    operationId = `activation-${environment}-${suffix}`;
  const prepare = (sql, ...params) => env.AGAPAY_DB.prepare(sql).bind(...params);
  // One central transaction: competing tabs cannot reserve duplicate resources or leave half an entity.
  await env.AGAPAY_DB.batch([
    prepare(
      `INSERT OR IGNORE INTO accounting_entities(id,parish_id,entity_status,subscription_tier)
      VALUES(?,?,'provisioning',?)`,
      entityId,
      parishId,
      registration.subscriptionTier || 'parish'
    ),
    prepare(
      `INSERT OR IGNORE INTO accounting_databases(id,accounting_entity_id,environment,database_identifier,provisioning_status)
      VALUES(?,?,?,?,'provisioning')`,
      `acct_db_${suffix}`,
      entityId,
      environment,
      databaseName
    ),
    prepare(
      `INSERT OR IGNORE INTO accounting_provisioning_operations(id,accounting_entity_id,environment,idempotency_key,correlation_id,options_json)
      VALUES(?,?,?,'activation-v1',?,?)`,
      operationId,
      entityId,
      environment,
      operationId,
      JSON.stringify(options)
    ),
    prepare(
      `INSERT OR IGNORE INTO accounting_lifecycle_events(id,accounting_entity_id,event_type,from_state,to_state,actor_type,reason,correlation_id)
      VALUES(?,?,'accounting.activation.requested','not_enabled','provisioning','parish','Parish administrator requested guided activation',?)`,
      `${operationId}-requested`,
      entityId,
      operationId
    ),
  ]);
  return activationOperation(env, parishId);
}

export async function activationProgress(env, operation, step, count = 0) {
  await run(
    env,
    `UPDATE accounting_provisioning_operations SET status='running',progress_step=?,progress_current=?,
    failure_code=NULL,failure_message=NULL,started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND status!='ready'`,
    step,
    count,
    operation.id
  );
}

export async function completeActivation(env, operation, latestMigration) {
  await requireActivationParish(env, operation.parish_id);
  const prepare = (sql, ...params) => env.AGAPAY_DB.prepare(sql).bind(...params);
  await env.AGAPAY_DB.batch([
    prepare(
      `UPDATE accounting_databases SET provisioning_status='ready',health_status='healthy',schema_version=?,migration_version=?,
      provisioned_at=COALESCE(provisioned_at,datetime('now')),last_validated_at=datetime('now'),updated_at=datetime('now') WHERE accounting_entity_id=? AND environment=?`,
      Number(latestMigration.name.slice(0, 4)),
      latestMigration.name.replace('.sql', ''),
      operation.accounting_entity_id,
      operation.environment
    ),
    prepare(
      `UPDATE accounting_entities SET entity_status='ready',activation_status='active',enabled_at=COALESCE(enabled_at,datetime('now')),updated_at=datetime('now')
      WHERE id=? AND entity_status IN('provisioning','provisioned','migrating','ready')`,
      operation.accounting_entity_id
    ),
    prepare(
      `UPDATE accounting_provisioning_operations SET status='ready',progress_step='ready',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
      operation.id
    ),
    prepare(
      `INSERT OR IGNORE INTO accounting_lifecycle_events(id,accounting_entity_id,event_type,from_state,to_state,actor_type,correlation_id)
      VALUES(?,?,'accounting.activation.ready','migrating','ready','system',?)`,
      `${operation.id}-ready`,
      operation.accounting_entity_id,
      operation.id
    ),
  ]);
}
