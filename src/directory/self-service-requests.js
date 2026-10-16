// Generated from src/directory/self-service-requests.ts by npm run build:server. Do not edit.
import { d1First, generateSecret } from '../lib/core.js';
import '../lib/authorization.js';
import { addHouseholdMember, createPerson, DirectoryServiceError } from './foundation.js';
import { createContactMethod } from './contacts.js';
import './invitations.js';
import { setPersonPrivacyFlags } from './privacy.js';
import './publication.js';
import {
  auditStatement,
  cleanText,
  DIRECTORY_CAPABILITIES,
  isActiveHouseholdAdmin,
  nowMs,
  runAtomic,
  safeJson,
} from './shared.js';
import { CHANGE_REQUEST_TYPES } from './self-service-shared.js';
import { cleanDate, requestDto, selfActor, notificationStatement } from './self-service-shared.js';
import { householdWasParishVerified } from './self-service-context.js';
import './self-service-profile.js';
import './self-service-namedays.js';
import './self-service-household-members.js';
import './self-service-contact-privacy.js';
import './self-service-invitations.js';
async function createDirectoryChangeRequest(
  env,
  { context, parishId, targetType, targetId, householdId = '', requestType, summary, payload = {}, correlationId = '' }
) {
  if (!CHANGE_REQUEST_TYPES.includes(requestType))
    throw new DirectoryServiceError('validation_failed', 'Change request type is not supported.');
  if (targetType === 'person' && targetId !== context.currentPerson?.id && !householdId) {
    throw new DirectoryServiceError('forbidden', 'You cannot request changes for this person.', 403);
  }
  if (
    targetType === 'household' &&
    !context.manageableHouseholds.some((household) => household.id === targetId && household.parishId === parishId)
  ) {
    throw new DirectoryServiceError('forbidden', 'You cannot request changes for this household.', 403);
  }
  if (
    householdId &&
    !context.manageableHouseholds.some((household) => household.id === householdId && household.parishId === parishId)
  ) {
    throw new DirectoryServiceError('forbidden', 'You cannot request changes for this household.', 403);
  }
  const timestamp = nowMs();
  const id = generateSecret('dir_req');
  const actor = selfActor(context, parishId);
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_change_requests
              (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
               household_id, request_type, status, summary, requested_payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      params: [
        id,
        parishId,
        context.user.id,
        context.currentPerson.id,
        targetType,
        targetId,
        householdId || null,
        requestType,
        cleanText(summary, { required: true, max: 240, field: 'summary' }),
        safeJson(payload) || '{}',
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.change_request.created',
      actor,
      parishId,
      targetType: `directory_${targetType}`,
      targetId,
      householdId: householdId || null,
      after: { requestType, summary },
      correlationId,
    }),
    await notificationStatement({
      context,
      parishId,
      eventType: 'directory.change_request.created',
      targetType: `directory_${targetType}`,
      targetId,
      householdId,
      safeMessage: 'Your directory change request was submitted.',
      metadata: { requestType },
    }),
  ]);
  return requestDto(await d1First(env, 'SELECT * FROM directory_change_requests WHERE id = ?1', id));
}
async function requestHouseholdChildAdd(env, { context, householdId, data = {}, correlationId = '' }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot add children for this household.', 403);
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id }))) {
    throw new DirectoryServiceError('forbidden', 'Only an active household administrator can add children.', 403);
  }
  const preferredName = cleanText(data.preferredName, { required: true, max: 160, field: 'preferredName' });
  const legalName = cleanText(data.legalName, { max: 200, field: 'legalName' });
  const dateOfBirth = cleanDate(data.dateOfBirth || '', 'dateOfBirth') || '';
  const relationshipLabel = cleanText(data.relationship || 'child', { max: 80, field: 'relationship' }) || 'child';
  const existingMember = await d1First(
    env,
    `SELECT p.id FROM directory_household_members hm
      JOIN directory_people p ON p.id = hm.person_id
     WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
       AND LOWER(p.preferred_name) = LOWER(?2)`,
    managed.id,
    preferredName
  );
  if (existingMember)
    throw new DirectoryServiceError('duplicate_member', 'This child is already in your household.', 409);
  const serviceActor = {
    ...selfActor(context, managed.parishId),
    capabilities: [DIRECTORY_CAPABILITIES.manage],
  };
  const person = await createPerson(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    preferredName,
    legalName,
    dateOfBirth,
    biologicalSex: 'unknown',
    notes: '',
  });
  await setPersonPrivacyFlags(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    personId: person.id,
    isChild: true,
    protectedPerson: false,
    correlationId,
  });
  const membership = await addHouseholdMember(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    householdId: managed.id,
    personId: person.id,
    relationship: 'child',
  });
  return {
    direct: true,
    personId: person.id,
    householdId: managed.id,
    membershipId: membership.id,
    preferredName,
    relationship: relationshipLabel,
    privacy: 'private_by_default',
  };
}
async function requestHouseholdAdultAdd(env, { context, householdId, data = {}, correlationId = '' }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot add an adult for this household.', 403);
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id }))) {
    throw new DirectoryServiceError(
      'forbidden',
      'Only an active household administrator can add a spouse or other adult.',
      403
    );
  }
  const preferredName = cleanText(data.preferredName, { required: true, max: 160, field: 'preferredName' });
  const legalName = cleanText(data.legalName, { max: 200, field: 'legalName' });
  const dateOfBirth = cleanDate(data.dateOfBirth || '', 'dateOfBirth') || '';
  const relationship = cleanText(data.relationship || 'spouse', { max: 80, field: 'relationship' }) || 'spouse';
  const email = cleanText(data.email || '', { max: 320, field: 'email' });
  const note = cleanText(data.note || '', { max: 500, field: 'note' });
  const householdVerified = await householdWasParishVerified(env, managed.parishId, managed.id);
  if (householdVerified) {
    const existingMember = await d1First(
      env,
      `SELECT p.id FROM directory_household_members hm
        JOIN directory_people p ON p.id = hm.person_id
       WHERE hm.household_id = ?1 AND hm.active = 1 AND p.active = 1
         AND LOWER(p.preferred_name) = LOWER(?2)`,
      managed.id,
      preferredName
    );
    if (existingMember)
      throw new DirectoryServiceError('duplicate_member', 'This person is already in your household.', 409);
  }
  const duplicate = await d1First(
    env,
    `SELECT id FROM directory_change_requests
      WHERE parish_id = ?1 AND requester_person_id = ?2 AND household_id = ?3
        AND request_type = 'household_membership_add' AND status = 'pending'
        AND json_extract(requested_payload_json, '$.adultAdd.preferredName') = ?4`,
    managed.parishId,
    context.currentPerson.id,
    managed.id,
    preferredName
  );
  if (duplicate)
    throw new DirectoryServiceError(
      'duplicate_request',
      'A pending request for this adult is already waiting for parish review.',
      409
    );
  const serviceActor = { ...selfActor(context, managed.parishId), capabilities: [DIRECTORY_CAPABILITIES.manage] };
  const person = await createPerson(env, {
    actor: serviceActor,
    parishId: managed.parishId,
    preferredName,
    legalName,
    dateOfBirth,
    biologicalSex: 'unknown',
    notes: note ? `Household adult add request note: ${note}` : '',
  });
  if (email) {
    await createContactMethod(env, {
      actor: serviceActor,
      parishId: managed.parishId,
      ownerType: 'person',
      ownerId: person.id,
      contactType: 'email',
      value: email,
      label: 'personal',
      primary: true,
      visibility: 'private',
      correlationId,
    });
  }
  if (householdVerified) {
    const membership = await addHouseholdMember(env, {
      actor: serviceActor,
      parishId: managed.parishId,
      householdId: managed.id,
      personId: person.id,
      relationship,
    });
    return {
      direct: true,
      personId: person.id,
      householdId: managed.id,
      membershipId: membership.id,
      preferredName,
      relationship,
      accountManaged: true,
    };
  }
  return createDirectoryChangeRequest(env, {
    context,
    parishId: managed.parishId,
    targetType: 'household',
    targetId: managed.id,
    householdId: managed.id,
    requestType: 'household_membership_add',
    summary: `Add ${relationship} to household: ${preferredName}`,
    payload: {
      personId: person.id,
      relationship,
      adultAdd: { preferredName, legalName, dateOfBirth, relationship, email, note },
    },
    correlationId,
  });
}
async function cancelDirectoryChangeRequest(env, { context, requestId, correlationId = '' }) {
  const existing = await d1First(
    env,
    'SELECT * FROM directory_change_requests WHERE id = ?1',
    cleanText(requestId, { required: true, max: 160, field: 'requestId' })
  );
  if (!existing || existing.requester_person_id !== context.currentPerson?.id)
    throw new DirectoryServiceError('not_found', 'Change request was not found.', 404);
  if (existing.status !== 'pending')
    throw new DirectoryServiceError('invalid_transition', 'Only pending requests can be cancelled.', 409);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_change_requests SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
      params: [timestamp, timestamp, existing.id],
    },
    auditStatement({
      action: 'directory.change_request.cancelled',
      actor: selfActor(context, existing.parish_id),
      parishId: existing.parish_id,
      targetType: `directory_${existing.target_type}`,
      targetId: existing.target_id,
      householdId: existing.household_id,
      correlationId,
    }),
  ]);
  return requestDto(await d1First(env, 'SELECT * FROM directory_change_requests WHERE id = ?1', existing.id));
}
export {
  cancelDirectoryChangeRequest,
  createDirectoryChangeRequest,
  requestHouseholdAdultAdd,
  requestHouseholdChildAdd,
};
