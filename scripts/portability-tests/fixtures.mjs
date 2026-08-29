import { readFileSync } from 'node:fs';
import { directoryImportFixture } from '../directory-import-fixture.mjs';
import { issueParishDashboardSession } from '../../src/lib/core.js';
import { POLICY_VERSION, inspectStorage } from '../../src/portability/catalog.js';
import { sha256, utf8 } from '../../src/portability/archive.js';
import { barrierStatements } from '../../src/portability/closure.js';
import { RETENTION_DISCLOSURE_VERSION } from '../../src/portability/policy.js';
import { actorFingerprint, startExport, processExport, confirmClosure } from '../../src/portability/service.js';

export function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    failDelete: false,
    async put(key, bytes, options = {}) {
      if (options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null;
      const value = typeof bytes === 'string' ? utf8(bytes) : new Uint8Array(bytes);
      objects.set(key, { key, bytes: value, etag: await sha256(value), size: value.length, ...options });
      return this.head(key);
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { ...object } : null;
    },
    async get(key, options = {}) {
      const value = objects.get(key);
      if (!value) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== value.etag) return { ...value };
      return {
        ...value,
        body: new Response(value.bytes).body,
        async text() { return new TextDecoder().decode(value.bytes); },
        async arrayBuffer() { return value.bytes.slice().buffer; },
      };
    },
    async list({ prefix = '' } = {}) {
      return { objects: [...objects.values()].filter(object => object.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key)), truncated: false };
    },
    async delete(key) {
      if (this.failDelete) throw new Error('synthetic storage failure');
      objects.delete(key);
    },
  };
}

export function sqliteBinding(db) {
  const prepare = sql => ({
    sql,
    params: [],
    bind(...params) { this.params = params; return this; },
    async all() { return { results: db.prepare(sql).all(...this.params) }; },
    async first() { return db.prepare(sql).get(...this.params) || null; },
    async run() { return { meta: { changes: db.prepare(sql).run(...this.params).changes } }; },
  });
  return {
    prepare,
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export async function portabilityFixture({ barriers = true } = {}) {
  const fixture = directoryImportFixture();
  fixture.env.ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED = 'true';
  fixture.db.exec(readFileSync(new URL('../../migrations/0109_parish_portability.sql', import.meta.url), 'utf8'));
  fixture.db.exec(readFileSync(new URL('../../migrations/0110_portability_storage_safeguards.sql', import.meta.url), 'utf8'));
  Object.assign(fixture.env, {
    PARISH_PORTABILITY_ENABLED: 'true',
    PARISH_AUTOMATIC_CLOSURE_ENABLED: 'true',
    PARISH_RETENTION_DISCLOSURE_APPROVED: RETENTION_DISCLOSURE_VERSION,
    PARISH_STORAGE_GUARDS_ENABLED: 'true',
    PARISH_SUPPRESSION_AUTHORITY: 'test-ledger',
    PARISH_BACKUP_EXPIRY_VERIFIED: POLICY_VERSION,
    PARISH_EXPORTS: memoryBucket(),
    PARISH_CLOSURE_LEDGER: memoryBucket(),
    PARISH_RETAINED_DATA: memoryBucket(),
  });
  await fixture.env.PARISH_CLOSURE_LEDGER.put('authority.json', JSON.stringify({ id: 'test-ledger', policyVersion: POLICY_VERSION }));
  await fixture.env.PARISH_CLOSURE_LEDGER.put('backup-expiry/latest.json', JSON.stringify({ strictExpiryEnabled: true, verifiedAt: Date.now(), retentionDays: 365, newestBackupPreserved: false, oldestRetainedAt: null }));
  for (const parish of ['parish-a', 'parish-b']) {
    const session = await issueParishDashboardSession({ parishId: parish, parishName: parish, password: 'do-not-export', nested: { apiKey: 'do-not-export' } }, { mfaVerifiedAt: new Date().toISOString() });
    fixture.db.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').run('ref-' + parish, parish, '2026-08-28', JSON.stringify(session.registration));
    fixture[parish] = session.token;
  }
  for (const [id, owner, name] of [['a', 'parish-a', 'Alpha'], ['b', 'parish-b', 'Beta'], ['shared', 'parish-a', 'Shared']]) {
    fixture.db.prepare('INSERT INTO directory_people(id,created_by_parish_id,preferred_name,legal_name,notes,created_at,updated_at) VALUES(?,?,?,?,?,1,1)').run(id, owner, name, name + ' Legal', id === 'shared' ? 'private shared note' : 'own note');
    fixture.db.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES(?,?,?,'member',1,1)").run(id + '-aff', id, owner);
  }
  fixture.db.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) VALUES('other-aff','shared','parish-b','member',1,1)").run();
  fixture.db.prepare("INSERT INTO directory_contact_methods(id,parish_id,owner_type,owner_id,contact_type,label,value,normalized_value,created_at,updated_at) VALUES('other-private','parish-b','person','shared','email','personal','private@example.test','private@example.test',1,1)").run();
  if (barriers) {
    const tables = (await inspectStorage(fixture.env.AGAPAY_DB)).map(table => table.name);
    for (const sql of barrierStatements(tables)) fixture.db.exec(sql);
  }
  fixture.actor = await actorFingerprint(fixture['parish-a']);
  fixture.start = mode => startExport(fixture.env, { parishId: 'parish-a', actorHash: fixture.actor, mode, requestKey: crypto.randomUUID() });
  fixture.queueConfirmation = job => confirmClosure(fixture.env, { parishId: 'parish-a', jobId: job.id, actorHash: fixture.actor, archiveHash: job.archive_sha256, policyVersion: POLICY_VERSION, saved: true, confirmation: 'parish-a' });
  fixture.confirm = async job => {
    await fixture.queueConfirmation(job);
    await processExport(fixture.env, 'parish-a', job.id);
    return processExport(fixture.env, 'parish-a', job.id);
  };
  return fixture;
}

export function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = {};
  let position = 0;
  while (view.getUint32(position, true) === 0x04034b50) {
    const length = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extra = view.getUint16(position + 28, true);
    const name = new TextDecoder().decode(bytes.slice(position + 30, position + 30 + nameLength));
    const start = position + 30 + nameLength + extra;
    result[name] = bytes.slice(start, start + length);
    position = start + length;
  }
  return result;
}

export const decodedText = value => new TextDecoder().decode(value);
