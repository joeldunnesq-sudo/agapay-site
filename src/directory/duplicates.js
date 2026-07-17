import { d1All, d1First, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, maskValue, nowMs, runAtomic, safeJson } from "./shared.js";

export const DUPLICATE_DETECTION_VERSION = "directory-duplicates-v1";

const PERSON_SIGNALS = Object.freeze({
  PERSON_EMAIL_EXACT: { weight: 45, sensitive: true, text: "The records share the same normalized email address." },
  PERSON_PHONE_EXACT: { weight: 35, sensitive: true, text: "The records share the same normalized phone number." },
  PERSON_NAME_EXACT: { weight: 25, sensitive: false, text: "The records have the same normalized display or legal name." },
  PERSON_SHARED_HOUSEHOLD: { weight: 15, sensitive: false, text: "The records are connected to the same active household." }
});

const HOUSEHOLD_SIGNALS = Object.freeze({
  HOUSEHOLD_ADDRESS_EXACT: { weight: 45, sensitive: true, text: "The households share the same normalized address." },
  HOUSEHOLD_NAME_EXACT: { weight: 25, sensitive: false, text: "The households have the same normalized name." },
  HOUSEHOLD_MEMBER_OVERLAP: { weight: 35, sensitive: false, text: "The households share an active member." },
  HOUSEHOLD_CONTACT_EXACT: { weight: 30, sensitive: true, text: "The households share a normalized contact method." }
});

const NOT_DUPLICATE_REASONS = new Set([
  "different_people", "family_members_share_contact", "parent_and_child",
  "spouses_share_contact", "clergy_or_monastic_name_similarity",
  "same_household_different_person", "former_and_current_household",
  "shared_parish_contact", "records_intentionally_separate", "insufficient_evidence"
]);

function actor(context) {
  return { userId: context.user.id, parishId: context.parishId, capabilities: context.capabilities, personId: context.personId || "" };
}

function hasAny(context, capabilities) {
  return capabilities.some((capability) => context.capabilities.includes(capability));
}

function requireDuplicateReview(context) {
  if (!hasAny(context, [DIRECTORY_CAPABILITIES.duplicatesReview, DIRECTORY_CAPABILITIES.manage])) {
    throw new DirectoryServiceError("forbidden", "Duplicate review requires directory duplicate-review capability.", 403);
  }
}

function requireDuplicateMerge(context) {
  if (!hasAny(context, [DIRECTORY_CAPABILITIES.duplicatesMerge, DIRECTORY_CAPABILITIES.manage])) {
    throw new DirectoryServiceError("forbidden", "Duplicate merge requires directory duplicate-merge capability.", 403);
  }
}

export function normalizeDuplicateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\s+/g, " ");
}

function pairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

function scoreSignals(signals, catalog) {
  const score = signals.reduce((sum, signal) => sum + (catalog[signal.code]?.weight || 0), 0);
  const critical = signals.some((signal) => signal.code.includes("IDENTITY"));
  if (critical) return { score, confidenceBand: "critical_identity_conflict" };
  if (score >= 70) return { score, confidenceBand: "high" };
  if (score >= 40) return { score, confidenceBand: "medium" };
  return { score, confidenceBand: "low" };
}

function signalDto(signal, context, catalog) {
  const definition = catalog[signal.code] || {};
  const showValue = !definition.sensitive || context.permissions?.canViewPrivateContact;
  return {
    code: signal.code,
    explanation: definition.text || signal.code,
    sensitive: Boolean(definition.sensitive),
    value: showValue ? signal.value || "" : ""
  };
}

