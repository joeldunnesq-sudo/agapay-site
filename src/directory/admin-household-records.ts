import type { DirectoryReviewSqlRow, DirectoryReviewContext } from './admin-composition-contracts.js';

import '../lib/entitlements.js';

import { actorDto } from './admin-actor.js';

import '../lib/authorization.js';

import { d1All, d1First } from '../lib/core.js';

import '../handlers/parish.js';

import { householdVerificationStatus } from '../lib/household-verification.js';

import './foundation.js';

import { DirectoryServiceError } from './foundation.js';

import './publication.js';

import './privacy.js';

import './media.js';

import './media-transform.js';

import './duplicates.js';

import './child-publication.js';

import './ministries.js';

import './settings.js';

import './review-correspondence.js';

import './household-share-invitations.js';

import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic } from './shared.js';
import './admin-shared.js';
import { requireAny } from './admin-context.js';
import './admin-review-queue.js';
import './admin-shared.js';
import { adminMediaDto, currentAdminMediaForOwner } from './admin-media-operations.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import { listDirectoryNotes } from './admin-notes-duplicates.js';

export async function listDirectoryHouseholdsAdmin(
  env: Partial<Env>,
  { context, query = '', limit = 50 }: { context: DirectoryReviewContext; query?: unknown; limit?: unknown }
) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.householdsManage,
    DIRECTORY_CAPABILITIES.requestsReview,
  ]);
  const q = `%${String(query || '').trim()}%`;
  const rows = await d1All<DirectoryReviewSqlRow>(
    env,
    `SELECT h.id, h.display_name, h.active, h.updated_at,
            COUNT(DISTINCT hm.person_id) AS member_count,
            COUNT(DISTINCT ha.person_id) AS admin_count,
            COUNT(DISTINCT cr.id) AS pending_request_count,
            MAX(COALESCE(a.protected_address, 0)) AS protected_address,
            (SELECT c.value
               FROM directory_contact_methods c
               JOIN directory_household_members hm_contact ON hm_contact.person_id = c.owner_id AND hm_contact.active = 1
              WHERE hm_contact.household_id = h.id AND c.parish_id = h.parish_id
                AND c.owner_type = 'person' AND c.contact_type = 'email' AND c.active = 1
              ORDER BY CASE hm_contact.relationship WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END,
                       c.is_primary DESC, c.created_at ASC LIMIT 1) AS staff_email,
            (SELECT c.visibility
               FROM directory_contact_methods c
               JOIN directory_household_members hm_contact ON hm_contact.person_id = c.owner_id AND hm_contact.active = 1
              WHERE hm_contact.household_id = h.id AND c.parish_id = h.parish_id
                AND c.owner_type = 'person' AND c.contact_type = 'email' AND c.active = 1
              ORDER BY CASE hm_contact.relationship WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END,
                       c.is_primary DESC, c.created_at ASC LIMIT 1) AS email_visibility,
            (SELECT c.value
               FROM directory_contact_methods c
               JOIN directory_household_members hm_contact ON hm_contact.person_id = c.owner_id AND hm_contact.active = 1
              WHERE hm_contact.household_id = h.id AND c.parish_id = h.parish_id
                AND c.owner_type = 'person' AND c.contact_type = 'phone' AND c.active = 1
              ORDER BY CASE hm_contact.relationship WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END,
                       c.is_primary DESC, c.created_at ASC LIMIT 1) AS staff_phone,
            (SELECT c.visibility
               FROM directory_contact_methods c
               JOIN directory_household_members hm_contact ON hm_contact.person_id = c.owner_id AND hm_contact.active = 1
              WHERE hm_contact.household_id = h.id AND c.parish_id = h.parish_id
                AND c.owner_type = 'person' AND c.contact_type = 'phone' AND c.active = 1
              ORDER BY CASE hm_contact.relationship WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END,
                       c.is_primary DESC, c.created_at ASC LIMIT 1) AS phone_visibility,
            (SELECT da.line1 FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_line1,
            (SELECT da.line2 FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_line2,
            (SELECT da.city FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_city,
            (SELECT da.region FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_region,
            (SELECT da.postal_code FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_postal_code,
            (SELECT da.country FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_country,
            (SELECT da.visibility FROM directory_addresses da
              WHERE da.parish_id = h.parish_id AND da.owner_type = 'household' AND da.owner_id = h.id AND da.active = 1
              ORDER BY da.is_primary DESC, da.created_at ASC LIMIT 1) AS address_visibility,
            photo.id AS photo_id, photo.owner_type AS photo_owner_type, photo.owner_id AS photo_owner_id,
            photo.media_purpose AS photo_media_purpose, photo.lifecycle_status AS photo_lifecycle_status,
            photo.processing_status AS photo_processing_status, photo.visibility AS photo_visibility,
            photo.publication_eligible AS photo_publication_eligible, photo.original_width AS photo_original_width,
            photo.original_height AS photo_original_height
       FROM directory_households h
       LEFT JOIN directory_household_members hm ON hm.household_id = h.id AND hm.active = 1
       LEFT JOIN directory_household_admins ha ON ha.household_id = h.id AND ha.active = 1
       LEFT JOIN directory_change_requests cr ON cr.parish_id = h.parish_id AND cr.target_type = 'household' AND cr.target_id = h.id AND cr.status = 'pending'
       LEFT JOIN directory_addresses a ON a.parish_id = h.parish_id AND a.owner_type = 'household' AND a.owner_id = h.id AND a.active = 1
       LEFT JOIN directory_media_assignments photo_asn ON photo_asn.parish_id = h.parish_id
        AND photo_asn.owner_type = 'household' AND photo_asn.owner_id = h.id
        AND photo_asn.media_purpose = 'household_profile_photo' AND photo_asn.assignment_status IN ('active','candidate')
       LEFT JOIN directory_media_assets photo ON photo.id = photo_asn.media_asset_id
        AND photo.lifecycle_status NOT IN ('deleted','replaced','failed')
      WHERE h.parish_id = ?1 AND (
        ?2 = '%%' OR h.display_name LIKE ?2 OR EXISTS (
          SELECT 1
            FROM directory_household_members search_hm
            JOIN directory_people search_person ON search_person.id = search_hm.person_id
            LEFT JOIN directory_contact_methods search_contact
              ON search_contact.parish_id = h.parish_id
             AND search_contact.owner_type = 'person'
             AND search_contact.owner_id = search_person.id
             AND search_contact.contact_type = 'email'
             AND search_contact.active = 1
           WHERE search_hm.household_id = h.id AND search_hm.active = 1
             AND (search_person.preferred_name LIKE ?2 OR search_person.legal_name LIKE ?2 OR search_contact.value LIKE ?2)
        )
      )
      GROUP BY h.id
      ORDER BY h.display_name
      LIMIT ?3`,
    context.parishId,
    q,
    Math.min(Number(limit) || 50, 100)
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    active: Number(row.active || 0) === 1,
    memberCount: Number(row.member_count || 0),
    administratorCount: Number(row.admin_count || 0),
    pendingRequestCount: Number(row.pending_request_count || 0),
    protectedAddress: Number(row.protected_address || 0) === 1,
    staffContact: context.permissions.canViewPrivateContact
      ? {
          email: { value: row.staff_email || '', visibility: row.email_visibility || 'private' },
          phone: { value: row.staff_phone || '', visibility: row.phone_visibility || 'private' },
          address: {
            line1: row.address_line1 || '',
            line2: row.address_line2 || '',
            city: row.address_city || '',
            region: row.address_region || '',
            postalCode: row.address_postal_code || '',
            country: row.address_country || '',
            visibility: row.address_visibility || 'private',
          },
        }
      : null,
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
      'household_card'
    ),
    lastUpdated: Number(row.updated_at || 0),
  }));
}

