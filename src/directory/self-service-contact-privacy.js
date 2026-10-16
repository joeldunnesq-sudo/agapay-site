// Generated from src/directory/self-service-contact-privacy.ts by npm run build:server. Do not edit.
import { d1First } from '../lib/core.js';
import '../lib/authorization.js';
import { DirectoryServiceError } from './foundation.js';
import {
  createAddress,
  createContactMethod,
  listActiveAddressesForOwner,
  updateAddress,
  updateContactMethod,
} from './contacts.js';
import './invitations.js';
import { setFieldPrivacyPreference } from './privacy.js';
import { createPublicationProfile, getPublicationProfile, transitionPublicationProfile } from './publication.js';
import { cleanText, DIRECTORY_CAPABILITIES } from './shared.js';
import './self-service-shared.js';
import { contactDto, addressDto, selfActor, assertExpectedVersion } from './self-service-shared.js';
import { personBelongsToVerifiedHousehold } from './self-service-context.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import './self-service-requests.js';
import './self-service-invitations.js';
async function createSelfServiceContact(env, { context, ownerType, ownerId, data = {}, correlationId = '' }) {
  const parishId =
    ownerType === 'household'
      ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
      : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError('forbidden', 'You cannot manage this contact owner.', 403);
  if (ownerType === 'person' && ownerId !== context.currentPerson?.id)
    throw new DirectoryServiceError('forbidden', "You cannot manage another adult's person-owned contacts.", 403);
  const contact = await createContactMethod(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    contactType: data.contactType,
    value: data.value,
    label: data.label,
    primary: Boolean(data.primary),
    verified: false,
    smsCapable: data.smsCapable ?? null,
    visibility: data.visibility || 'private',
    correlationId,
  });
  return contactDto(contact);
}
async function updateSelfServiceContact(env, { context, contactId, patch = {}, correlationId = '' }) {
  if ('verified' in patch)
    throw new DirectoryServiceError(
      'protected_field_denied',
      'Directory contact verification is not self-service editable.',
      403
    );
  const existing = await d1First(
    env,
    'SELECT * FROM directory_contact_methods WHERE id = ?1',
    cleanText(contactId, { required: true, max: 160, field: 'contactId' })
  );
  if (!existing) throw new DirectoryServiceError('not_found', 'Directory contact was not found.', 404);
  const ownerAllowed =
    existing.owner_type === 'person'
      ? existing.owner_id === context.currentPerson?.id
      : context.manageableHouseholds.some(
          (household) => household.id === existing.owner_id && household.parishId === existing.parish_id
        );
  if (!ownerAllowed) throw new DirectoryServiceError('forbidden', 'You cannot manage this contact.', 403);
  assertExpectedVersion(existing.updated_at, patch.expectedVersion);
  const updated = await updateContactMethod(env, {
    actor: selfActor(context, existing.parish_id),
    parishId: existing.parish_id,
    contactId: existing.id,
    patch,
    correlationId,
  });
  return contactDto(updated);
}
async function deleteSelfServiceContact(env, { context, contactId, correlationId = '' }) {
  return updateSelfServiceContact(env, {
    context,
    contactId,
    patch: {
      active: false,
      expectedVersion: (await d1First(env, 'SELECT updated_at FROM directory_contact_methods WHERE id = ?1', contactId))
        ?.updated_at,
    },
    correlationId,
  });
}
async function createSelfServiceAddress(env, { context, householdId, data = {}, correlationId = '' }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot manage this household address.', 403);
  const addresses = await listActiveAddressesForOwner(env, {
    parishId: managed.parishId,
    ownerType: 'household',
    ownerId: householdId,
  });
  const existing = Boolean(data.primary)
    ? addresses.find((address2) => address2.primary && address2.addressType === (data.addressType || 'residential'))
    : null;
  if (existing) {
    const updated = await updateAddress(env, {
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      addressId: existing.id,
      patch: {
        line1: data.line1,
        line2: data.line2 || '',
        city: data.city,
        region: data.region || '',
        postalCode: data.postalCode || '',
        country: data.country || 'US',
        primary: true,
        visibility: data.visibility || existing.visibility || 'private',
      },
      correlationId,
    });
    return addressDto(updated);
  }
  const address = await createAddress(env, {
    actor: selfActor(context, managed.parishId),
    parishId: managed.parishId,
    ownerType: 'household',
    ownerId: householdId,
    addressType: data.addressType || 'residential',
    line1: data.line1,
    line2: data.line2 || '',
    city: data.city,
    region: data.region || '',
    postalCode: data.postalCode || '',
    country: data.country || 'US',
    primary: Boolean(data.primary),
    protectedAddress: Boolean(data.protectedAddress),
    visibility: data.visibility || 'staff',
    correlationId,
  });
  return addressDto(address);
}
async function setSelfServicePrivacyPreference(
  env,
  { context, ownerType, ownerId, fieldKey, visibility, publicationEligible = false, correlationId = '' }
) {
  const parishId =
    ownerType === 'household'
      ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
      : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError('forbidden', 'You cannot manage this privacy preference.', 403);
  if (ownerType === 'person' && ownerId !== context.currentPerson?.id)
    throw new DirectoryServiceError('forbidden', "You cannot manage another adult's privacy preferences.", 403);
  return setFieldPrivacyPreference(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    fieldKey,
    visibility,
    publicationEligible,
    correlationId,
  });
}
async function transitionSelfServicePublication(env, { context, ownerType, ownerId, status, correlationId = '' }) {
  if (status === 'approved')
    throw new DirectoryServiceError('self_approval_denied', 'Self-service users cannot approve publication.', 403);
  const parishId =
    ownerType === 'household'
      ? context.manageableHouseholds.find((household) => household.id === ownerId)?.parishId
      : context.activeParishContexts[0]?.parishId;
  if (!parishId) throw new DirectoryServiceError('forbidden', 'You cannot manage this publication profile.', 403);
  if (ownerType === 'person' && ownerId !== context.currentPerson?.id)
    throw new DirectoryServiceError('forbidden', "You cannot publish another adult's person profile.", 403);
  const existing = await getPublicationProfile(env, { parishId, ownerType, ownerId });
  const trustedHouseholdMember =
    ownerType === 'person' && (await personBelongsToVerifiedHousehold(env, parishId, ownerId));
  const returningToDirectory =
    status === 'pending_approval' && (existing.approvalStatus === 'approved' || trustedHouseholdMember);
  if (returningToDirectory) {
    let trustedProfile = existing;
    if (!trustedProfile.persisted) {
      trustedProfile = await createPublicationProfile(env, {
        actor: { ...selfActor(context, parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] },
        parishId,
        ownerType,
        ownerId,
        status: 'draft',
        correlationId,
      });
    }
    if (trustedProfile.status === 'draft') {
      trustedProfile = await transitionPublicationProfile(env, {
        actor: selfActor(context, parishId),
        parishId,
        ownerType,
        ownerId,
        status: 'pending_approval',
        correlationId,
      });
    }
    return transitionPublicationProfile(env, {
      actor: { ...selfActor(context, parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] },
      parishId,
      ownerType,
      ownerId,
      status: 'approved',
      correlationId,
    });
  }
  return transitionPublicationProfile(env, {
    actor: selfActor(context, parishId),
    parishId,
    ownerType,
    ownerId,
    status,
    correlationId,
  });
}
export {
  createSelfServiceAddress,
  createSelfServiceContact,
  deleteSelfServiceContact,
  setSelfServicePrivacyPreference,
  transitionSelfServicePublication,
  updateSelfServiceContact,
};
