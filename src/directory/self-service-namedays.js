// Generated from src/directory/self-service-namedays.ts by npm run build:server. Do not edit.
import { d1All, d1First, generateSecret } from '../lib/core.js';
import '../lib/authorization.js';
import { DirectoryServiceError } from './foundation.js';
import './contacts.js';
import './invitations.js';
import './privacy.js';
import './publication.js';
import { auditStatement, cleanText, isActiveHouseholdAdmin, nowMs, runAtomic } from './shared.js';
import './self-service-shared.js';
import { selfActor } from './self-service-shared.js';
import './self-service-context.js';
import './self-service-profile.js';
import './self-service-household-members.js';
import './self-service-contact-privacy.js';
import './self-service-requests.js';
import './self-service-invitations.js';
function namedayDto(row) {
  return {
    id: row.id,
    parishId: row.parish_id,
    householdId: row.household_id,
    personId: row.person_id || '',
    displayName: row.display_name || '',
    saintName: row.saint_name || '',
    feastMonthDay: row.feast_month_day || '',
    visibility: row.visibility || 'private',
    version: String(row.updated_at || ''),
  };
}
function cleanMonthDay(value) {
  const cleaned = cleanText(value, { required: true, max: 5, field: 'feastMonthDay' });
  if (!/^\d{2}-\d{2}$/.test(cleaned))
    throw new DirectoryServiceError('validation_failed', 'Name day must use MM-DD format.');
  const [month, day] = cleaned.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31)
    throw new DirectoryServiceError('validation_failed', 'Name day is not a valid month and day.');
  return cleaned;
}
function namedayVisibility(value) {
  const cleaned = cleanText(value || 'private', { max: 40, field: 'visibility' });
  if (!['private', 'household', 'staff', 'directory_members'].includes(cleaned))
    throw new DirectoryServiceError('validation_failed', 'Name day visibility is not supported.');
  return cleaned;
}
async function listHouseholdNamedays(env, { context, householdId }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot manage this household.', 403);
  const rows = await d1All(
    env,
    'SELECT * FROM directory_household_namedays WHERE parish_id = ?1 AND household_id = ?2 AND active = 1 ORDER BY feast_month_day, display_name',
    managed.parishId,
    householdId
  );
  return rows.map(namedayDto);
}
async function saveHouseholdNameday(env, { context, householdId, namedayId = '', data = {}, correlationId = '' }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot manage this household.', 403);
  const existing = namedayId
    ? await d1First(
        env,
        'SELECT * FROM directory_household_namedays WHERE id = ?1 AND parish_id = ?2 AND household_id = ?3 AND active = 1',
        namedayId,
        managed.parishId,
        householdId
      )
    : null;
  if (namedayId && !existing) throw new DirectoryServiceError('not_found', 'Name day was not found.', 404);
  const timestamp = nowMs();
  const id = existing?.id || generateSecret('dir_nameday');
  const displayName = cleanText(data.displayName ?? existing?.display_name, {
    required: true,
    max: 160,
    field: 'displayName',
  });
  const saintName = cleanText(data.saintName ?? existing?.saint_name, { required: true, max: 200, field: 'saintName' });
  const feastMonthDay = cleanMonthDay(data.feastMonthDay ?? existing?.feast_month_day);
  const visibility = namedayVisibility(data.visibility ?? existing?.visibility);
  let personId = cleanText(data.personId ?? existing?.person_id, { max: 180, field: 'personId' });
  if (!personId) {
    const matchingMember = await d1First(
      env,
      `SELECT p.id
         FROM directory_household_members hm
         JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
        WHERE hm.household_id = ?1 AND hm.active = 1
          AND LOWER(p.preferred_name) = LOWER(?2)
        ORDER BY p.id
        LIMIT 1`,
      householdId,
      displayName
    );
    personId = matchingMember?.id || '';
  }
  if (personId) {
    const member = await d1First(
      env,
      'SELECT id FROM directory_household_members WHERE household_id = ?1 AND person_id = ?2 AND active = 1',
      householdId,
      personId
    );
    if (!member)
      throw new DirectoryServiceError('validation_failed', 'Choose a nameday person from this household.', 422);
  }
  await runAtomic(env, [
    existing
      ? {
          sql: `UPDATE directory_household_namedays
            SET person_id = ?, display_name = ?, saint_name = ?, feast_month_day = ?, visibility = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?`,
          params: [
            personId || null,
            displayName,
            saintName,
            feastMonthDay,
            visibility,
            timestamp,
            existing.id,
            existing.updated_at,
          ],
        }
      : {
          sql: `INSERT INTO directory_household_namedays
              (id, parish_id, household_id, person_id, display_name, saint_name, feast_month_day,
               visibility, active, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          params: [
            id,
            managed.parishId,
            householdId,
            personId || null,
            displayName,
            saintName,
            feastMonthDay,
            visibility,
            context.user.id,
            timestamp,
            timestamp,
          ],
        },
    auditStatement({
      action: existing ? 'directory.household_nameday.updated' : 'directory.household_nameday.created',
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      targetType: 'directory_household_nameday',
      targetId: id,
      householdId,
      after: { personId, displayName, saintName, feastMonthDay, visibility },
      correlationId,
    }),
  ]);
  return namedayDto(await d1First(env, 'SELECT * FROM directory_household_namedays WHERE id = ?1', id));
}
async function deleteHouseholdNameday(env, { context, householdId, namedayId, correlationId = '' }) {
  const managed = context.manageableHouseholds.find((household) => household.id === householdId);
  if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot edit this household.', 403);
  if (!(await isActiveHouseholdAdmin(env, { householdId, personId: context.currentPerson?.id }))) {
    throw new DirectoryServiceError('forbidden', 'Only a household administrator can remove namedays.', 403);
  }
  const existing = await d1First(
    env,
    'SELECT * FROM directory_household_namedays WHERE id = ?1 AND parish_id = ?2 AND household_id = ?3 AND active = 1',
    namedayId,
    managed.parishId,
    householdId
  );
  if (!existing) throw new DirectoryServiceError('not_found', 'That nameday was not found.', 404);
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_household_namedays SET active = 0, updated_at = ? WHERE id = ? AND active = 1',
      params: [timestamp, namedayId],
    },
    auditStatement({
      action: 'directory.household_nameday.deleted',
      actor: selfActor(context, managed.parishId),
      parishId: managed.parishId,
      targetType: 'directory_household_nameday',
      targetId: namedayId,
      householdId,
      before: namedayDto(existing),
      after: { active: false },
      correlationId,
    }),
  ]);
  return { ...namedayDto(existing), active: false };
}
export {
  cleanMonthDay,
  deleteHouseholdNameday,
  listHouseholdNamedays,
  namedayDto,
  namedayVisibility,
  saveHouseholdNameday,
};