export async function getDirectoryHouseholdAdmin(
  env: Partial<Env>,
  { context, householdId }: { context: DirectoryReviewContext; householdId?: unknown }
) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.householdsManage,
    DIRECTORY_CAPABILITIES.requestsReview,
  ]);
  const id = cleanText(householdId, { required: true, max: 180, field: 'householdId' });
  const household = await d1First<DirectoryReviewSqlRow>(
    env,
    'SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2',
    id,
    context.parishId
  );
  if (!household) throw new DirectoryServiceError('not_found', 'Directory household was not found.', 404);
  const [members, admins, publication, verification, photo, notes, contacts, addresses] = await Promise.all([
    d1All<DirectoryReviewSqlRow>(
      env,
      `SELECT p.id, p.preferred_name, p.updated_at AS person_version, hm.relationship,
              MAX(COALESCE(f.is_child, 0)) AS is_child,
              CASE WHEN COUNT(DISTINCT l.id) > 0 THEN 1 ELSE 0 END AS account_linked,
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM directory_parish_affiliations affiliation
                 WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
              ) OR EXISTS (
                SELECT 1 FROM directory_parish_affiliations affiliation
                 WHERE affiliation.person_id = p.id AND affiliation.parish_id = ?2
                   AND affiliation.active = 1 AND affiliation.status != 'former_member'
              ) THEN 1 ELSE 0 END AS parish_connected,
              (SELECT c.value FROM directory_contact_methods c
                WHERE c.parish_id = ?2 AND c.owner_type = 'person' AND c.owner_id = p.id
                  AND c.contact_type = 'email' AND c.active = 1
                ORDER BY c.is_primary DESC, c.created_at ASC LIMIT 1) AS email,
              (SELECT i.id FROM directory_invitations i
                WHERE i.parish_id = ?2 AND i.intended_person_id = p.id
                  AND i.status IN ('pending','sent','opened','accepted')
                ORDER BY i.created_at DESC LIMIT 1) AS invitation_id,
              (SELECT i.status FROM directory_invitations i
                WHERE i.parish_id = ?2 AND i.intended_person_id = p.id
                  AND i.status IN ('pending','sent','opened','accepted')
                ORDER BY i.created_at DESC LIMIT 1) AS invitation_status,
              (SELECT i.recipient_email FROM directory_invitations i
                WHERE i.parish_id = ?2 AND i.intended_person_id = p.id
                  AND i.status IN ('pending','sent','opened','accepted')
                ORDER BY i.created_at DESC LIMIT 1) AS invitation_email,
              (SELECT i.expires_at FROM directory_invitations i
                WHERE i.parish_id = ?2 AND i.intended_person_id = p.id
                  AND i.status IN ('pending','sent','opened','accepted')
                ORDER BY i.created_at DESC LIMIT 1) AS invitation_expires_at
         FROM directory_household_members hm
         JOIN directory_people p ON p.id = hm.person_id
         LEFT JOIN directory_person_privacy_flags f
           ON f.parish_id = ?2 AND f.person_id = p.id AND f.active = 1
         LEFT JOIN directory_person_links l
           ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
        WHERE hm.household_id = ?1 AND hm.active = 1
        GROUP BY p.id, hm.relationship
        ORDER BY p.preferred_name`,
      id,
      context.parishId
    ),
    d1All<DirectoryReviewSqlRow>(
      env,
      `SELECT p.id, p.preferred_name,
              CASE WHEN COUNT(DISTINCT l.id) > 0 THEN 1 ELSE 0 END AS account_linked
         FROM directory_household_admins ha
         JOIN directory_people p ON p.id = ha.person_id
         LEFT JOIN directory_person_links l
           ON l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1
        WHERE ha.household_id = ?1 AND ha.active = 1
        GROUP BY p.id
        ORDER BY p.preferred_name`,
      id
    ),
    d1First<DirectoryReviewSqlRow>(
      env,
      "SELECT status, approval_status FROM directory_publication_profiles WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1",
      context.parishId,
      id
    ),
    d1First<DirectoryReviewSqlRow>(
      env,
      'SELECT verification_status, verification_due_at, last_verified_at, verification_policy_version FROM directory_household_verifications WHERE household_id = ?1 AND parish_id = ?2',
      id,
      context.parishId
    ),
    currentAdminMediaForOwner(env, { parishId: context.parishId, ownerType: 'household', ownerId: id }),
    context.permissions.canViewNotes ? listDirectoryNotes(env, { context, targetType: 'household', targetId: id }) : [],
    context.permissions.canViewPrivateContact
      ? d1All<DirectoryReviewSqlRow>(
          env,
          `SELECT c.contact_type, c.label, c.value, c.visibility, c.is_primary, p.preferred_name, p.id AS person_id
         FROM directory_household_members hm
         JOIN directory_people p ON p.id = hm.person_id
         JOIN directory_contact_methods c ON c.owner_type = 'person' AND c.owner_id = p.id AND c.active = 1
        WHERE hm.household_id = ?1 AND hm.active = 1 AND c.parish_id = ?2
        ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 ELSE 2 END,
                 c.contact_type, c.is_primary DESC, c.created_at ASC`,
          id,
          context.parishId
        )
      : [],
    context.permissions.canViewPrivateContact
      ? d1All<DirectoryReviewSqlRow>(
          env,
          `SELECT address_type, line1, line2, city, region, postal_code, country, visibility, is_primary
         FROM directory_addresses
        WHERE parish_id = ?1 AND owner_type = 'household' AND owner_id = ?2 AND active = 1
        ORDER BY is_primary DESC, created_at ASC`,
          context.parishId,
          id
        )
      : [],
  ]);
  return {
    household: {
      id,
      displayName: household.display_name,
      active: Number(household.active || 0) === 1,
      version: household.updated_at,
    },
    members: members.map((member) => ({
      ...member,
      child: Number(member.is_child || 0) === 1,
      accountLinked: Number(member.account_linked || 0) === 1,
      parishConnected: Number(member.parish_connected || 0) === 1,
      personVersion: Number(member.person_version || 0),
      email: member.email || '',
      invitation: member.invitation_id
        ? {
            id: member.invitation_id,
            status: member.invitation_status,
            recipientEmail: member.invitation_email || '',
            expiresAt: Number(member.invitation_expires_at || 0),
          }
        : null,
    })),
    administrators: admins.map((admin) => ({ ...admin, accountLinked: Number(admin.account_linked || 0) === 1 })),
    accountManaged: admins.some((admin) => Number(admin.account_linked || 0) === 1),
    publication: publication || null,
    verification: {
      status: householdVerificationStatus(verification),
      dueAt: Number(verification?.verification_due_at || 0),
      lastVerifiedAt: Number(verification?.last_verified_at || 0),
      policyVersion: verification?.verification_policy_version || '',
    },
    photo,
    notes,
    contacts: contacts.map((contact) => ({
      contactType: contact.contact_type,
      label: contact.label,
      value: contact.value,
      visibility: contact.visibility || 'private',
      primary: Number(contact.is_primary || 0) === 1,
      personId: contact.person_id,
      personName: contact.preferred_name,
    })),
    addresses: addresses.map((address) => ({
      addressType: address.address_type,
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.city || '',
      region: address.region || '',
      postalCode: address.postal_code || '',
      country: address.country || '',
      visibility: address.visibility || 'private',
      primary: Number(address.is_primary || 0) === 1,
      directoryDisplay: [address.city, address.region].filter(Boolean).join(', '),
    })),
  };
}

