// Generated from src/directory/admin-person-records.ts by npm run build:server. Do not edit.
import '../lib/entitlements.js';
import { actorDto } from './admin-actor.js';
import '../lib/authorization.js';
import { d1All, d1First } from '../lib/core.js';
import '../handlers/parish.js';
import { householdVerificationStatus } from '../lib/household-verification.js';
import './foundation.js';
import { DirectoryServiceError } from './foundation.js';
import { transitionPublicationProfile } from './publication.js';
import { setFieldPrivacyPreference } from './privacy.js';
import './media.js';
import './media-transform.js';
import './duplicates.js';
import './child-publication.js';
import './ministries.js';
import './settings.js';
import './review-correspondence.js';
import './household-share-invitations.js';
import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, maskValue, nowMs, runAtomic } from './shared.js';
import { BIOLOGICAL_SEXES } from './admin-shared.js';
import { requireAny } from './admin-context.js';
import './admin-review-queue.js';
import './admin-shared.js';
import { adminMediaDto } from './admin-media-operations.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
import { listDirectoryNotes } from './admin-notes-duplicates.js';
function requestedDirectoryPublication(preferences = {}) {
  if (!preferences || typeof preferences !== 'object') return false;
  return Object.values(preferences).some(
    (pref) => pref && pref.publicationEligible && pref.visibility === 'directory_members'
  );
}
async function applyPersonPublicationPreferences(env, { context, personId, preferences = {}, correlationId = '' }) {
  if (!preferences || typeof preferences !== 'object') return;
  const actor = actorDto(context);
  const fieldMap = {
    adultPreferredName: 'adult_preferred_name',
    adultEmail: 'adult_email',
    adultPhone: 'adult_phone',
  };
  for (const [key, pref] of Object.entries(preferences)) {
    const fieldKey = fieldMap[key];
    if (!fieldKey || !pref || typeof pref !== 'object') continue;
    await setFieldPrivacyPreference(env, {
      actor,
      parishId: context.parishId,
      ownerType: 'person',
      ownerId: personId,
      fieldKey,
      visibility: pref.visibility || 'private',
      publicationEligible: Boolean(pref.publicationEligible),
      correlationId,
    });
  }
  if (requestedDirectoryPublication(preferences)) {
    const profile = await d1First(
      env,
      "SELECT status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1",
      context.parishId,
      personId
    );
    if (!profile || profile.status === 'draft' || profile.status === 'not_configured') {
      await transitionPublicationProfile(env, {
        actor,
        parishId: context.parishId,
        ownerType: 'person',
        ownerId: personId,
        status: 'pending_approval',
        correlationId,
      });
    }
    await transitionPublicationProfile(env, {
      actor,
      parishId: context.parishId,
      ownerType: 'person',
      ownerId: personId,
      status: 'approved',
      correlationId,
    });
  }
}
function cleanBoolean(value) {
  return value ? 1 : 0;
}
function normalizeSex(value) {
  const cleaned = cleanText(value || 'unknown', { required: true, max: 20, field: 'biologicalSex' });
  if (!BIOLOGICAL_SEXES.has(cleaned))
    throw new DirectoryServiceError('validation_failed', 'Biological sex is not supported.');
  return cleaned;
}
async function applyPersonAdminFields(
  env,
  { context, personId, patch = {}, allowedFields, expectedVersion = '', auditAction, correlationId = '' }
) {
  const row = await d1First(
    env,
    'SELECT * FROM directory_people WHERE id = ?1',
    cleanText(personId, { required: true, max: 180, field: 'personId' })
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory person was not found.', 404);
  if (expectedVersion && String(expectedVersion) !== String(row.updated_at || ''))
    throw new DirectoryServiceError('stale_record', 'Person changed. Refresh before correcting.', 409);
  const fields = new Set(allowedFields);
  const next = {
    preferredName: row.preferred_name,
    legalName: row.legal_name || '',
    middleName: row.middle_name || '',
    suffix: row.suffix || '',
    biologicalSex: row.biological_sex || 'unknown',
    deceased: Number(row.deceased || 0),
    active: Number(row.active || 0),
    notes: row.notes || '',
  };
  if (fields.has('preferredName') && 'preferredName' in patch)
    next.preferredName = cleanText(patch.preferredName, { required: true, max: 160, field: 'preferredName' });
  if (fields.has('legalName') && 'legalName' in patch)
    next.legalName = cleanText(patch.legalName, { max: 160, field: 'legalName' });
  if (fields.has('middleName') && 'middleName' in patch)
    next.middleName = cleanText(patch.middleName, { max: 160, field: 'middleName' });
  if (fields.has('suffix') && 'suffix' in patch) next.suffix = cleanText(patch.suffix, { max: 80, field: 'suffix' });
  if (fields.has('biologicalSex') && 'biologicalSex' in patch) next.biologicalSex = normalizeSex(patch.biologicalSex);
  if (fields.has('deceased') && 'deceased' in patch) next.deceased = cleanBoolean(patch.deceased);
  if (fields.has('active') && 'active' in patch) next.active = cleanBoolean(patch.active);
  if (fields.has('notes') && 'notes' in patch) next.notes = cleanText(patch.notes, { max: 2e3, field: 'notes' });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: `UPDATE directory_people
            SET preferred_name = ?, legal_name = ?, middle_name = ?, suffix = ?,
                biological_sex = ?, deceased = ?, active = ?, notes = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        next.preferredName,
        next.legalName,
        next.middleName,
        next.suffix,
        next.biologicalSex,
        next.deceased,
        next.active,
        next.notes,
        timestamp,
        row.id,
      ],
    },
    auditStatement({
      action: auditAction,
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: 'directory_person',
      targetId: row.id,
      before: { preferredName: row.preferred_name, active: Boolean(row.active), deceased: Boolean(row.deceased) },
      after: { preferredName: next.preferredName, active: Boolean(next.active), deceased: Boolean(next.deceased) },
      correlationId,
    }),
  ]);
  return {
    id: row.id,
    preferredName: next.preferredName,
    legalName: next.legalName,
    middleName: next.middleName,
    suffix: next.suffix,
    biologicalSex: next.biologicalSex,
    deceased: Boolean(next.deceased),
    active: Boolean(next.active),
    notes: next.notes,
    updatedAt: timestamp,
  };
}
async function listDirectoryPeopleAdmin(env, { context, query = '', limit = 50 }) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.peopleManage,
    DIRECTORY_CAPABILITIES.requestsReview,
  ]);
  const q = `%${String(query || '').trim()}%`;
  const rows = await d1All(
    env,
    `SELECT p.id, p.preferred_name, p.active, p.updated_at,
            COUNT(DISTINCT hm.household_id) AS household_count,
            COUNT(DISTINCT cr.id) AS pending_request_count,
            MAX(COALESCE(f.protected_person, 0)) AS protected_person,
            MAX(COALESCE(f.is_child, 0)) AS is_child,
            CASE WHEN COUNT(DISTINCT l.id) > 0 THEN 1 ELSE 0 END AS claimed,
            CASE WHEN EXISTS (
              SELECT 1
                FROM directory_household_members person_hm
                JOIN directory_household_admins linked_admin
                  ON linked_admin.household_id = person_hm.household_id AND linked_admin.active = 1
                JOIN directory_person_links admin_link
                  ON admin_link.person_id = linked_admin.person_id
                 AND admin_link.link_type = 'platform_user' AND admin_link.active = 1
               WHERE person_hm.person_id = p.id AND person_hm.active = 1
            ) THEN 1 ELSE 0 END AS household_managed,
            photo.id AS photo_id, photo.owner_type AS photo_owner_type, photo.owner_id AS photo_owner_id,
            photo.media_purpose AS photo_media_purpose, photo.lifecycle_status AS photo_lifecycle_status,
            photo.processing_status AS photo_processing_status, photo.visibility AS photo_visibility,
            photo.publication_eligible AS photo_publication_eligible, photo.original_width AS photo_original_width,
            photo.original_height AS photo_original_height
       FROM directory_people p
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id
       LEFT JOIN directory_change_requests cr ON cr.parish_id = ?1 AND cr.target_type = 'person' AND cr.target_id = p.id AND cr.status = 'pending'
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_person_links l ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
       LEFT JOIN directory_media_assignments photo_asn ON photo_asn.parish_id = ?1
        AND photo_asn.owner_type = 'person' AND photo_asn.owner_id = p.id
        AND photo_asn.media_purpose = 'person_profile_photo' AND photo_asn.assignment_status IN ('active','candidate')
       LEFT JOIN directory_media_assets photo ON photo.id = photo_asn.media_asset_id
        AND photo.lifecycle_status NOT IN ('deleted','replaced','failed')
      WHERE (p.created_by_parish_id = ?1 OR h.parish_id = ?1) AND (?2 = '%%' OR p.preferred_name LIKE ?2)
      GROUP BY p.id
      ORDER BY p.preferred_name
      LIMIT ?3`,
    context.parishId,
    q,
    Math.min(Number(limit) || 50, 100)
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.preferred_name,
    active: Number(row.active || 0) === 1,
    householdCount: Number(row.household_count || 0),
    pendingRequestCount: Number(row.pending_request_count || 0),
    protected: context.permissions.canManageProtected
      ? Number(row.protected_person || 0) === 1
      : Number(row.protected_person || 0) === 1,
    child: Number(row.is_child || 0) === 1,
    claimed: Number(row.claimed || 0) === 1,
    householdManaged: Number(row.household_managed || 0) === 1,
    photo: adminMediaDto(
      {
        id: row.photo_id,
        parish_id: context.parishId,
        owner_type: row.photo_owner_type,
        owner_id: row.photo_owner_id,
        media_purpose: row.photo_media_purpose,
        lifecycle_status: row.photo_lifecycle_status,
        processing_status: row.photo_processing_status,
        visibility: row.photo_visibility,
        publication_eligible: row.photo_publication_eligible,
        original_width: row.photo_original_width,
        original_height: row.photo_original_height,
      },
      'avatar_medium'
    ),
    lastUpdated: Number(row.updated_at || 0),
  }));
}
async function getDirectoryPersonAdmin(env, { context, personId }) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.peopleManage,
    DIRECTORY_CAPABILITIES.requestsReview,
  ]);
  const id = cleanText(personId, { required: true, max: 180, field: 'personId' });
  const row = await d1First(env, 'SELECT * FROM directory_people WHERE id = ?1', id);
  if (!row) throw new DirectoryServiceError('not_found', 'Directory person was not found.', 404);
  const [households, affiliations, publication, contacts, notes, flags, accountLink, householdManager, invitation] =
    await Promise.all([
      d1All(
        env,
        `SELECT h.id, h.display_name, hm.relationship FROM directory_household_members hm JOIN directory_households h ON h.id = hm.household_id WHERE hm.person_id = ?1 AND h.parish_id = ?2 AND hm.active = 1`,
        id,
        context.parishId
      ),
      d1All(
        env,
        'SELECT status, active FROM directory_parish_affiliations WHERE person_id = ?1 AND parish_id = ?2',
        id,
        context.parishId
      ),
      d1First(
        env,
        "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1",
        context.parishId,
        id
      ),
      context.permissions.canViewPrivateContact
        ? d1All(
            env,
            "SELECT contact_type, label, value, visibility FROM directory_contact_methods WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2 AND active = 1",
            context.parishId,
            id
          )
        : [],
      context.permissions.canViewNotes ? listDirectoryNotes(env, { context, targetType: 'person', targetId: id }) : [],
      d1First(
        env,
        'SELECT is_child FROM directory_person_privacy_flags WHERE parish_id = ?1 AND person_id = ?2 AND active = 1 ORDER BY updated_at DESC LIMIT 1',
        context.parishId,
        id
      ),
      d1First(
        env,
        "SELECT id FROM directory_person_links WHERE person_id = ?1 AND link_type = 'platform_user' AND active = 1",
        id
      ),
      d1First(
        env,
        `SELECT linked_admin.person_id
         FROM directory_household_members person_hm
         JOIN directory_households h
           ON h.id = person_hm.household_id AND h.parish_id = ?2 AND h.active = 1
         JOIN directory_household_admins linked_admin
           ON linked_admin.household_id = person_hm.household_id AND linked_admin.active = 1
         JOIN directory_person_links admin_link
           ON admin_link.person_id = linked_admin.person_id
          AND admin_link.link_type = 'platform_user' AND admin_link.active = 1
        WHERE person_hm.person_id = ?1 AND person_hm.active = 1
        LIMIT 1`,
        id,
        context.parishId
      ),
      d1First(
        env,
        `SELECT id, status, recipient_email, intended_household_id, created_at, expires_at
         FROM directory_invitations
        WHERE parish_id = ?1 AND intended_person_id = ?2
          AND status IN ('pending','sent','opened','accepted')
        ORDER BY created_at DESC LIMIT 1`,
        context.parishId,
        id
      ),
    ]);
  const primaryHouseholdId = households[0]?.id || '';
  const verification = primaryHouseholdId
    ? await d1First(
        env,
        'SELECT verification_status, verification_due_at, last_verified_at, verification_policy_version FROM directory_household_verifications WHERE household_id = ?1 AND parish_id = ?2',
        primaryHouseholdId,
        context.parishId
      )
    : null;
  return {
    person: {
      id: row.id,
      preferredName: row.preferred_name,
      legalName: context.permissions.canManagePeople ? row.legal_name || '' : maskValue(row.legal_name),
      active: Number(row.active || 0) === 1,
      version: row.updated_at,
    },
    households,
    affiliations,
    parishConnected:
      affiliations.length === 0 ||
      affiliations.some(
        (affiliation) => Number(affiliation.active || 0) === 1 && affiliation.status !== 'former_member'
      ),
    publication: publication || null,
    householdVerification: {
      status: householdVerificationStatus(verification),
      dueAt: Number(verification?.verification_due_at || 0),
      lastVerifiedAt: Number(verification?.last_verified_at || 0),
      policyVersion: verification?.verification_policy_version || '',
    },
    contacts: contacts.map((contact) => ({
      ...contact,
      value: context.permissions.canViewPrivateContact ? contact.value : maskValue(contact.value, contact.contact_type),
    })),
    notes,
    accountAccess: {
      child: Number(flags?.is_child || 0) === 1,
      linked: Boolean(accountLink),
      householdManaged: Boolean(householdManager),
      activeInvitation: invitation
        ? {
            id: invitation.id,
            status: invitation.status,
            recipientEmail: invitation.recipient_email || '',
            householdId: invitation.intended_household_id || '',
            createdAt: Number(invitation.created_at || 0),
            expiresAt: Number(invitation.expires_at || 0),
          }
        : null,
    },
  };
}
async function applyPersonDirectCorrection(
  env,
  { context, personId, patch = {}, expectedVersion, correlationId = '' }
) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.peopleManage]);
  const allowed = {};
  for (const key of ['preferredName', 'middleName', 'suffix']) if (key in patch) allowed[key] = patch[key];
  return applyPersonAdminFields(env, {
    context,
    personId,
    patch: allowed,
    allowedFields: ['preferredName', 'middleName', 'suffix'],
    expectedVersion,
    auditAction: 'directory.admin.person_direct_correction',
    correlationId,
  });
}
async function removeDirectoryPersonFromParish(
  env,
  { context, personId, expectedVersion = '', reasonCode = 'parish_directory_removed', correlationId = '' }
) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.peopleManage, DIRECTORY_CAPABILITIES.manage]);
  const id = cleanText(personId, { required: true, max: 180, field: 'personId' });
  const row = await d1First(
    env,
    `SELECT p.*,
            EXISTS (
              SELECT 1 FROM directory_parish_affiliations affiliation
               WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
                 AND affiliation.active = 1 AND affiliation.status != 'former_member'
            ) AS parish_connected
       FROM directory_people p
      WHERE p.id = ?1 AND (
        p.created_by_parish_id = ?2
        OR EXISTS (
          SELECT 1 FROM directory_household_members membership
          JOIN directory_households household ON household.id = membership.household_id
          WHERE membership.person_id = p.id AND household.parish_id = ?2
        )
        OR EXISTS (
          SELECT 1 FROM directory_parish_affiliations affiliation
          WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
        )
      )`,
    id,
    context.parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory person was not found for this parish.', 404);
  if (expectedVersion && String(expectedVersion) !== String(row.updated_at || '')) {
    throw new DirectoryServiceError('stale_record', 'Person changed. Refresh before removing parish access.', 409);
  }
  const timestamp = nowMs();
  const leftDate = new Date(timestamp).toISOString().slice(0, 10);
  const reason = cleanText(reasonCode, { max: 120, field: 'reasonCode' }) || 'parish_directory_removed';
  await runAtomic(env, [
    {
      sql: `UPDATE directory_parish_affiliations
               SET active = 0, left_date = COALESCE(left_date, ?1), updated_at = ?2
             WHERE person_id = ?3 AND parish_id = ?4 AND active = 1`,
      params: [leftDate, timestamp, id, context.parishId],
    },
    {
      sql: `UPDATE directory_publication_profiles
               SET status = 'paused', updated_at = ?1
             WHERE parish_id = ?2 AND owner_type = 'person' AND owner_id = ?3
               AND active = 1 AND status NOT IN ('paused', 'archived')`,
      params: [timestamp, context.parishId, id],
    },
    {
      sql: `UPDATE directory_person_skill_listings
               SET status = 'withdrawn', consent_withdrawn_at = COALESCE(consent_withdrawn_at, ?1),
                   updated_at = ?1, version = version + 1
             WHERE parish_id = ?2 AND person_id = ?3
               AND status IN ('draft', 'active', 'paused', 'hidden_by_parish')`,
      params: [timestamp, context.parishId, id],
    },
    {
      sql: 'UPDATE directory_people SET updated_at = ?1 WHERE id = ?2',
      params: [timestamp, id],
    },
    auditStatement({
      action: 'directory.person.removed_from_parish',
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: 'directory_person',
      targetId: id,
      before: { parishConnected: Number(row.parish_connected || 0) === 1 },
      after: { parishConnected: false, directoryPublication: 'paused', koinoniaAccess: 'blocked' },
      metadata: { reasonCode: reason, accountAndGivingHistoryPreserved: true },
      correlationId,
    }),
  ]);
  return getDirectoryPersonAdmin(env, { context, personId: id });
}
export {
  applyPersonAdminFields,
  applyPersonDirectCorrection,
  applyPersonPublicationPreferences,
  cleanBoolean,
  getDirectoryPersonAdmin,
  listDirectoryPeopleAdmin,
  normalizeSex,
  removeDirectoryPersonFromParish,
  requestedDirectoryPublication,
};
