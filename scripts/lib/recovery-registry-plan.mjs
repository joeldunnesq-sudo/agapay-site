import assert from 'node:assert/strict';
import { FILE_BINDINGS, FINANCIAL_BINDINGS, canonicalBinding } from '../../src/portability/storage.js';
import { POLICY_VERSION } from '../../src/portability/catalog.js';

const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const identity = (row) => row.binding + '\0' + row.objectKey;
export function registryPlan(proposal, current) {
  const bindings = [...new Set(FILE_BINDINGS.map(canonicalBinding))].sort();
  assert.ok(
    proposal.objects.length <= 1000 && proposal.legacyKeys.length <= 1000,
    'Larger registry reconciliation requires a reviewed batch plan'
  );
  const objects = new Map(),
    legacy = new Map();
  const at = Date.parse(proposal.checkedAt);
  assert.ok(Number.isFinite(at));
  const statements = [];
  for (const row of proposal.objects) {
    assert.ok(bindings.includes(row.binding) && row.objectKey && row.parishId && row.etag);
    assert.ok(['delete', 'financial'].includes(row.disposition));
    assert.equal(row.disposition, FINANCIAL_BINDINGS.has(row.binding) ? 'financial' : 'delete');
    assert.equal(row.state, 'stored');
    assert.ok(!objects.has(identity(row)), 'Duplicate object ownership');
    objects.set(identity(row), row);
  }
  for (const row of proposal.legacyKeys) {
    assert.ok(row.objectKey && row.parishId);
    assert.match(row.sourceHash, /^[a-f0-9]{64}$/);
    assert.equal(row.state, 'stored');
    assert.ok(!legacy.has(row.objectKey), 'Duplicate legacy ownership');
    legacy.set(row.objectKey, row);
  }
  for (const row of current.objects) {
    assert.ok(['stored', 'deleted'].includes(row.state), 'Pending object requires manual reconciliation');
    const wanted = objects.get(row.binding + '\0' + row.object_key);
    if (wanted) assert.equal(row.parish_id, wanted.parishId, 'Object ownership must never be reassigned');
    else
      statements.push(
        `UPDATE parish_portability_objects SET state='deleted',updated_at=${at} WHERE binding=${q(row.binding)} AND object_key=${q(row.object_key)} AND parish_id=${q(row.parish_id)};`
      );
  }
  for (const row of current.legacy) {
    assert.ok(['stored', 'deleted'].includes(row.state), 'Pending legacy write requires manual reconciliation');
    const wanted = legacy.get(row.object_key);
    if (wanted) assert.equal(row.parish_id, wanted.parishId, 'Legacy ownership must never be reassigned');
    else
      statements.push(
        `UPDATE parish_portability_legacy_keys SET state='deleted',updated_at=${at} WHERE object_key=${q(row.object_key)} AND parish_id=${q(row.parish_id)};`
      );
  }
  for (const row of objects.values())
    statements.push(
      `INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES(${q(row.binding)},${q(row.objectKey)},${q(row.parishId)},${q(row.disposition)},'stored',${q(row.etag)},${at}) ON CONFLICT(binding,object_key) DO UPDATE SET disposition=excluded.disposition,state='stored',etag=excluded.etag,updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id;`
    );
  for (const row of legacy.values())
    statements.push(
      `INSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES(${q(row.objectKey)},${q(row.parishId)},${q(row.sourceHash)},'stored',${at}) ON CONFLICT(object_key) DO UPDATE SET source_hash=excluded.source_hash,state='stored',updated_at=excluded.updated_at WHERE parish_id=excluded.parish_id;`
    );
  assert.match(proposal.physicalKeySetSha256, /^[a-f0-9]{64}$/);
  for (const binding of bindings)
    statements.push(
      `INSERT INTO parish_portability_inventory_reviews(binding,policy_version,reviewed_at,evidence_sha256) VALUES(${q(binding)},${q(POLICY_VERSION)},${at},${q(proposal.physicalKeySetSha256)}) ON CONFLICT(binding) DO UPDATE SET policy_version=excluded.policy_version,reviewed_at=excluded.reviewed_at,evidence_sha256=excluded.evidence_sha256;`
    );
  return statements.join('\n') + '\n';
}
