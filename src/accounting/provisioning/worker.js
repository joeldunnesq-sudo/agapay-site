import { WorkerEntrypoint, WorkflowEntrypoint } from 'cloudflare:workers';
import { createCloudflareD1ProvisioningAdapter, createD1DatabaseFacade } from './adapters.js';
import {
  activationDto,
  activationEnvironment,
  activationOperation,
  activationProgress,
  completeActivation,
  first,
  requireActivationParish,
  reserveActivation,
  run,
} from './activation.js';
import { provisioningMigrations } from './schema.generated.js';
import {
  applyAccountingMigration,
  initializeProvisionedCalendar,
  prepareAccountingMigrationLedger,
  seedBeforeIntegrationMigration,
  validateProvisionedBooks,
} from './full-schema.js';
import { synchronizeGivingCatalogIntoDatabase } from '../source-wiring.js';

const provider = (env) =>
  createCloudflareD1ProvisioningAdapter({
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: env.ACCOUNTING_D1_API_TOKEN,
  });
const configured = (env) =>
  Boolean(env.ACCOUNTING_D1_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.ACCOUNTING_ACTIVATION);

// No public HTTP routes. Only the authenticated application has this service binding.
export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export class AccountingProvisionerService extends WorkerEntrypoint {
  async status(parishId) {
    await requireActivationParish(this.env, parishId);
    const operation = await activationOperation(this.env, parishId);
    const dto = activationDto(operation, configured(this.env));
    if (operation && ['running', 'pending'].includes(operation.status)) {
      try {
        const state = await (await this.env.ACCOUNTING_ACTIVATION.get(operation.id)).status();
        if (['errored', 'terminated'].includes(state.status))
          return {
            ...dto,
            status: 'failed',
            retryable: true,
            message: 'Setup was interrupted. Retry to resume the same books.',
          };
      } catch {
        /* A reserved job may not have been dispatched yet. POST resumes it. */
      }
    }
    return dto;
  }

  async start(parishId, options) {
    if (!configured(this.env))
      throw new Error('Automatic Accounting setup is not configured yet. Contact AGAPAY support.');
    const operation = await reserveActivation(this.env, parishId, options);
    if (operation.status === 'ready') return activationDto(operation);
    let instance;
    try {
      instance = await this.env.ACCOUNTING_ACTIVATION.get(operation.id);
      const state = await instance.status();
      if (['errored', 'terminated'].includes(state.status)) {
        if (operation.failure_code === 'ownership_review') throw new Error('Accounting ownership review is required.');
        const lease = await run(
          this.env,
          `UPDATE accounting_provisioning_operations SET lease_token=?,lease_expires_at=datetime('now','+2 minutes')
          WHERE id=? AND (lease_expires_at IS NULL OR lease_expires_at<datetime('now'))`,
          crypto.randomUUID(),
          operation.id
        );
        if (lease.meta?.changes) await instance.restart();
      }
    } catch (error) {
      if (instance && operation.failure_code === 'ownership_review') throw error;
      // Deterministic Workflow IDs make dispatch safe after a lost HTTP response.
      try {
        await this.env.ACCOUNTING_ACTIVATION.create({
          id: operation.id,
          params: { parishId, operationId: operation.id },
        });
      } catch {
        await (await this.env.ACCOUNTING_ACTIVATION.get(operation.id)).status();
      }
    }
    return this.status(parishId);
  }

  async resolve(databaseName) {
    try {
      const record = await this.managedDatabase(databaseName);
      return record ? { providerId: databaseName, name: databaseName } : null;
    } catch (error) {
      if (error?.name === 'ValidationError') return null;
      throw error;
    }
  }

  async managedDatabase(databaseName) {
    const record = await first(
      this.env,
      `SELECT o.provider_id,e.parish_id,o.id FROM accounting_databases d
      JOIN accounting_entities e ON e.id=d.accounting_entity_id
      JOIN accounting_provisioning_operations o ON o.accounting_entity_id=e.id AND o.environment=d.environment
      WHERE d.database_identifier=? AND d.environment=? AND o.idempotency_key='activation-v1'
        AND e.entity_status='ready' AND e.activation_status='active' AND d.provisioning_status='ready'
        AND d.health_status='healthy' AND o.status='ready'`,
      databaseName,
      activationEnvironment(this.env)
    );
    if (!record?.provider_id) return null;
    await requireActivationParish(this.env, record.parish_id);
    return record;
  }

  async query(databaseName, statements) {
    const record = await this.managedDatabase(databaseName);
    if (!record) throw new Error('Accounting books are unavailable.');
    const adapter = provider(this.env);
    const rows = await adapter.execute(
      record.provider_id,
      "SELECT key,value FROM accounting_database_metadata WHERE key IN('parish_id','provisioning_operation_id','environment')"
    );
    const identity = Object.fromEntries(rows[0].results.map((row) => [row.key, row.value]));
    if (
      identity.parish_id !== record.parish_id ||
      identity.provisioning_operation_id !== record.id ||
      identity.environment !== activationEnvironment(this.env)
    )
      throw new Error('Accounting ownership verification failed.');
    return adapter.batch(record.provider_id, statements);
  }
}

