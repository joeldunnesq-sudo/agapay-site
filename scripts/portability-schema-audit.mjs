// Offline audit of schema-only Cloudflare exports; never reads remote row data.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { inspectStorage, D1_SYSTEM_TABLES, quoted } from '../src/portability/catalog.js';
import { PORTABILITY_SCHEMA as ACCOUNTING_SCHEMA } from '../src/portability/accounting-schema.js';
import { barrierStatements, planCentralPurge } from '../src/portability/closure.js';
import { accountingLegacyColumns } from '../src/portability/accounting-legacy.js';

export function sqliteBinding(db) {
  const prepare = sql => ({ sql, params:[], bind(...params) { this.params=params; return this; },
    async all() { return { results:db.prepare(sql).all(...this.params) }; },
    async first() { return db.prepare(sql).get(...this.params) || null; },
    async run() { return { meta:{ changes:db.prepare(sql).run(...this.params).changes } }; },
  });
  return { prepare, async batch(statements) { db.exec('BEGIN'); try { const result=[]; for(const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; } catch(error) { db.exec('ROLLBACK'); throw error; } } };
}
const directory = path.resolve(process.argv[2] || 'artifacts/portability-staging');
const hash = text => createHash('sha256').update(text).digest('hex');
const report = { at:new Date().toISOString(), dataCopied:false, schemas:[] };
mkdirSync(directory,{recursive:true});
for (const kind of ['central','accounting']) {
  const input = readFileSync(path.join(directory,kind + '-schema.sql'),'utf8');
  assert.doesNotMatch(input, /\b(?:ATTACH|DETACH|VACUUM|load_extension)\b/i);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(input);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for (const {name} of tables) assert.equal(db.prepare(`SELECT count(*) n FROM ${quoted(name)}`).get().n,0,`${kind}/${name}: schema-only export must have zero rows`);
    if (kind === 'central') for (const name of ['0108_directory_imports.sql','0109_parish_portability.sql','0110_portability_storage_safeguards.sql']) db.exec(readFileSync(new URL('../migrations/' + name,import.meta.url),'utf8'));
    const binding = sqliteBinding(db);
    let inventory;
    if (kind === 'central') {
      inventory = await inspectStorage(binding);
      for(const sql of barrierStatements(inventory.map(t=>t.name))) db.exec(sql);
      await planCentralPurge({ AGAPAY_DB:binding },{ parish_id:'synthetic-schema-audit',id:'synthetic-schema-audit' },inventory);
    } else {
      inventory=[];
      for(const {name} of tables) {
        if(D1_SYSTEM_TABLES.has(name)) continue;
        const columns=db.prepare(`PRAGMA table_info(${quoted(name)})`).all().map(c=>c.name);
        const known = ACCOUNTING_SCHEMA[name] || accountingLegacyColumns(name);
        assert.ok(known,`Unreviewed accounting table: ${name}`);
        assert.deepEqual(columns.filter(c=>!known.includes(c)),[],`Unreviewed accounting columns in ${name}`);
        inventory.push({name,columns,emptyLegacy:!!accountingLegacyColumns(name)});
      }
    }
    // Use only DDL from the verified empty database; no migration ledger claims.
    const objects=db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all().filter(row=>!D1_SYSTEM_TABLES.has(row.name));
    const output='PRAGMA defer_foreign_keys=ON;\n' + objects.map(row=>row.sql.replace(/;\s*$/,'')+';').join('\n')+'\n';
    writeFileSync(path.join(directory,kind+'-baseline.sql'),output);
    report.schemas.push({kind:kind,inputSha256:hash(input),baselineSha256:hash(output),reviewedTables:inventory.length,objects:objects.length,rows:0});
    console.log(`${kind}: ${inventory.length} reviewed tables, zero copied rows, baseline ${hash(output)}`);
  } finally { db.close(); }
}
writeFileSync(path.join(directory,'schema-audit.json'),JSON.stringify(report,null,2)+'\n');