async function upsertCandidate(env, { context, entityType, leftId, rightId, leftRevision, rightRevision, signals, detectionSource = "manual_scan" }) {
  if (!leftId || !rightId || leftId === rightId) return null;
  const catalog = entityType === "person" ? PERSON_SIGNALS : HOUSEHOLD_SIGNALS;
  const normalizedPairKey = pairKey(leftId, rightId);
  const existing = await d1First(
    env,
    "SELECT * FROM directory_duplicate_candidates WHERE parish_id = ?1 AND entity_type = ?2 AND normalized_pair_key = ?3 AND detection_version = ?4",
    context.parishId,
    entityType,
    normalizedPairKey,
    DUPLICATE_DETECTION_VERSION
  );
  const { score, confidenceBand } = scoreSignals(signals, catalog);
  const timestamp = nowMs();
  if (existing) {
    if (existing.candidate_status === "not_duplicate" && existing.signal_summary_json === safeJson(signals)) return existing.id;
    await runAtomic(env, [{
      sql: `UPDATE directory_duplicate_candidates
              SET signal_summary_json = ?, score = ?, confidence_band = ?, last_detected_at = ?,
                  left_revision_at_detection = ?, right_revision_at_detection = ?, updated_at = ?,
                  candidate_status = CASE WHEN candidate_status IN ('not_duplicate', 'merged', 'cancelled') THEN candidate_status ELSE 'open' END
            WHERE id = ?`,
      params: [safeJson(signals), score, confidenceBand, timestamp, String(leftRevision || ""), String(rightRevision || ""), timestamp, existing.id]
    }]);
    return existing.id;
  }
  const id = generateSecret("dir_dup");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_duplicate_candidates
              (id, parish_id, entity_type, left_entity_id, right_entity_id, normalized_pair_key,
               candidate_status, confidence_band, score, detection_source, signal_summary_json,
               detection_version, left_revision_at_detection, right_revision_at_detection,
               first_detected_at, last_detected_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, context.parishId, entityType, leftId, rightId, normalizedPairKey, confidenceBand, score, detectionSource, safeJson(signals), DUPLICATE_DETECTION_VERSION, String(leftRevision || ""), String(rightRevision || ""), timestamp, timestamp, timestamp, timestamp]
    },
    auditStatement({
      action: "directory.duplicate_candidate.detected",
      actor: actor(context),
      parishId: context.parishId,
      targetType: `directory_${entityType}_duplicate_candidate`,
      targetId: id,
      metadata: { entityType, confidenceBand, score, signalCodes: signals.map((signal) => signal.code) }
    })
  ]);
  return id;
}

async function personRows(env, parishId) {
  return d1All(
    env,
    `SELECT DISTINCT p.id, p.preferred_name, p.legal_name, p.date_of_birth, p.active, p.updated_at,
            COALESCE(f.is_child, 0) AS is_child, COALESCE(f.protected_person, 0) AS protected_person
       FROM directory_people p
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id
       LEFT JOIN directory_parish_affiliations a ON a.person_id = p.id AND a.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
      WHERE p.active = 1 AND (p.created_by_parish_id = ?1 OR h.parish_id = ?1 OR a.parish_id = ?1)`,
    parishId
  );
}

function addPair(map, leftId, rightId, signal) {
  if (!leftId || !rightId || leftId === rightId) return;
  const key = pairKey(leftId, rightId);
  const current = map.get(key) || { leftId: key.split("::")[0], rightId: key.split("::")[1], signals: [] };
  if (!current.signals.some((existing) => existing.code === signal.code && existing.value === signal.value)) current.signals.push(signal);
  map.set(key, current);
}

export async function generateDuplicateCandidates(env, { context, entityType = "all", detectionSource = "manual_scan", correlationId = "" }) {
  requireDuplicateReview(context);
  const generated = [];
  if (entityType === "all" || entityType === "person") generated.push(...await generatePersonDuplicateCandidates(env, { context, detectionSource }));
  if (entityType === "all" || entityType === "household") generated.push(...await generateHouseholdDuplicateCandidates(env, { context, detectionSource }));
  await runAtomic(env, [auditStatement({
    action: "directory.duplicate_scan.completed",
    actor: actor(context),
    parishId: context.parishId,
    targetType: "directory_duplicate_scan",
    targetId: context.parishId,
    metadata: { entityType, generatedCount: generated.length, detectionVersion: DUPLICATE_DETECTION_VERSION },
    correlationId
  })]);
  return { generatedCount: generated.length, candidateIds: generated.filter(Boolean) };
}

