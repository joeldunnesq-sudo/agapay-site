// Generated from src/directory/skills-service.ts by npm run build:server. Do not edit.
import {
  SKILL_POLICY_VERSION,
  SKILL_DISCLAIMER,
  CATEGORIES,
  EXPERIENCE,
  SERVICE_MODES,
  CONTACT_PREFS,
  VISIBILITIES,
  STATUSES,
  MANAGE_CAPS,
  VIEW_CAPS,
  CATALOG_CAPS,
  parishIdFor,
  actorFromContext,
  enumValue,
  normalizeQuery,
  limitFor,
  offsetFor,
  nextCursor,
  skillDto,
  listingDto,
  featureSettings,
  assertFeatureEnabled,
  assertAdultSelf,
  loadSkill,
  listingRow,
  publishedContact,
  visibleSkillRows,
  d1All,
  d1First,
  generateSecret,
  DirectoryServiceError,
  assertParishActor,
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  nowMs,
  runAtomic,
} from './skills-service-shared.js';
import './skills-verification.js';
import './skills-exports.js';
import {
  updateSkillsSettings,
  getHouseholdVerificationStatus,
  completeHouseholdVerification,
} from './skills-verification.js';
import {
  getDirectoryMaintenanceDashboard,
  exportSkillsRosterCsv,
  printSkillsRoster,
  exportPublishedAdultsCsv,
  printDirectory,
} from './skills-exports.js';
async function listSkillCatalog(env, { context = null, parishId = '' } = {}) {
  const scopedParish = parishId || parishIdFor(context);
  const rows = await d1All(
    env,
    `SELECT * FROM directory_skill_catalog
      WHERE is_active = 1 AND (parish_id IS NULL OR parish_id = ?1)
      ORDER BY sort_order ASC, name ASC`,
    scopedParish
  );
  return rows.map(skillDto);
}
async function createParishSkill(env, { context, data = {}, correlationId = '' }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), CATALOG_CAPS);
  const parishId = parishIdFor(context);
  await assertFeatureEnabled(env, parishId);
  const name = cleanText(data.name, { required: true, max: 120, field: 'name' });
  const code = cleanText(
    data.code ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    { required: true, max: 80, field: 'code' }
  );
  const category = enumValue(data.category, CATEGORIES, 'category', 'other');
  const timestamp = nowMs();
  const id = generateSecret('dir_skill');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_skill_catalog
              (id, code, name, description, category, is_platform_default, parish_id, is_active, sort_order,
               created_at, updated_at, created_by_actor_type, created_by_actor_id)
            VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?)`,
      params: [
        id,
        code,
        name,
        cleanText(data.description, { max: 300 }),
        category,
        parishId,
        Number(data.sortOrder || 100),
        timestamp,
        timestamp,
        actor.actorType,
        actor.userId,
      ],
    },
    auditStatement({
      action: 'directory.skill_catalog.created',
      actor,
      parishId,
      targetType: 'directory_skill_catalog',
      targetId: id,
      after: { name, category },
      correlationId,
    }),
  ]);
  return skillDto(await d1First(env, 'SELECT * FROM directory_skill_catalog WHERE id = ?1', id));
}
async function updateParishSkill(env, { context, skillId, patch = {}, correlationId = '' }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), CATALOG_CAPS);
  const parishId = parishIdFor(context);
  const row = await loadSkill(env, { parishId, skillId });
  if (row.parish_id !== parishId)
    throw new DirectoryServiceError('forbidden', 'Platform default skills cannot be edited here.', 403);
  const timestamp = nowMs();
  const active = 'active' in patch ? Boolean(patch.active) : Number(row.is_active || 0) === 1;
  await runAtomic(env, [
    {
      sql: `UPDATE directory_skill_catalog SET
              name = ?, description = ?, category = ?, is_active = ?, updated_at = ?, version = version + 1
            WHERE id = ? AND parish_id = ?`,
      params: [
        cleanText(patch.name ?? row.name, { required: true, max: 120, field: 'name' }),
        cleanText(patch.description ?? row.description, { max: 300 }),
        enumValue(patch.category ?? row.category, CATEGORIES, 'category'),
        active ? 1 : 0,
        timestamp,
        row.id,
        parishId,
      ],
    },
    auditStatement({
      action: active ? 'directory.skill_catalog.updated' : 'directory.skill_catalog.disabled',
      actor,
      parishId,
      targetType: 'directory_skill_catalog',
      targetId: row.id,
      before: skillDto(row),
      after: { active },
      correlationId,
    }),
  ]);
  return skillDto(await d1First(env, 'SELECT * FROM directory_skill_catalog WHERE id = ?1', row.id));
}
async function listMySkillListings(env, { context }) {
  const parishId = parishIdFor(context);
  if (!context.claimed)
    return {
      catalog: await listSkillCatalog(env, { parishId }),
      listings: [],
      settings: await featureSettings(env, parishId),
    };
  const rows = await d1All(
    env,
    `SELECT l.*, s.code, s.name, s.category, p.preferred_name
       FROM directory_person_skill_listings l
       JOIN directory_skill_catalog s ON s.id = l.skill_id
       JOIN directory_people p ON p.id = l.person_id
      WHERE l.parish_id = ?1 AND l.person_id = ?2 AND l.status != 'archived'
      ORDER BY s.name ASC, l.created_at DESC`,
    parishId,
    context.currentPerson.id
  );
  return {
    catalog: await listSkillCatalog(env, { parishId }),
    listings: rows.map((row) => listingDto(row)),
    settings: await featureSettings(env, parishId),
    disclaimer: SKILL_DISCLAIMER,
  };
}
async function saveMySkillListing(env, { context, listingId = '', data = {}, correlationId = '' }) {
  const parishId = parishIdFor(context);
  const settings = await assertFeatureEnabled(env, parishId, { activation: data.status === 'active' });
  const personId = data.status === 'active' ? await assertAdultSelf(context, env, parishId) : context.currentPerson?.id;
  if (!personId) throw new DirectoryServiceError('unclaimed', 'Claim a directory person before using skills.', 403);
  let effectiveListingId = listingId;
  let existingListing = effectiveListingId ? await listingRow(env, { parishId, listingId: effectiveListingId }) : null;
  if (existingListing && existingListing.person_id !== personId)
    throw new DirectoryServiceError('not_found', 'Skill listing was not found.', 404);
  const skill = await loadSkill(env, { parishId, skillId: data.skillId || existingListing?.skill_id });
  if (!existingListing) {
    const duplicate = await d1First(
      env,
      `SELECT id FROM directory_person_skill_listings
        WHERE parish_id = ?1 AND person_id = ?2 AND skill_id = ?3
        LIMIT 1`,
      parishId,
      personId,
      skill.id
    );
    if (duplicate?.id) {
      effectiveListingId = duplicate.id;
      existingListing = await listingRow(env, { parishId, listingId: duplicate.id });
    }
  }
  if (Number(skill.is_active || 0) !== 1 && !effectiveListingId)
    throw new DirectoryServiceError('disabled_skill', 'This skill is not available for new listings.', 409);
  if (skill.parish_id && skill.parish_id !== parishId)
    throw new DirectoryServiceError('not_found', 'Skill was not found.', 404);
  if (!settings.skillsCustomEntriesEnabled && data.customDisplayLabel)
    throw new DirectoryServiceError(
      'custom_entries_disabled',
      'Custom skill labels are disabled for this parish.',
      403
    );
  const status = enumValue(data.status, STATUSES, 'status', existingListing?.status || 'draft');
  if (['hidden_by_parish', 'archived'].includes(status))
    throw new DirectoryServiceError('forbidden', 'This status is not self-service editable.', 403);
  const visibility = enumValue(data.visibility, VISIBILITIES, 'visibility', existingListing?.visibility || 'private');
  const timestamp = nowMs();
  const actor = actorFromContext(context, [DIRECTORY_CAPABILITIES.selfManage]);
  const values = {
    customDisplayLabel: cleanText(data.customDisplayLabel ?? existingListing?.custom_display_label, { max: 120 }),
    experienceLevel: enumValue(
      data.experienceLevel,
      EXPERIENCE,
      'experienceLevel',
      existingListing?.experience_level || 'willing_to_help'
    ),
    serviceMode: enumValue(
      data.serviceMode,
      SERVICE_MODES,
      'serviceMode',
      existingListing?.service_mode || 'informal_parishioner_help'
    ),
    availabilityNote: cleanText(data.availabilityNote ?? existingListing?.availability_note, { max: 300 }),
    contactPreference: enumValue(
      data.contactPreference,
      CONTACT_PREFS,
      'contactPreference',
      existingListing?.contact_preference || 'parish_office'
    ),
    visibility,
    status,
  };
  if (effectiveListingId) {
    const existing = existingListing;
    if (existing.status === 'hidden_by_parish' && status === 'active')
      throw new DirectoryServiceError(
        'hidden_by_parish',
        'The parish must restore this listing before it can be active.',
        409
      );
    await runAtomic(env, [
      {
        sql: `UPDATE directory_person_skill_listings SET
                skill_id = ?, custom_display_label = ?, experience_level = ?, service_mode = ?, availability_note = ?,
                contact_preference = ?, visibility = ?, status = ?,
                consent_recorded_at = CASE WHEN ? = 'active' AND (consent_recorded_at IS NULL OR status != 'active') THEN ? ELSE consent_recorded_at END,
                consent_withdrawn_at = CASE WHEN ? = 'withdrawn' THEN ? ELSE consent_withdrawn_at END,
                consent_policy_version = CASE WHEN ? = 'active' THEN ? ELSE consent_policy_version END,
                consent_source = CASE WHEN ? = 'active' THEN 'myagapay_directory' ELSE consent_source END,
                updated_at = ?, version = version + 1
              WHERE id = ? AND parish_id = ?`,
        params: [
          skill.id,
          values.customDisplayLabel,
          values.experienceLevel,
          values.serviceMode,
          values.availabilityNote,
          values.contactPreference,
          values.visibility,
          values.status,
          status,
          timestamp,
          status,
          timestamp,
          status,
          SKILL_POLICY_VERSION,
          status,
          timestamp,
          existing.id,
          parishId,
        ],
      },
      auditStatement({
        action:
          status === 'withdrawn'
            ? 'directory.skill_listing.consent_withdrawn'
            : status === 'active'
              ? 'directory.skill_listing.activated'
              : 'directory.skill_listing.edited',
        actor,
        parishId,
        targetType: 'directory_person_skill_listing',
        targetId: existing.id,
        after: values,
        correlationId,
      }),
    ]);
    return listingDto(await listingRow(env, { parishId, listingId: existing.id }));
  }
  const id = generateSecret('dir_skill_listing');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_person_skill_listings
              (id, parish_id, person_id, skill_id, custom_display_label, experience_level, service_mode,
               availability_note, contact_preference, visibility, status, consent_recorded_at, consent_policy_version,
               consent_source, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        personId,
        skill.id,
        values.customDisplayLabel,
        values.experienceLevel,
        values.serviceMode,
        values.availabilityNote,
        values.contactPreference,
        values.visibility,
        values.status,
        status === 'active' ? timestamp : null,
        status === 'active' ? SKILL_POLICY_VERSION : null,
        status === 'active' ? 'myagapay_directory' : null,
        context.user.id,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: status === 'active' ? 'directory.skill_listing.activated' : 'directory.skill_listing.created',
      actor,
      parishId,
      targetType: 'directory_person_skill_listing',
      targetId: id,
      after: values,
      correlationId,
    }),
  ]);
  return listingDto(await listingRow(env, { parishId, listingId: id }));
}
async function pauseAllMySkillListings(env, { context, correlationId = '' }) {
  const parishId = parishIdFor(context);
  if (!context.currentPerson?.id)
    throw new DirectoryServiceError('unclaimed', 'Claim a directory person before using skills.', 403);
  const timestamp = nowMs();
  const actor = actorFromContext(context, [DIRECTORY_CAPABILITIES.selfManage]);
  await runAtomic(env, [
    {
      sql: "UPDATE directory_person_skill_listings SET status = 'paused', updated_at = ?1, version = version + 1 WHERE parish_id = ?2 AND person_id = ?3 AND status = 'active'",
      params: [timestamp, parishId, context.currentPerson.id],
    },
    auditStatement({
      action: 'directory.skill_listing.paused_all',
      actor,
      parishId,
      targetType: 'directory_person',
      targetId: context.currentPerson.id,
      correlationId,
    }),
  ]);
  return listMySkillListings(env, { context });
}
async function searchSkillListings(
  env,
  { context, q = '', category = '', serviceMode = '', skillId = '', limit = '', cursor = '' }
) {
  const { rows, settings } = await visibleSkillRows(env, context, { admin: false });
  const query = normalizeQuery(q);
  const filtered = rows.filter((row) => {
    if (category && !CATEGORIES.includes(category))
      throw new DirectoryServiceError('validation_failed', 'Skill category is not supported.', 400);
    if (serviceMode && !SERVICE_MODES.includes(serviceMode))
      throw new DirectoryServiceError('validation_failed', 'Service mode is not supported.', 400);
    if (category && row.category !== category) return false;
    if (serviceMode && row.service_mode !== serviceMode) return false;
    if (skillId && row.skill_id !== skillId) return false;
    if (
      query.length >= 2 &&
      !`${row.name} ${row.custom_display_label || ''} ${row.preferred_name}`.toLowerCase().includes(query)
    )
      return false;
    return true;
  });
  const pageLimit = limitFor(limit);
  const offset = offsetFor(cursor);
  const page = filtered.slice(offset, offset + pageLimit + 1);
  const items = await Promise.all(
    page.slice(0, pageLimit).map(async (row) =>
      listingDto(row, {
        includePerson: true,
        contact: await publishedContact(env, {
          parishId: context.parishId,
          personId: row.person_id,
          preference: row.contact_preference,
          fallback: settings.skillsContactFallback,
        }),
      })
    )
  );
  return {
    items,
    totalVisible: filtered.length,
    nextCursor: nextCursor(offset, pageLimit, page.length),
    disclaimer: settings.skillsDisclaimerText,
  };
}
async function listSkillListingsAdmin(env, { context, status = '', category = '', q = '', limit = '' } = {}) {
  assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const { rows, settings } = await visibleSkillRows(
    env,
    { ...context, parishId: parishIdFor(context) },
    { admin: true }
  );
  const query = normalizeQuery(q);
  return {
    settings,
    listings: rows
      .filter((row) => !status || row.status === status)
      .filter((row) => !category || row.category === category)
      .filter(
        (row) =>
          !query || `${row.name} ${row.custom_display_label || ''} ${row.preferred_name}`.toLowerCase().includes(query)
      )
      .slice(0, Math.min(Number(limit) || 100, 250))
      .map((row) => listingDto(row, { includePerson: true, includeAdmin: true })),
  };
}
async function moderateSkillListing(env, { context, listingId, action, reason = '', correlationId = '' }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), MANAGE_CAPS);
  const parishId = parishIdFor(context);
  const row = await listingRow(env, { parishId, listingId });
  const timestamp = nowMs();
  let status = row.status;
  if (action === 'hide') status = 'hidden_by_parish';
  else if (action === 'restore') {
    if (!row.consent_recorded_at || row.consent_withdrawn_at)
      throw new DirectoryServiceError('consent_required', 'Consent is not currently valid for this listing.', 409);
    status = 'active';
  } else if (action === 'archive') status = 'archived';
  else throw new DirectoryServiceError('validation_failed', 'Moderation action is not supported.');
  await runAtomic(env, [
    {
      sql: `UPDATE directory_person_skill_listings SET
              status = ?, parish_hidden_reason = CASE WHEN ? = 'hidden_by_parish' THEN ? ELSE parish_hidden_reason END,
              parish_hidden_at = CASE WHEN ? = 'hidden_by_parish' THEN ? ELSE parish_hidden_at END,
              reviewed_at = ?, reviewed_by_actor_type = ?, reviewed_by_actor_id = ?, updated_at = ?, version = version + 1
            WHERE id = ? AND parish_id = ?`,
      params: [
        status,
        status,
        cleanText(reason, { max: 300 }),
        status,
        timestamp,
        timestamp,
        actor.actorType,
        actor.userId,
        timestamp,
        row.id,
        parishId,
      ],
    },
    auditStatement({
      action: `directory.skill_listing.${action}`,
      actor,
      parishId,
      targetType: 'directory_person_skill_listing',
      targetId: row.id,
      metadata: { reason: cleanText(reason, { max: 300 }) },
      correlationId,
    }),
  ]);
  return listingDto(await listingRow(env, { parishId, listingId: row.id }), {
    includePerson: true,
    includeAdmin: true,
  });
}
import {
  SKILL_POLICY_VERSION as SKILL_POLICY_VERSION2,
  SKILL_DISCLAIMER as SKILL_DISCLAIMER2,
} from './skills-service-shared.js';
export {
  SKILL_DISCLAIMER2 as SKILL_DISCLAIMER,
  SKILL_POLICY_VERSION2 as SKILL_POLICY_VERSION,
  completeHouseholdVerification,
  createParishSkill,
  exportPublishedAdultsCsv,
  exportSkillsRosterCsv,
  getDirectoryMaintenanceDashboard,
  getHouseholdVerificationStatus,
  listMySkillListings,
  listSkillCatalog,
  listSkillListingsAdmin,
  moderateSkillListing,
  pauseAllMySkillListings,
  printDirectory,
  printSkillsRoster,
  saveMySkillListing,
  searchSkillListings,
  updateParishSkill,
  updateSkillsSettings,
};
