import type { SelfServiceSqlRow, SelfServiceContext, DonorRecord } from './self-service-composition-contracts.js';

import { d1First, generateSecret, loadDonor } from '../lib/core.js';

import '../lib/authorization.js';

import { DirectoryServiceError } from './foundation.js';

import {
  createAddress,
  createContactMethod,
  listActiveAddressesForOwner,
  listActiveContactsForOwner,
  updateAddress,
  updateContactMethod,
} from './contacts.js';

import './invitations.js';

import { getPersonPrivacyFlags, setFieldPrivacyPreference } from './privacy.js';

import { getPublicationProfile } from './publication.js';

import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, nowMs, runAtomic, safeJson } from './shared.js';
import { EDITABLE_PERSON_FIELDS, REVIEW_PERSON_FIELDS } from './self-service-shared.js';
import {
  toBool,
  cleanDate,
  normalizeStarterParishId,
  normalizeStarterVisibility,
  personDto,
  contactDto,
  addressDto,
  selfActor,
  assertExpectedVersion,
  assertNoUnknownFields,
  notificationStatement,
} from './self-service-shared.js';
import { resolveDirectorySelfServiceContext } from './self-service-context.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import { createSelfServiceContact, setSelfServicePrivacyPreference } from './self-service-contact-privacy.js';
import { createDirectoryChangeRequest } from './self-service-requests.js';
import './self-service-invitations.js';

export async function getSelfServiceProfile(env: Partial<Env>, { context }: { context: SelfServiceContext }) {
  if (!context.claimed) return context;
  const donor = await loadDonor(env, context.user.email).catch(() => null);
  if (donor) await syncSelfServiceContactsFromDonor(env, { context, donor }).catch(() => null);
  const parishId = context.activeParishContexts[0]?.parishId || context.currentPerson!.id;
  const [contacts, addresses, publication, namePreference, birthdayPreference] = await Promise.all([
    listActiveContactsForOwner(env, { parishId, ownerType: 'person', ownerId: context.currentPerson!.id }),
    listActiveAddressesForOwner(env, { parishId, ownerType: 'person', ownerId: context.currentPerson!.id }),
    getPublicationProfile(env, { parishId, ownerType: 'person', ownerId: context.currentPerson!.id }),
    d1First<SelfServiceSqlRow>(
      env,
      `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2
         AND field_key = 'adult_preferred_name' AND active = 1`,
      parishId,
      context.currentPerson!.id
    ),
    d1First<SelfServiceSqlRow>(
      env,
      `SELECT visibility, publication_eligible
       FROM directory_field_privacy_preferences
       WHERE parish_id = ?1 AND owner_type = 'person' AND owner_id = ?2
         AND field_key = 'adult_birthday' AND active = 1`,
      parishId,
      context.currentPerson!.id
    ),
  ]);
  return {
    ...context,
    profile: {
      person: context.currentPerson,
      contacts: contacts.map(contactDto),
      addresses: addresses.map(addressDto),
      publication,
      sharing: {
        name: {
          visibility: namePreference?.visibility || 'directory_members',
          publicationEligible: namePreference ? toBool(namePreference.publication_eligible) : true,
        },
        birthday: {
          visibility: birthdayPreference?.visibility || 'private',
          publicationEligible: birthdayPreference ? toBool(birthdayPreference.publication_eligible) : false,
        },
      },
      editableFields: EDITABLE_PERSON_FIELDS,
      reviewFields: REVIEW_PERSON_FIELDS,
    },
  };
}