export class AccountingProvisioningWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const env = this.env;
    const operation = await activationOperation(env, event.payload.parishId);
    if (!operation || operation.id !== event.payload.operationId || operation.status === 'ready') return;
    const adapter = provider(env);
    const perform = (name, callback) =>
      step.do(
        name,
        { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
        async () => {
          await requireActivationParish(env, operation.parish_id);
          const entity = await first(
            env,
            'SELECT entity_status FROM accounting_entities WHERE id=?',
            operation.accounting_entity_id
          );
          if (!['provisioning', 'provisioned', 'migrating'].includes(entity?.entity_status))
            throw new Error('Accounting activation is no longer allowed.');
          return callback();
        }
      );
    try {
      const providerId = await perform('Create isolated books', async () => {
        await activationProgress(env, operation, 'database');
        const current = await activationOperation(env, operation.parish_id);
        let database = await adapter.findByName(operation.database_identifier);
        if (database && current.provider_id !== database.providerId) {
          await run(
            env,
            "UPDATE accounting_provisioning_operations SET failure_code='ownership_review' WHERE id=?",
            operation.id
          );
          throw new Error('Existing database needs independent ownership review.');
        }
        if (!database) {
          if (current.provider_id) throw new Error('Previously reserved books are missing.');
          database = await adapter.create(operation.database_identifier);
          await run(
            env,
            'UPDATE accounting_provisioning_operations SET provider_id=? WHERE id=? AND provider_id IS NULL',
            database.providerId,
            operation.id
          );
        }
        const db = createD1DatabaseFacade(adapter, database.providerId);
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS accounting_database_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT(datetime('now')))`
          )
          .run();
        const expected = {
          parish_id: operation.parish_id,
          environment: operation.environment,
          provisioning_operation_id: operation.id,
        };
        const rows = (await db.prepare('SELECT key,value FROM accounting_database_metadata').all()).results;
        for (const row of rows)
          if (row.key in expected && expected[row.key] !== row.value) throw new Error('Accounting ownership mismatch.');
        await db.batch(
          Object.entries(expected).map(([key, value]) =>
            db.prepare('INSERT OR IGNORE INTO accounting_database_metadata(key,value) VALUES(?,?)').bind(key, value)
          )
        );
        await prepareAccountingMigrationLedger(db);
        return database.providerId;
      });
      const db = createD1DatabaseFacade(adapter, providerId);
      for (let index = 0; index < provisioningMigrations.length; index++) {
        const migration = provisioningMigrations[index];
        await perform(`Schema ${migration.name}`, async () => {
          await activationProgress(env, operation, 'schema', index);
          await applyAccountingMigration(db, migration);
          await seedBeforeIntegrationMigration(db, migration);
          await run(
            env,
            "UPDATE accounting_entities SET entity_status='migrating' WHERE id=? AND entity_status IN('provisioning','provisioned')",
            operation.accounting_entity_id
          );
        });
      }
      await perform('Set up fiscal calendar', async () => {
        await activationProgress(env, operation, 'calendar', provisioningMigrations.length);
        await initializeProvisionedCalendar(db, JSON.parse(operation.options_json), operation.id);
      });
      await perform('Bring over giving funds', async () => {
        await activationProgress(env, operation, 'funds', provisioningMigrations.length);
        await synchronizeGivingCatalogIntoDatabase(db, await requireActivationParish(env, operation.parish_id));
      });
      await perform('Validate and activate books', async () => {
        await activationProgress(env, operation, 'validation', provisioningMigrations.length);
        await validateProvisionedBooks(db, operation.parish_id, provisioningMigrations);
        await completeActivation(env, operation, provisioningMigrations.at(-1));
      });
    } catch (error) {
      await run(
        env,
        `UPDATE accounting_provisioning_operations SET status='failed',failure_code=COALESCE(failure_code,'setup_failed'),
        failure_message='Setup paused safely.',updated_at=datetime('now') WHERE id=? AND status!='ready'`,
        operation.id
      );
      throw error;
    }
  }
}