export async function generatePersonDuplicateCandidates(env, { context, detectionSource = "manual_scan" }) {
  const people = await personRows(env, context.parishId);
  const byId = new Map(people.map((row) => [row.id, row]));
  const pairs = new Map();
  const contacts = await d1All(
    env,
    `SELECT owner_id, contact_type, normalized_value FROM directory_contact_methods
      WHERE parish_id = ?1 AND owner_type = 'person' AND active = 1 AND normalized_value IS NOT NULL`,
    context.parishId
  );
  for (const contact of contacts) {
    const same = contacts.filter((row) => row.contact_type === contact.contact_type && row.normalized_value === contact.normalized_value && row.owner_id !== contact.owner_id);
    for (const other of same) addPair(pairs, contact.owner_id, other.owner_id, { code: contact.contact_type === "email" ? "PERSON_EMAIL_EXACT" : "PERSON_PHONE_EXACT", value: contact.normalized_value });
  }
  const nameBuckets = new Map();
  for (const person of people) {
    for (const name of [person.preferred_name, person.legal_name]) {
      const normalized = normalizeDuplicateName(name);
      if (!normalized) continue;
      const bucket = nameBuckets.get(normalized) || [];
      for (const otherId of bucket) addPair(pairs, person.id, otherId, { code: "PERSON_NAME_EXACT", value: normalized });
      bucket.push(person.id);
      nameBuckets.set(normalized, bucket);
    }
  }
  const memberships = await d1All(env, "SELECT household_id, person_id FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE h.parish_id = ?1 AND hm.active = 1", context.parishId);
  for (const membership of memberships) {
    for (const other of memberships.filter((row) => row.household_id === membership.household_id && row.person_id !== membership.person_id)) {
      addPair(pairs, membership.person_id, other.person_id, { code: "PERSON_SHARED_HOUSEHOLD", value: membership.household_id });
    }
  }
  const ids = [];
  for (const pair of pairs.values()) {
    const left = byId.get(pair.leftId);
    const right = byId.get(pair.rightId);
    if (!left || !right) continue;
    ids.push(await upsertCandidate(env, { context, entityType: "person", leftId: left.id, rightId: right.id, leftRevision: left.updated_at, rightRevision: right.updated_at, signals: pair.signals, detectionSource }));
  }
  return ids;
}

export async function generateHouseholdDuplicateCandidates(env, { context, detectionSource = "manual_scan" }) {
  const households = await d1All(env, "SELECT * FROM directory_households WHERE parish_id = ?1 AND active = 1", context.parishId);
  const byId = new Map(households.map((row) => [row.id, row]));
  const pairs = new Map();
  const nameBuckets = new Map();
  for (const household of households) {
    const normalized = normalizeDuplicateName(household.display_name);
    if (!normalized) continue;
    const bucket = nameBuckets.get(normalized) || [];
    for (const otherId of bucket) addPair(pairs, household.id, otherId, { code: "HOUSEHOLD_NAME_EXACT", value: normalized });
    bucket.push(household.id);
    nameBuckets.set(normalized, bucket);
  }
  const addresses = await d1All(env, "SELECT owner_id, normalized_value FROM directory_addresses WHERE parish_id = ?1 AND owner_type = 'household' AND active = 1 AND protected_address = 0", context.parishId);
  for (const address of addresses) {
    for (const other of addresses.filter((row) => row.normalized_value === address.normalized_value && row.owner_id !== address.owner_id)) {
      addPair(pairs, address.owner_id, other.owner_id, { code: "HOUSEHOLD_ADDRESS_EXACT", value: address.normalized_value });
    }
  }
  const contacts = await d1All(env, "SELECT owner_id, contact_type, normalized_value FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = 'household' AND active = 1", context.parishId);
  for (const contact of contacts) {
    for (const other of contacts.filter((row) => row.contact_type === contact.contact_type && row.normalized_value === contact.normalized_value && row.owner_id !== contact.owner_id)) {
      addPair(pairs, contact.owner_id, other.owner_id, { code: "HOUSEHOLD_CONTACT_EXACT", value: contact.normalized_value });
    }
  }
  const members = await d1All(env, "SELECT household_id, person_id FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE h.parish_id = ?1 AND hm.active = 1", context.parishId);
  for (const member of members) {
    for (const other of members.filter((row) => row.person_id === member.person_id && row.household_id !== member.household_id)) {
      addPair(pairs, member.household_id, other.household_id, { code: "HOUSEHOLD_MEMBER_OVERLAP", value: member.person_id });
    }
  }
  const ids = [];
  for (const pair of pairs.values()) {
    const left = byId.get(pair.leftId);
    const right = byId.get(pair.rightId);
    if (!left || !right) continue;
    ids.push(await upsertCandidate(env, { context, entityType: "household", leftId: left.id, rightId: right.id, leftRevision: left.updated_at, rightRevision: right.updated_at, signals: pair.signals, detectionSource }));
  }
  return ids;
}