export async function syncSelfServiceContactsFromDonor(
  env: Partial<Env>,
  { context, donor, correlationId = '' }: { context: SelfServiceContext; donor?: DonorRecord; correlationId?: string }
) {
  if (!context?.claimed || !donor) return { synced: false };
  const parishId = context.activeParishContexts[0]?.parishId;
  const personId = context.currentPerson?.id;
  if (!parishId || !personId) return { synced: false };
  const actor = selfActor(context, parishId);
  const contacts = await listActiveContactsForOwner(env, { parishId, ownerType: 'person', ownerId: personId });
  const syncContact = async (contactType: string, value: unknown, label: string) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return;
    const existing =
      contacts.find((contact) => contact.contactType === contactType && contact.primary) ||
      contacts.find((contact) => contact.contactType === contactType);
    if (!existing) {
      await createContactMethod(env, {
        actor,
        parishId,
        ownerType: 'person',
        ownerId: personId,
        contactType,
        value: cleaned,
        label,
        primary: true,
        verified: contactType === 'email' && Boolean(donor.emailVerifiedAt),
        visibility: 'private',
        correlationId,
      });
    } else if (String(existing.value || '').trim() !== cleaned) {
      await updateContactMethod(env, {
        actor,
        parishId,
        contactId: existing.id,
        patch: {
          value: cleaned,
          label: existing.label || label,
          primary: true,
          visibility: existing.visibility || 'private',
        },
        correlationId,
      });
    }
  };
  await syncContact('email', donor.email, 'personal').catch(() => null);
  await syncContact('phone', donor.contactPhone, 'mobile').catch(() => null);

  const household =
    context.manageableHouseholds.find((item) => item.parishId === parishId) || context.manageableHouseholds[0];
  const addressComplete = String(donor.addressLine1 || '').trim() && String(donor.city || '').trim();
  if (household && addressComplete) {
    const addresses = await listActiveAddressesForOwner(env, {
      parishId: household.parishId,
      ownerType: 'household',
      ownerId: household.id,
    });
    const existing = addresses.find((address) => address.primary) || addresses[0];
    const addressData = {
      line1: donor.addressLine1,
      line2: donor.addressLine2 || '',
      city: donor.city,
      region: donor.state || '',
      postalCode: donor.postalCode || '',
      country: donor.country || 'US',
      primary: true,
    };
    if (existing) {
      const changed = (['line1', 'line2', 'city', 'region', 'postalCode', 'country'] as const).some(
        (key) => String(existing[key] || '').trim() !== String(addressData[key] || '').trim()
      );
      if (changed) {
        await updateAddress(env, {
          actor: selfActor(context, household.parishId),
          parishId: household.parishId,
          addressId: existing.id,
          patch: { ...addressData, visibility: existing.visibility || 'private' },
          correlationId,
        }).catch(() => null);
      }
    } else {
      await createAddress(env, {
        actor: selfActor(context, household.parishId),
        parishId: household.parishId,
        ownerType: 'household',
        ownerId: household.id,
        addressType: 'residential',
        ...addressData,
        protectedAddress: false,
        visibility: 'private',
        correlationId,
      }).catch(() => null);
    }
  }
  return { synced: true };
}

