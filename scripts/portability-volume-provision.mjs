// Provisions a separate synthetic-only volume environment. It never reads or
// binds production resources and does not deploy an application Worker.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unstable_splitSqlQuery } from 'wrangler';

const create = process.argv.includes('--create');
assert.ok(process.argv.slice(2).every(argument => argument === '--create'));
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'artifacts', 'portability-volume-hosted');
const prefix = 'agapay-portability-volume-20260829';
const names = {
  d1: { AGAPAY_DB: `${prefix}-central`, VOLUME_BOOKS: `${prefix}-books` },
  kv: { AGAPAY_REGISTRATIONS: `${prefix}-legacy` },
  r2: { PARISH_EXPORTS: `${prefix}-exports` },
};
if (!create) {
  console.log(JSON.stringify({ prefix, ...names, deploy: false, productionChanges: false }, null, 2));
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
const manifestPath = path.join(dir, 'resources.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { prefix, createdAt: new Date().toISOString(), d1: {}, kv: {}, r2: {}, safeguards: {} };
assert.equal(manifest.prefix, prefix);
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
function cli(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (result.status !== 0) throw new Error(`${args.slice(0, 5).join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '');
}
for (const [binding, name] of Object.entries(names.d1)) {
  if (!manifest.d1[binding]) {
    const output = cli(['d1', 'create', name, '--update-config=false']);
    const id = output.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
    assert.ok(id, output); manifest.d1[binding] = { name, id }; save();
    console.log(`Created isolated D1 ${name}`);
  }
  assert.equal(manifest.d1[binding].name, name);
}
for (const [binding, name] of Object.entries(names.kv)) {
  if (!manifest.kv[binding]) {
    const output = cli(['kv', 'namespace', 'create', name, '--update-config=false']);
    const id = output.match(/["']?id["']?\s*[:=]\s*["']([a-f0-9]{32})["']/i)?.[1];
    assert.ok(id, output); manifest.kv[binding] = { name, id }; save();
    console.log(`Created isolated KV ${name}`);
  }
  assert.equal(manifest.kv[binding].name, name);
}
for (const [binding, name] of Object.entries(names.r2)) {
  if (!manifest.r2[binding]) { cli(['r2', 'bucket', 'create', name]); manifest.r2[binding] = { name }; save(); console.log(`Created isolated R2 ${name}`); }
  assert.equal(manifest.r2[binding].name, name);
  if (!manifest.safeguards[binding]) {
    cli(['r2', 'bucket', 'dev-url', 'disable', name]);
    manifest.safeguards[binding] = { publicAccess: cli(['r2', 'bucket', 'dev-url', 'get', name]), domains: cli(['r2', 'bucket', 'domain', 'list', name]) }; save();
  }
}
if (!manifest.safeguards.exportExpiry) {
  cli(['r2', 'bucket', 'lifecycle', 'add', names.r2.PARISH_EXPORTS, 'volume-expiry', 'parish-exports/', '--expire-days', '1', '--force']);
  manifest.safeguards.exportExpiry = true; save();
}
manifest.safeguards.lifecycle = cli(['r2', 'bucket', 'lifecycle', 'list', names.r2.PARISH_EXPORTS]);
for (const [binding, fixture] of [['AGAPAY_DB', 'portability-central-schema.sql'], ['VOLUME_BOOKS', 'portability-accounting-schema.sql']]) {
  const input = readFileSync(path.join(root, 'scripts', 'fixtures', fixture), 'utf8');
  const hash = createHash('sha256').update(input).digest('hex');
  if (manifest.d1[binding].schemaSha256) { assert.equal(manifest.d1[binding].schemaSha256, hash); continue; }
  const idempotent = unstable_splitSqlQuery(input).map(statement => statement.replace(/^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) (?!IF NOT EXISTS)/i, 'CREATE $1 IF NOT EXISTS ')).join(';\n') + ';\n';
  const schemaPath = path.join(dir, `${binding.toLowerCase()}-schema.sql`);
  writeFileSync(schemaPath, idempotent);
  cli(['d1', 'execute', names.d1[binding], '--remote', '--file', schemaPath, '--yes']);
  manifest.d1[binding].schemaSha256 = hash; save();
  console.log(`Installed reviewed ${binding} schema`);
}
const config = {
  name: prefix,
  account_id: '9198ae5ea8adc59e5dedd1b09c9478b9',
  compatibility_date: '2026-05-25',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  vars: { AGAPAY_ENVIRONMENT: 'staging', PARISH_PORTABILITY_ENABLED: 'false', PARISH_STORAGE_GUARDS_ENABLED: 'false', PARISH_AUTOMATIC_CLOSURE_ENABLED: 'false' },
  d1_databases: Object.entries(manifest.d1).map(([binding, resource]) => ({ binding, database_name: resource.name, database_id: resource.id, remote: true })),
  kv_namespaces: Object.entries(manifest.kv).map(([binding, resource]) => ({ binding, id: resource.id, remote: true })),
  r2_buckets: Object.entries(manifest.r2).map(([binding, resource]) => ({ binding, bucket_name: resource.name, remote: true })),
  triggers: { crons: [] },
};
writeFileSync(path.join(dir, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
save();
console.log('Isolated hosted volume resources configured. No Worker deployed and production was not read or changed.');