export async function applyHouseholdDirectCorrection(
  env: Partial<Env>,
  {
    context,
    householdId,
    patch = {},
    expectedVersion,
    correlationId = '',
  }: {
    context: DirectoryReviewContext;
    householdId?: unknown;
    patch?: Record<string, unknown>;
    expectedVersion?: unknown;
    correlationId?: string;
  }
) {
  requireAny(actorDto(context), context.parishId, [DIRECTORY_CAPABILITIES.householdsManage]);
  const row = await d1First<DirectoryReviewSqlRow>(
    env,
    'SELECT * FROM directory_households WHERE id = ?1 AND parish_id = ?2',
    cleanText(householdId, { required: true, max: 180, field: 'householdId' }),
    context.parishId
  );
  if (!row) throw new DirectoryServiceError('not_found', 'Directory household was not found.', 404);
  if (String(expectedVersion || '') !== String(row.updated_at || ''))
    throw new DirectoryServiceError('stale_record', 'Household changed. Refresh before correcting.', 409);
  const displayName = cleanText(patch.displayName, { required: true, max: 200, field: 'displayName' });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_households SET display_name = ?, updated_at = ? WHERE id = ? AND parish_id = ?',
      params: [displayName, timestamp, householdId, context.parishId],
    },
    auditStatement({
      action: 'directory.admin.household_direct_correction',
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: 'directory_household',
      targetId: householdId as string,
      before: { displayName: row.display_name },
      after: { displayName },
      correlationId,
    }),
  ]);
  return getDirectoryHouseholdAdmin(env, { context, householdId });
}