export async function startSelfServiceProfile(
  env: Partial<Env>,
  {
    context,
    data = {},
    correlationId = '',
  }: { context: SelfServiceContext; data?: Record<string, unknown>; correlationId?: string }
) {
  if (context.claimed) return getSelfServiceProfile(env, { context });
  const parishId = normalizeStarterParishId(data.parishId);
  const preferredName = cleanText(data.preferredName || context.user.displayName || context.user.email?.split('@')[0], {
    required: true,
    max: 160,
    field: 'preferredName',
  });
  const legalName = cleanText(data.legalName, { max: 160, field: 'legalName' });
  const dateOfBirth = cleanDate(data.dateOfBirth, 'dateOfBirth');
  const email = cleanText(data.email || context.user.email, { max: 320, field: 'email' });
  const phone = cleanText(data.phone, { max: 40, field: 'phone' });
  const profileVisibility = normalizeStarterVisibility(data.profileVisibility, 'directory_members');
  const emailVisibility = normalizeStarterVisibility(data.emailVisibility, 'private');
  const phoneVisibility = normalizeStarterVisibility(data.phoneVisibility, 'private');
  const publicationPreferences = {
    adultPreferredName: {
      visibility: profileVisibility,
      publicationEligible: profileVisibility === 'directory_members',
    },
    adultEmail: { visibility: emailVisibility, publicationEligible: emailVisibility === 'directory_members' },
    adultPhone: { visibility: phoneVisibility, publicationEligible: phoneVisibility === 'directory_members' },
  };
  const timestamp = nowMs();
  const personId = generateSecret('dir_person');
  const householdId = generateSecret('dir_household');
  const linkId = generateSecret('dir_link');
  const affiliationId = generateSecret('dir_affil');
  const householdMemberId = generateSecret('dir_hm');
  const householdAdminId = generateSecret('dir_ha');
  const publicationId = generateSecret('dir_pub');
  const householdPublicationId = generateSecret('dir_pub');
  const requestId = generateSecret('dir_req');
  const householdName = cleanText(data.householdName || `${preferredName} Household`, {
    required: true,
    max: 200,
    field: 'householdName',
  });
  const actor = {
    userId: context.user.id,
    actorType: 'platform_user',
    parishId,
    personId,
    capabilities: [DIRECTORY_CAPABILITIES.selfManage],
  };
  const statements = [
    {
      sql: `INSERT INTO directory_people
              (id, created_by_parish_id, preferred_name, legal_name, middle_name, suffix,
               date_of_birth, biological_sex, deceased, active, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', '', ?, 'unknown', 0, 1, ?, ?, ?)`,
      params: [
        personId,
        parishId,
        preferredName,
        legalName,
        dateOfBirth,
        'Created from My AGAPAY self-service onboarding; pending parish review.',
        timestamp,
        timestamp,
      ],
    },
    {
      sql: `INSERT INTO directory_person_links
              (id, person_id, link_type, external_id, active, created_at, updated_at)
            VALUES (?, ?, 'platform_user', ?, 1, ?, ?)`,
      params: [linkId, personId, context.user.id, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)`,
      params: [householdId, parishId, householdName, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_household_members
              (id, household_id, person_id, relationship, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'head', NULL, NULL, 1, ?, ?)`,
      params: [householdMemberId, householdId, personId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_household_admins
              (id, household_id, person_id, start_date, end_date, active, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 1, ?, ?)`,
      params: [householdAdminId, householdId, personId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_parish_affiliations
              (id, person_id, parish_id, status, joined_date, left_date, active, created_at, updated_at)
            VALUES (?, ?, ?, 'visitor', NULL, NULL, 1, ?, ?)`,
      params: [affiliationId, personId, parishId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'person', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [publicationId, parishId, personId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_publication_profiles
              (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at)
            VALUES (?, ?, 'household', ?, 'draft', 'not_submitted', 1, ?, ?)`,
      params: [householdPublicationId, parishId, householdId, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'person', ?, NULL, 'person_profile_review', 'pending', ?, ?, ?, ?)`,
      params: [
        requestId,
        parishId,
        context.user.id,
        personId,
        personId,
        `New directory profile started by ${preferredName}`,
        safeJson({
          preferredName,
          legalName,
          dateOfBirth,
          email,
          phone,
          publicationPreferences,
          source: 'myagapay_directory_onboarding',
        }) || '{}',
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.self_service.profile_started',
      actor,
      parishId: parishId as string,
      targetType: 'directory_person',
      targetId: personId as string,
      householdId: householdId as string | null | undefined,
      after: { preferredName, householdName, status: 'visitor', publicationStatus: 'draft' },
      correlationId,
    }),
    auditStatement({
      action: 'directory.self_service.household_started',
      actor,
      parishId: parishId as string,
      targetType: 'directory_household',
      targetId: householdId as string,
      householdId: householdId as string | null | undefined,
      after: { displayName: householdName, administratorPersonId: personId },
      correlationId,
    }),
    auditStatement({
      action: 'directory.change_request.created',
      actor,
      parishId: parishId as string,
      targetType: 'directory_person',
      targetId: personId as string,
      after: { requestType: 'person_profile_review', summary: `New directory profile started by ${preferredName}` },
      correlationId,
    }),
    await notificationStatement({
      context: { ...context, currentPerson: { id: personId } },
      parishId,
      eventType: 'directory.profile.started',
      targetType: 'directory_person',
      targetId: personId,
      safeMessage: 'Your draft directory profile was started and sent to the parish for review.',
      metadata: { source: 'myagapay_directory_onboarding' },
    }),
  ];
  await runAtomic(env, statements);

  const resolved = await resolveDirectorySelfServiceContext(env, { user: context.user });
  await setSelfServicePrivacyPreference(env, {
    context: resolved,
    ownerType: 'person',
    ownerId: personId,
    fieldKey: 'adult_preferred_name',
    visibility: profileVisibility,
    publicationEligible: profileVisibility === 'directory_members',
    correlationId,
  }).catch(() => null);
  if (email) {
    await createSelfServiceContact(env, {
      context: resolved,
      ownerType: 'person',
      ownerId: personId,
      data: { contactType: 'email', label: 'personal', value: email, visibility: emailVisibility, primary: true },
      correlationId,
    }).catch(() => null);
  }
  if (phone) {
    await createSelfServiceContact(env, {
      context: resolved,
      ownerType: 'person',
      ownerId: personId,
      data: { contactType: 'phone', label: 'mobile', value: phone, visibility: phoneVisibility, primary: true },
      correlationId,
    }).catch(() => null);
  }
  return getSelfServiceProfile(env, { context: await resolveDirectorySelfServiceContext(env, { user: context.user }) });
}

export async function updateSelfServicePersonProfile(
  env: Partial<Env>,
  {
    context,
    patch = {},
    correlationId = '',
  }: { context: SelfServiceContext; patch?: Record<string, unknown>; correlationId?: string }
) {
  if (!context.claimed)
    throw new DirectoryServiceError('unclaimed', 'Claim a directory person before editing a profile.', 403);
  assertNoUnknownFields(patch, EDITABLE_PERSON_FIELDS, REVIEW_PERSON_FIELDS);
  const personId = context.currentPerson!.id;
  const existing = await d1First<SelfServiceSqlRow>(
    env,
    'SELECT * FROM directory_people WHERE id = ?1 AND active = 1',
    personId
  );
  if (!existing) throw new DirectoryServiceError('not_found', 'Directory person was not found.', 404);
  assertExpectedVersion(existing.updated_at, patch.expectedVersion);
  const reviewFields = REVIEW_PERSON_FIELDS.filter((field) => field in patch);
  if (reviewFields.length) {
    return createDirectoryChangeRequest(env, {
      context,
      parishId: context.activeParishContexts[0]?.parishId || existing.created_by_parish_id,
      targetType: 'person',
      targetId: personId,
      requestType: 'person_profile_review',
      summary: `Review requested for ${reviewFields.join(', ')}`,
      payload: Object.fromEntries(reviewFields.map((field) => [field, patch[field]])),
      correlationId,
    });
  }
  const next = {
    preferredName:
      'preferredName' in patch
        ? cleanText(patch.preferredName, { required: true, max: 160, field: 'preferredName' })
        : existing.preferred_name,
    middleName:
      'middleName' in patch ? cleanText(patch.middleName, { max: 160, field: 'middleName' }) : existing.middle_name,
    suffix: 'suffix' in patch ? cleanText(patch.suffix, { max: 80, field: 'suffix' }) : existing.suffix,
    dateOfBirth: 'dateOfBirth' in patch ? cleanDate(patch.dateOfBirth, 'dateOfBirth') : existing.date_of_birth,
  };
  const timestamp = nowMs();
  const parishId = context.activeParishContexts[0]?.parishId || existing.created_by_parish_id;
  await runAtomic(env, [
    {
      sql: `UPDATE directory_people
            SET preferred_name = ?, middle_name = ?, suffix = ?, date_of_birth = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?`,
      params: [
        next.preferredName,
        next.middleName,
        next.suffix,
        next.dateOfBirth,
        timestamp,
        personId,
        existing.updated_at,
      ],
    },
    auditStatement({
      action: 'directory.self_service.person_profile_updated',
      actor: selfActor(context, parishId),
      parishId: parishId as string,
      targetType: 'directory_person',
      targetId: personId as string,
      before: { preferredName: existing.preferred_name },
      after: { preferredName: next.preferredName },
      correlationId,
    }),
    await notificationStatement({
      context,
      parishId,
      eventType: 'directory.profile.updated',
      targetType: 'directory_person',
      targetId: personId,
      safeMessage: 'Your directory profile was updated.',
    }),
  ]);
  if ('birthdayVisibility' in patch) {
    const visibility = normalizeStarterVisibility(patch.birthdayVisibility, 'private');
    await setFieldPrivacyPreference(env, {
      actor: selfActor(context, parishId),
      parishId,
      ownerType: 'person',
      ownerId: personId,
      fieldKey: 'adult_birthday',
      visibility,
      publicationEligible: visibility === 'directory_members',
      correlationId,
    });
  }
  const updated = await d1First<SelfServiceSqlRow>(env, 'SELECT * FROM directory_people WHERE id = ?1', personId);
  const flags = await getPersonPrivacyFlags(env, { parishId, personId });
  return personDto(updated, flags);
}