export async function listDuplicateCandidates(env, { context, status = "open", entityType = "", limit = 50 }) {
  requireDuplicateReview(context);
  const params = [context.parishId];
  let where = "parish_id = ?1";
  if (status) { params.push(status); where += ` AND candidate_status = ?${params.length}`; }
  if (entityType) { params.push(entityType); where += ` AND entity_type = ?${params.length}`; }
  params.push(Math.min(Number(limit) || 50, 100));
  const rows = await d1All(env, `SELECT * FROM directory_duplicate_candidates WHERE ${where} ORDER BY score DESC, last_detected_at DESC LIMIT ?${params.length}`, ...params);
  return rows.map((row) => duplicateCandidateDto(row, context));
}

export function duplicateCandidateDto(row, context) {
  const catalog = row.entity_type === "person" ? PERSON_SIGNALS : HOUSEHOLD_SIGNALS;
  const signals = JSON.parse(row.signal_summary_json || "[]").map((signal) => signalDto(signal, context, catalog));
  return {
    id: row.id,
    parishId: row.parish_id,
    entityType: row.entity_type,
    leftEntityId: row.left_entity_id,
    rightEntityId: row.right_entity_id,
    status: row.candidate_status,
    confidenceBand: row.confidence_band,
    score: Number(row.score || 0),
    strongestSignal: signals[0]?.explanation || "Duplicate review candidate",
    signals,
    detectionVersion: row.detection_version,
    decision: row.decision || "",
    mergeStatus: row.merge_status || "none",
    version: `${row.updated_at}:${row.left_revision_at_detection || ""}:${row.right_revision_at_detection || ""}`,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

export async function loadDuplicateCandidate(env, { context, candidateId }) {
  requireDuplicateReview(context);
  const row = await d1First(env, "SELECT * FROM directory_duplicate_candidates WHERE id = ?1 AND parish_id = ?2", cleanText(candidateId, { required: true, max: 180, field: "candidateId" }), context.parishId);
  if (!row) throw new DirectoryServiceError("not_found", "Duplicate candidate was not found.", 404);
  return row;
}

export async function getDuplicateComparison(env, { context, candidateId }) {
  const row = await loadDuplicateCandidate(env, { context, candidateId });
  return {
    candidate: duplicateCandidateDto(row, context),
    left: row.entity_type === "person" ? await personComparison(env, context, row.left_entity_id) : await householdComparison(env, context, row.left_entity_id),
    right: row.entity_type === "person" ? await personComparison(env, context, row.right_entity_id) : await householdComparison(env, context, row.right_entity_id),
    blockers: await mergeBlockers(env, { context, candidate: row, survivorId: row.left_entity_id, retiredId: row.right_entity_id })
  };
}

async function personComparison(env, context, personId) {
  const person = await d1First(env, "SELECT * FROM directory_people WHERE id = ?1", personId);
  const flags = await d1First(env, "SELECT * FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2 AND active = 1", context.parishId, personId);
  const contacts = context.permissions.canViewPrivateContact ? await d1All(env, "SELECT contact_type, label, value, normalized_value FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1", context.parishId, personId) : [];
  const households = await d1All(env, `SELECT h.id, h.display_name, hm.relationship FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE hm.person_id = ?1 AND h.parish_id = ?2 AND hm.active = 1`, personId, context.parishId);
  const links = await d1All(env, "SELECT link_type, active FROM directory_person_links WHERE person_id = ?1 AND active = 1", personId);
  const publication = await d1First(env, "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1", context.parishId, personId);
  return {
    id: person.id,
    displayName: person.preferred_name,
    legalName: context.permissions.canManagePeople ? person.legal_name || "" : maskValue(person.legal_name),
    active: Number(person.active || 0) === 1,
    child: Number(flags?.is_child || 0) === 1,
    protectedPerson: Number(flags?.protected_person || 0) === 1,
    contacts: contacts.map((contact) => ({ ...contact, value: context.permissions.canViewPrivateContact ? contact.value : maskValue(contact.value, contact.contact_type) })),
    households,
    identityLinks: links.map((link) => ({ type: link.link_type, active: Number(link.active || 0) === 1 })),
    publication: publication || null,
    version: person.updated_at
  };
}

async function householdComparison(env, context, householdId) {
  const household = await d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", householdId, context.parishId);
  const members = await d1All(env, `SELECT p.id, p.preferred_name, hm.relationship FROM directory_household_members hm JOIN directory_people p ON p.id = hm.person_id WHERE hm.household_id = ?1 AND hm.active = 1 ORDER BY p.preferred_name`, householdId);
  const admins = await d1All(env, `SELECT p.id, p.preferred_name FROM directory_household_admins ha JOIN directory_people p ON p.id = ha.person_id WHERE ha.household_id = ?1 AND ha.active = 1 ORDER BY p.preferred_name`, householdId);
  const contacts = context.permissions.canViewPrivateContact ? await d1All(env, "SELECT contact_type, label, value, normalized_value FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1", context.parishId, householdId) : [];
  const addresses = await d1All(env, "SELECT address_type, protected_address, visibility, normalized_value FROM directory_addresses WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1", context.parishId, householdId);
  const publication = await d1First(env, "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1", context.parishId, householdId);
  return {
    id: household.id,
    displayName: household.display_name,
    active: Number(household.active || 0) === 1,
    members,
    administrators: admins,
    contacts: contacts.map((contact) => ({ ...contact, value: context.permissions.canViewPrivateContact ? contact.value : maskValue(contact.value, contact.contact_type) })),
    addresses: addresses.map((address) => ({ ...address, normalized_value: Number(address.protected_address || 0) === 1 && !context.permissions.canManageProtected ? "" : address.normalized_value })),
    publication: publication || null,
    version: household.updated_at
  };
}

export async function decideDuplicateCandidate(env, { context, candidateId, decision, reasonCode = "", expectedVersion = "", correlationId = "" }) {
  requireDuplicateReview(context);
  const row = await loadDuplicateCandidate(env, { context, candidateId });
  if (expectedVersion && expectedVersion !== duplicateCandidateDto(row, context).version) throw new DirectoryServiceError("stale_duplicate_candidate", "Duplicate candidate changed. Refresh before deciding.", 409);
  const cleaned = cleanText(decision, { required: true, max: 40, field: "decision" });
  if (!["not_duplicate", "deferred", "confirmed_duplicate"].includes(cleaned)) throw new DirectoryServiceError("validation_failed", "Duplicate decision is not supported.");
  const reason = cleanText(reasonCode, { max: 80 }) || (cleaned === "deferred" ? "insufficient_evidence" : null);
  if (cleaned === "not_duplicate" && !NOT_DUPLICATE_REASONS.has(reason)) throw new DirectoryServiceError("validation_failed", "Not-duplicate reason is not supported.");
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_duplicate_candidates
              SET candidate_status = ?, decision = ?, decision_reason_code = ?, decided_by_user_id = ?,
                  decided_at = ?, suppression_until = ?, updated_at = ?
            WHERE id = ? AND parish_id = ?`,
      params: [cleaned, cleaned, reason, context.user.id, timestamp, cleaned === "not_duplicate" ? timestamp + 365 * 86400000 : null, timestamp, row.id, context.parishId]
    },
    auditStatement({
      action: `directory.duplicate_candidate.${cleaned}`,
      actor: actor(context),
      parishId: context.parishId,
      targetType: `directory_${row.entity_type}_duplicate_candidate`,
      targetId: row.id,
      metadata: { reasonCode: reason },
      correlationId
    })
  ]);
  return duplicateCandidateDto(await loadDuplicateCandidate(env, { context, candidateId }), context);
}

export async function planDuplicateMerge(env, { context, candidateId, survivorId, expectedVersion = "", correlationId = "" }) {
  requireDuplicateMerge(context);
  const row = await loadDuplicateCandidate(env, { context, candidateId });
  if (!["confirmed_duplicate", "merge_planned", "merge_ready"].includes(row.candidate_status)) throw new DirectoryServiceError("invalid_transition", "Candidate must be confirmed before merge planning.", 409);
  if (expectedVersion && expectedVersion !== duplicateCandidateDto(row, context).version) throw new DirectoryServiceError("stale_duplicate_candidate", "Duplicate candidate changed. Refresh before planning.", 409);
  const survivor = cleanText(survivorId, { required: true, max: 180, field: "survivorId" });
  if (![row.left_entity_id, row.right_entity_id].includes(survivor)) throw new DirectoryServiceError("validation_failed", "Survivor must be one side of the candidate.");
  const retired = survivor === row.left_entity_id ? row.right_entity_id : row.left_entity_id;
  const blockers = await mergeBlockers(env, { context, candidate: row, survivorId: survivor, retiredId: retired });
  const status = blockers.length ? "blocked" : "merge_ready";
  const plan = { survivorId: survivor, retiredId: retired, blockers, survivorship: "prefer_survivor_non_empty", plannedAt: nowMs() };
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_duplicate_candidates SET candidate_status = ?, merge_status = ?, merge_plan_json = ?, updated_at = ? WHERE id = ?", params: [status, blockers.length ? "blocked" : "ready", safeJson(plan), timestamp, row.id] },
    auditStatement({ action: "directory.duplicate_merge.planned", actor: actor(context), parishId: context.parishId, targetType: `directory_${row.entity_type}_duplicate_candidate`, targetId: row.id, metadata: { survivorId: survivor, retiredId: retired, blockers }, correlationId })
  ]);
  return { candidate: duplicateCandidateDto(await loadDuplicateCandidate(env, { context, candidateId }), context), plan };
}

async function mergeBlockers(env, { context, candidate, survivorId, retiredId }) {
  const blockers = [];
  if (candidate.entity_type === "person") {
    const [survivor, retired] = await Promise.all([
      d1First(env, "SELECT * FROM directory_people WHERE id = ?1", survivorId),
      d1First(env, "SELECT * FROM directory_people WHERE id = ?1", retiredId)
    ]);
    if (!survivor || !retired || !Number(survivor.active || 0) || !Number(retired.active || 0)) blockers.push("inactive_or_missing_person");
    const flags = await d1All(env, "SELECT person_id, is_child, protected_person FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id IN (?2, ?3) AND active = 1", context.parishId, survivorId, retiredId);
    const leftFlags = flags.find((flag) => flag.person_id === survivorId) || {};
    const rightFlags = flags.find((flag) => flag.person_id === retiredId) || {};
    if (Number(leftFlags.is_child || 0) !== Number(rightFlags.is_child || 0)) blockers.push("child_adult_conflict");
    if (Number(leftFlags.protected_person || 0) !== Number(rightFlags.protected_person || 0) && !context.permissions.canManageProtected) blockers.push("protected_person_authority_required");
    const links = await d1All(env, "SELECT person_id, link_type, external_id FROM directory_person_links WHERE person_id IN (?1, ?2) AND active = 1", survivorId, retiredId);
    const platformLinks = links.filter((link) => link.link_type === "platform_user");
    if (new Set(platformLinks.map((link) => link.external_id)).size > 1) blockers.push("conflicting_platform_user_links");
    const alias = await d1First(env, "SELECT id FROM directory_merge_aliases WHERE parish_id = ?1 AND entity_type = 'person' AND old_entity_id IN (?2, ?3) AND active = 1", context.parishId, survivorId, retiredId);
    if (alias) blockers.push("already_merged_person");
  } else {
    const [survivor, retired] = await Promise.all([
      d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", survivorId, context.parishId),
      d1First(env, "SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2", retiredId, context.parishId)
    ]);
    if (!survivor || !retired || !Number(survivor.active || 0) || !Number(retired.active || 0)) blockers.push("inactive_or_missing_household");
    const protectedAddresses = await d1All(env, "SELECT id FROM directory_addresses WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id IN (?2, ?3) AND protected_address = 1 AND active = 1", context.parishId, survivorId, retiredId);
    if (protectedAddresses.length && !context.permissions.canManageProtected) blockers.push("protected_address_authority_required");
    const alias = await d1First(env, "SELECT id FROM directory_merge_aliases WHERE parish_id = ?1 AND entity_type = 'household' AND old_entity_id IN (?2, ?3) AND active = 1", context.parishId, survivorId, retiredId);
    if (alias) blockers.push("already_merged_household");
  }
  return blockers;
}

export async function executeDuplicateMerge(env, { context, candidateId, expectedVersion = "", correlationId = "" }) {
  requireDuplicateMerge(context);
  const row = await loadDuplicateCandidate(env, { context, candidateId });
  if (row.candidate_status !== "merge_ready" || row.merge_status !== "ready") throw new DirectoryServiceError("invalid_transition", "Duplicate merge must be planned and ready before execution.", 409);
  if (expectedVersion && expectedVersion !== duplicateCandidateDto(row, context).version) throw new DirectoryServiceError("stale_duplicate_candidate", "Duplicate candidate changed. Refresh before merging.", 409);
  const plan = JSON.parse(row.merge_plan_json || "{}");
  const blockers = await mergeBlockers(env, { context, candidate: row, survivorId: plan.survivorId, retiredId: plan.retiredId });
  if (blockers.length) throw new DirectoryServiceError("merge_blocked", "Duplicate merge has unresolved blockers.", 409);
  return row.entity_type === "person"
    ? executePersonMerge(env, { context, candidate: row, plan, correlationId })
    : executeHouseholdMerge(env, { context, candidate: row, plan, correlationId });
}

async function executePersonMerge(env, { context, candidate, plan, correlationId }) {
  const timestamp = nowMs();
  const mergeId = generateSecret("dir_merge");
  const snapshot = {
    survivor: await personComparison(env, context, plan.survivorId),
    retired: await personComparison(env, context, plan.retiredId)
  };
  const statements = [
    { sql: "UPDATE directory_contact_methods SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'person' AND owner_id = ? AND active = 1", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_addresses SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'person' AND owner_id = ? AND active = 1", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_field_privacy_preferences SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'person' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_media_assets SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'person' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_media_assignments SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'person' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_person_links SET person_id = ?, updated_at = ? WHERE person_id = ? AND active = 1", params: [plan.survivorId, timestamp, plan.retiredId] },
    { sql: "UPDATE directory_people SET active = 0, updated_at = ? WHERE id = ?", params: [timestamp, plan.retiredId] },
    { sql: "INSERT INTO directory_merge_events (id, parish_id, entity_type, candidate_id, survivor_entity_id, retired_entity_id, executed_by_user_id, snapshot_json, reversible_metadata_json, created_at) VALUES (?, ?, 'person', ?, ?, ?, ?, ?, ?, ?)", params: [mergeId, context.parishId, candidate.id, plan.survivorId, plan.retiredId, context.user.id, safeJson(snapshot), safeJson({ reversible: false, reason: "canonical references moved and retired record deactivated" }), timestamp] },
    { sql: "INSERT INTO directory_merge_aliases (id, parish_id, entity_type, old_entity_id, survivor_entity_id, merge_event_id, active, created_at) VALUES (?, ?, 'person', ?, ?, ?, 1, ?)", params: [generateSecret("dir_alias"), context.parishId, plan.retiredId, plan.survivorId, mergeId, timestamp] },
    { sql: "UPDATE directory_duplicate_candidates SET candidate_status = 'merged', merge_status = 'executed', merged_by_user_id = ?, merged_at = ?, merge_event_id = ?, updated_at = ? WHERE id = ?", params: [context.user.id, timestamp, mergeId, timestamp, candidate.id] },
    auditStatement({ action: "directory.duplicate_merge.executed", actor: actor(context), parishId: context.parishId, targetType: "directory_person", targetId: plan.survivorId, metadata: { retiredId: plan.retiredId, candidateId: candidate.id, mergeEventId: mergeId }, correlationId })
  ];
  await runAtomic(env, statements);
  return { ok: true, mergeEventId: mergeId, survivorId: plan.survivorId, retiredId: plan.retiredId };
}

async function executeHouseholdMerge(env, { context, candidate, plan, correlationId }) {
  const timestamp = nowMs();
  const mergeId = generateSecret("dir_merge");
  const snapshot = {
    survivor: await householdComparison(env, context, plan.survivorId),
    retired: await householdComparison(env, context, plan.retiredId)
  };
  const statements = [
    { sql: "UPDATE directory_household_members SET household_id = ?, updated_at = ? WHERE household_id = ? AND active = 1 AND person_id NOT IN (SELECT person_id FROM directory_household_members WHERE household_id = ? AND active = 1)", params: [plan.survivorId, timestamp, plan.retiredId, plan.survivorId] },
    { sql: "UPDATE directory_household_admins SET household_id = ?, updated_at = ? WHERE household_id = ? AND active = 1 AND person_id NOT IN (SELECT person_id FROM directory_household_admins WHERE household_id = ? AND active = 1)", params: [plan.survivorId, timestamp, plan.retiredId, plan.survivorId] },
    { sql: "UPDATE directory_contact_methods SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'household' AND owner_id = ? AND active = 1", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_addresses SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'household' AND owner_id = ? AND active = 1", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_field_privacy_preferences SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'household' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_media_assets SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'household' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_media_assignments SET owner_id = ?, updated_at = ? WHERE parish_id = ? AND owner_type = 'household' AND owner_id = ?", params: [plan.survivorId, timestamp, context.parishId, plan.retiredId] },
    { sql: "UPDATE directory_households SET active = 0, updated_at = ? WHERE id = ? AND parish_id = ?", params: [timestamp, plan.retiredId, context.parishId] },
    { sql: "INSERT INTO directory_merge_events (id, parish_id, entity_type, candidate_id, survivor_entity_id, retired_entity_id, executed_by_user_id, snapshot_json, reversible_metadata_json, created_at) VALUES (?, ?, 'household', ?, ?, ?, ?, ?, ?, ?)", params: [mergeId, context.parishId, candidate.id, plan.survivorId, plan.retiredId, context.user.id, safeJson(snapshot), safeJson({ reversible: false, reason: "household references moved and retired household deactivated" }), timestamp] },
    { sql: "INSERT INTO directory_merge_aliases (id, parish_id, entity_type, old_entity_id, survivor_entity_id, merge_event_id, active, created_at) VALUES (?, ?, 'household', ?, ?, ?, 1, ?)", params: [generateSecret("dir_alias"), context.parishId, plan.retiredId, plan.survivorId, mergeId, timestamp] },
    { sql: "UPDATE directory_duplicate_candidates SET candidate_status = 'merged', merge_status = 'executed', merged_by_user_id = ?, merged_at = ?, merge_event_id = ?, updated_at = ? WHERE id = ?", params: [context.user.id, timestamp, mergeId, timestamp, candidate.id] },
    auditStatement({ action: "directory.duplicate_merge.executed", actor: actor(context), parishId: context.parishId, targetType: "directory_household", targetId: plan.survivorId, metadata: { retiredId: plan.retiredId, candidateId: candidate.id, mergeEventId: mergeId }, correlationId })
  ];
  await runAtomic(env, statements);
  return { ok: true, mergeEventId: mergeId, survivorId: plan.survivorId, retiredId: plan.retiredId };
}
