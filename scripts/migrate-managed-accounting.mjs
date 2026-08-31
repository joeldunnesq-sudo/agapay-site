// Release-only command. The CI deployment token never becomes a Worker runtime secret.
import { readFileSync } from 'node:fs';
import {
  createCloudflareD1ProvisioningAdapter,
  createD1DatabaseFacade,
} from '../src/accounting/provisioning/adapters.js';
import { applyAccountingMigration, validateProvisionedBooks } from '../src/accounting/provisioning/full-schema.js';
import {
  loadAccountingMigrationManifest,
  validateAccountingMigrationManifest,
} from './lib/accounting-migration-ledger.mjs';

if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('A release-scoped Cloudflare credential is required.');
const config = JSON.parse(readFileSync('wrangler.accounting-provisioner.json', 'utf8'));
const adapter = createCloudflareD1ProvisioningAdapter({
  CLOUDFLARE_ACCOUNT_ID: config.vars.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
});
const central = createD1DatabaseFacade(adapter, config.d1_databases[0].database_id);
const manifest = validateAccountingMigrationManifest(process.cwd(), loadAccountingMigrationManifest(process.cwd()));
const migrations = manifest.migrations.map((item) => ({
  ...item,
  sql: readFileSync(`accounting-migrations/${item.name}`, 'utf8'),
}));
const operations = (
  await central
    .prepare(
      `SELECT o.id,o.provider_id,o.accounting_entity_id,e.parish_id,d.database_identifier FROM accounting_provisioning_operations o
  JOIN accounting_entities e ON e.id=o.accounting_entity_id JOIN accounting_databases d ON d.accounting_entity_id=e.id AND d.environment=o.environment
  WHERE o.environment='production' AND o.idempotency_key='activation-v1' AND o.status='ready' AND e.entity_status='ready'
    AND NOT EXISTS(SELECT 1 FROM parish_data_closures c WHERE c.parish_id=e.parish_id)`
    )
    .all()
).results;
for (const operation of operations) {
  const resource = await adapter.findByName(operation.database_identifier);
  if (!resource || resource.providerId !== operation.provider_id)
    throw new Error(`Managed Accounting identity mismatch: ${operation.id}`);
  const db = createD1DatabaseFacade(adapter, operation.provider_id);
  const identity = Object.fromEntries(
    (
      await db
        .prepare(
          "SELECT key,value FROM accounting_database_metadata WHERE key IN('parish_id','environment','provisioning_operation_id')"
        )
        .all()
    ).results.map((row) => [row.key, row.value])
  );
  if (
    identity.parish_id !== operation.parish_id ||
    identity.environment !== 'production' ||
    identity.provisioning_operation_id !== operation.id
  )
    throw new Error(`Managed Accounting ownership mismatch: ${operation.id}`);
  await central
    .prepare(
      "UPDATE accounting_databases SET provisioning_status='migrating',updated_at=datetime('now') WHERE accounting_entity_id=? AND environment='production'"
    )
    .bind(operation.accounting_entity_id)
    .run();
  // Any failure leaves the books unavailable rather than declaring a partial migration healthy.
  for (const migration of migrations) await applyAccountingMigration(db, migration);
  await validateProvisionedBooks(db, operation.parish_id, migrations);
  const last = migrations.at(-1);
  await central
    .prepare(
      `UPDATE accounting_databases SET provisioning_status='ready',health_status='healthy',schema_version=?,migration_version=?,last_validated_at=datetime('now')
    WHERE accounting_entity_id=? AND environment='production'`
    )
    .bind(Number(last.name.slice(0, 4)), last.name.replace('.sql', ''), operation.accounting_entity_id)
    .run();
  console.log(`Validated managed Accounting schema: ${operation.id}`);
}
console.log(`Managed Accounting migration complete: ${operations.length} database(s).`);
