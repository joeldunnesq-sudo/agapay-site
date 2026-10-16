import type { DirectoryPrintRow, SkillContext, SkillSqlRow } from './skills-service-contracts.js';
import {
  VIEW_CAPS,
  parishIdFor,
  actorFromContext,
  csvEscape,
  timestampSlug,
  listingDto,
  visibleSkillRows,
  d1All,
  d1First,
  assertParishActor,
  auditStatement,
  nowMs,
  runAtomic,
} from './skills-service-shared.js';
import './skills-service.js';
import './skills-verification.js';

export async function getDirectoryMaintenanceDashboard(env: Partial<Env>, { context }: { context: SkillContext }) {
  assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const now = nowMs();
  const rows = await d1All<SkillSqlRow>(
    env,
    `SELECT h.id, h.display_name, v.verification_status, v.verification_due_at,
            CASE WHEN EXISTS (
              SELECT 1
                FROM directory_household_admins ha
                JOIN directory_person_links l
                  ON l.person_id = ha.person_id
                 AND l.link_type = 'platform_user' AND l.active = 1
               WHERE ha.household_id = h.id AND ha.active = 1
            ) THEN 1 ELSE 0 END AS account_managed
       FROM directory_households h
       LEFT JOIN directory_household_verifications v
         ON v.household_id = h.id AND v.parish_id = h.parish_id
      WHERE h.parish_id = ?1 AND h.active = 1
      ORDER BY h.display_name`,
    parishId
  );
  const staleSkills = await d1First<SkillSqlRow>(
    env,
    "SELECT COUNT(*) AS count FROM directory_person_skill_listings WHERE parish_id = ?1 AND status = 'active' AND consent_recorded_at < ?2",
    parishId,
    now - 365 * 86400000
  );
  const unclaimedRecords = await d1All<SkillSqlRow>(
    env,
    `SELECT p.id, p.preferred_name, hm.household_id, h.display_name AS household_name
       FROM directory_people p
       LEFT JOIN directory_person_privacy_flags f
         ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_household_members hm
         ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h
         ON h.id = hm.household_id AND h.parish_id = ?1 AND h.active = 1
      WHERE p.created_by_parish_id = ?1 AND p.active = 1
        AND COALESCE(f.is_child, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM directory_person_links l WHERE l.person_id = p.id AND l.link_type = 'platform_user' AND l.active = 1)
      GROUP BY p.id, hm.household_id, h.display_name
      ORDER BY p.preferred_name ASC
      LIMIT 20`,
    parishId
  );
  const staleSkillRecords = await d1All<SkillSqlRow>(
    env,
    `SELECT l.id, l.person_id, p.preferred_name, s.name AS skill_name, l.consent_recorded_at
       FROM directory_person_skill_listings l
       JOIN directory_people p ON p.id = l.person_id
       JOIN directory_skill_catalog s ON s.id = l.skill_id
      WHERE l.parish_id = ?1 AND l.status = 'active' AND l.consent_recorded_at < ?2
      ORDER BY l.consent_recorded_at ASC
      LIMIT 20`,
    parishId,
    now - 365 * 86400000
  );
  const notStarted = rows.filter((row) => !row.verification_status);
  const due = rows.filter(
    (row) =>
      row.verification_status && (row.verification_status !== 'current' || Number(row.verification_due_at || 0) < now)
  );
  const unmanagedHouseholds = rows.filter((row) => Number(row.account_managed || 0) !== 1);
  return {
    householdsCurrent: rows.length - due.length - notStarted.length,
    householdsDue: due.filter((row) => Number(row.verification_due_at || 0) >= now).length,
    householdsOverdue: due.filter((row) => Number(row.verification_due_at || 0) < now).length,
    householdsNotStarted: notStarted.length,
    accountManagedHouseholds: rows.length - unmanagedHouseholds.length,
    householdsNeedingAccountAccess: unmanagedHouseholds.length,
    staleSkillConsents: Number(staleSkills?.count || 0),
    unclaimedPeople: unclaimedRecords.length,
    actions: {
      overdueHouseholds: due
        .filter((row) => Number(row.verification_due_at || 0) < now)
        .slice(0, 20)
        .map((row) => ({ id: row.id, displayName: row.display_name, dueAt: Number(row.verification_due_at || 0) })),
      dueHouseholds: due
        .filter((row) => Number(row.verification_due_at || 0) >= now)
        .slice(0, 20)
        .map((row) => ({ id: row.id, displayName: row.display_name, dueAt: Number(row.verification_due_at || 0) })),
      staleSkillConsents: staleSkillRecords.map((row) => ({
        id: row.id,
        personId: row.person_id,
        displayName: row.preferred_name,
        skillName: row.skill_name,
        consentRecordedAt: Number(row.consent_recorded_at || 0),
      })),
    },
  };
}

export async function exportSkillsRosterCsv(env: Partial<Env>, { context }: { context: SkillContext }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const { rows, settings } = await visibleSkillRows(env, { ...context, parishId }, { admin: true });
  const active = rows.filter((row) => row.status === 'active');
  const header = [
    'Skill',
    'Category',
    'Person',
    'Experience',
    'Service mode',
    'Visibility',
    'Contact preference',
    'Availability note',
  ];
  const lines = [header.join(',')];
  for (const row of active) {
    lines.push(
      [
        row.custom_display_label || row.name,
        row.category,
        row.preferred_name,
        row.experience_level,
        row.service_mode,
        row.visibility,
        row.contact_preference,
        row.availability_note || '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  await runAtomic(env, [
    auditStatement({
      action: 'directory.export.skills_roster_generated',
      actor,
      parishId,
      targetType: 'directory_export',
      targetId: `skills-${timestampSlug()}`,
      metadata: { count: active.length },
      correlationId: '',
    }),
  ]);
  return {
    filename: `agapay-${parishId}-skills-roster-${timestampSlug()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: `${settings.skillsDisclaimerText}\n\n${lines.join('\n')}\n`,
  };
}

export async function printSkillsRoster(env: Partial<Env>, { context }: { context: SkillContext }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const { rows, settings } = await visibleSkillRows(env, { ...context, parishId }, { admin: true });
  const active = rows
    .filter((row) => row.status === 'active')
    .map((row) => listingDto(row, { includePerson: true, includeAdmin: false }));
  await runAtomic(env, [
    auditStatement({
      action: 'directory.print.skills_roster_generated',
      actor,
      parishId,
      targetType: 'directory_print',
      targetId: `skills-${timestampSlug()}`,
      metadata: { count: active.length },
    }),
  ]);
  return {
    parishId,
    generatedAt: new Date().toISOString(),
    disclaimer: settings.skillsDisclaimerText,
    listings: active,
  };
}

export async function exportPublishedAdultsCsv(env: Partial<Env>, { context }: { context: SkillContext }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const rows = await d1All<SkillSqlRow>(
    env,
    `SELECT p.preferred_name, h.display_name AS household_name
       FROM directory_people p
       JOIN directory_publication_profiles pub ON pub.parish_id = ?1 AND pub.owner_type = 'person' AND pub.owner_id = p.id
       LEFT JOIN directory_household_members hm ON hm.person_id = p.id AND hm.active = 1
       LEFT JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
      WHERE p.active = 1 AND pub.status = 'approved' AND pub.approval_status = 'approved'
        AND COALESCE(f.is_child, 0) = 0 AND COALESCE(f.protected_person, 0) = 0
      ORDER BY p.preferred_name ASC`,
    parishId
  );
  await runAtomic(env, [
    auditStatement({
      action: 'directory.export.published_adults_generated',
      actor,
      parishId,
      targetType: 'directory_export',
      targetId: `adults-${timestampSlug()}`,
      metadata: { count: rows.length },
    }),
  ]);
  const lines = [
    ['Name', 'Household'].join(','),
    ...rows.map((row) => [row.preferred_name, row.household_name || ''].map(csvEscape).join(',')),
  ];
  return {
    filename: `agapay-${parishId}-published-adults-${timestampSlug()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: `${lines.join('\n')}\n`,
  };
}

export async function printDirectory(env: Partial<Env>, { context }: { context: SkillContext }) {
  const actor = assertParishActor(actorFromContext(context), parishIdFor(context), VIEW_CAPS);
  const parishId = parishIdFor(context);
  const adultRows = await d1All<DirectoryPrintRow>(
    env,
    `SELECT h.id AS household_id, h.display_name, p.id AS person_id, p.preferred_name,
            (SELECT a.city FROM directory_addresses a
              WHERE a.parish_id = ?1 AND a.owner_type = 'household' AND a.owner_id = h.id
                AND a.active = 1 AND a.visibility = 'directory_members' AND a.protected_address = 0
              ORDER BY a.is_primary DESC, a.created_at ASC LIMIT 1) AS city,
            (SELECT a.region FROM directory_addresses a
              WHERE a.parish_id = ?1 AND a.owner_type = 'household' AND a.owner_id = h.id
                AND a.active = 1 AND a.visibility = 'directory_members' AND a.protected_address = 0
              ORDER BY a.is_primary DESC, a.created_at ASC LIMIT 1) AS region,
            n.saint_name, n.feast_month_day,
            (SELECT c.value FROM directory_contact_methods c
              WHERE c.parish_id = ?1 AND c.owner_type = 'person' AND c.owner_id = p.id
                AND c.contact_type = 'email' AND c.active = 1 AND c.visibility = 'directory_members'
              ORDER BY c.is_primary DESC, c.created_at ASC LIMIT 1) AS email,
            (SELECT c.value FROM directory_contact_methods c
              WHERE c.parish_id = ?1 AND c.owner_type = 'person' AND c.owner_id = p.id
                AND c.contact_type = 'phone' AND c.active = 1 AND c.visibility = 'directory_members'
              ORDER BY c.is_primary DESC, c.created_at ASC LIMIT 1) AS phone
       FROM directory_households h
       JOIN directory_household_members hm ON hm.household_id = h.id AND hm.active = 1
       JOIN directory_people p ON p.id = hm.person_id AND p.active = 1
       JOIN directory_publication_profiles pub ON pub.parish_id = ?1 AND pub.owner_type = 'person' AND pub.owner_id = p.id
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_household_namedays n ON n.parish_id = ?1 AND n.household_id = h.id
         AND n.person_id = p.id AND n.active = 1 AND n.visibility = 'directory_members'
      WHERE h.parish_id = ?1 AND h.active = 1 AND pub.status = 'approved' AND pub.approval_status = 'approved'
        AND COALESCE(f.is_child, 0) = 0 AND COALESCE(f.protected_person, 0) = 0
      ORDER BY h.display_name ASC, p.preferred_name ASC`,
    parishId
  );
  const approvedChildRows = await d1All<DirectoryPrintRow>(
    env,
    `SELECT h.id AS household_id, h.display_name, p.id AS person_id, p.preferred_name,
            (SELECT a.city FROM directory_addresses a
              WHERE a.parish_id = ?1 AND a.owner_type = 'household' AND a.owner_id = h.id
                AND a.active = 1 AND a.visibility = 'directory_members' AND a.protected_address = 0
              ORDER BY a.is_primary DESC, a.created_at ASC LIMIT 1) AS city,
            (SELECT a.region FROM directory_addresses a
              WHERE a.parish_id = ?1 AND a.owner_type = 'household' AND a.owner_id = h.id
                AND a.active = 1 AND a.visibility = 'directory_members' AND a.protected_address = 0
              ORDER BY a.is_primary DESC, a.created_at ASC LIMIT 1) AS region,
            n.saint_name, n.feast_month_day, '' AS email, '' AS phone,
            request.approved_fields_json
       FROM directory_child_publication_requests request
       JOIN directory_people p ON p.id = request.child_person_id AND p.active = 1
       JOIN directory_household_members hm
         ON hm.person_id = p.id AND hm.household_id = request.household_id AND hm.active = 1
       JOIN directory_households h ON h.id = hm.household_id AND h.parish_id = ?1 AND h.active = 1
       LEFT JOIN directory_person_privacy_flags f ON f.parish_id = ?1 AND f.person_id = p.id AND f.active = 1
       LEFT JOIN directory_household_namedays n ON n.parish_id = ?1 AND n.household_id = h.id
         AND n.person_id = p.id AND n.active = 1 AND n.visibility = 'directory_members'
      WHERE request.parish_id = ?1 AND request.status = 'approved'
        AND COALESCE(f.is_child, 0) = 1 AND COALESCE(f.protected_person, 0) = 0
      ORDER BY h.display_name ASC, p.preferred_name ASC`,
    parishId
  );
  const childRows = approvedChildRows
    .filter((row) => {
      try {
        return JSON.parse(row.approved_fields_json || '[]').includes('preferred_name');
      } catch {
        return false;
      }
    })
    .map(({ approved_fields_json, ...row }) => row);
  const rows = [...adultRows, ...childRows].sort(
    (a, b) =>
      String(a.display_name || '').localeCompare(String(b.display_name || '')) ||
      String(a.preferred_name || '').localeCompare(String(b.preferred_name || ''))
  );
  await runAtomic(env, [
    auditStatement({
      action: 'directory.print.household_directory_generated',
      actor,
      parishId,
      targetType: 'directory_print',
      targetId: `directory-${timestampSlug()}`,
      metadata: { count: rows.length },
    }),
  ]);
  return {
    parishId,
    generatedAt: new Date().toISOString(),
    privacyReminder: 'Private parish directory. Do not distribute outside the parish.',
    households: rows,
  };
}
