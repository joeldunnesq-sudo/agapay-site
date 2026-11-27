import { d1All, d1First, generateSecret } from '../lib/core.js';
import { runAtomic } from './shared.js';

export const DONOR_MEMBERSHIP_SOURCE = 'myagapay_donor_membership';

const eligibleDonor = `
  d.default_parish_id = ?1
  AND COALESCE(d.email_verified_at, '') != ''
  AND json_valid(d.data)
  AND COALESCE(json_extract(d.data, '$.lastLoginAt'), '') != ''
  AND EXISTS (
    SELECT 1 FROM donor_offerings gift
    WHERE gift.donor_email = d.email AND gift.parish_id = ?1
      AND gift.payment_status IN ('paid', 'succeeded', 'partially_refunded')
      AND json_valid(gift.data)
      AND COALESCE(json_extract(gift.data, '$.recordType'), '') NOT IN ('subscription_setup', 'subscription_failure')
      AND COALESCE(json_extract(gift.data, '$.giftType'), 'general')
        IN ('general', 'stewardship', 'fund', 'campaign', 'feast', 'recurring', 'commemoration', 'candles')
      AND CAST(json_extract(gift.data, '$.amountCents') AS INTEGER) > 0
      AND COALESCE(json_extract(gift.data, '$.publicAnonymous'), 0) NOT IN (1, 'true')
  )`;

export function donorMembershipStillEligible(env, parishId, userId) {
  return d1First(
    env,
    `
    SELECT 1 FROM donors d JOIN platform_users u ON u.email = d.email
    WHERE ${eligibleDonor} AND u.id = ?2 AND u.status = 'active'
      AND EXISTS (
        SELECT 1 FROM directory_person_links l JOIN directory_people p ON p.id = l.person_id
        WHERE l.link_type = 'platform_user' AND l.external_id = u.id AND l.active = 1
          AND p.active = 1 AND p.deceased = 0
          AND NOT EXISTS (SELECT 1 FROM directory_person_privacy_flags f
            WHERE f.person_id = p.id AND f.active = 1 AND (f.protected_person = 1 OR f.is_child = 1))
          AND NOT EXISTS (SELECT 1 FROM directory_parish_affiliations a
            WHERE a.person_id = p.id AND a.parish_id = ?1 AND a.status = 'former_member')
      )
  `,
    parishId,
    userId
  );
}

export async function queueEligibleDonorMemberships(env, parishId) {
  const candidates = await d1All(
    env,
    `
    SELECT d.email, substr(COALESCE(NULLIF(trim(u.display_name), ''),
      NULLIF(trim(json_extract(d.data, '$.donorName')), ''), 'My AGAPAY member'), 1, 160) AS display_name
    FROM donors d
    LEFT JOIN platform_users u ON u.email = d.email
    WHERE ${eligibleDonor}
      AND (u.id IS NULL OR u.status = 'active')
      AND NOT EXISTS (
        SELECT 1 FROM directory_change_requests cr
        WHERE cr.parish_id = ?1 AND cr.requester_user_id = u.id AND cr.request_type = 'person_profile_review'
          AND CASE WHEN json_valid(cr.requested_payload_json)
            THEN json_extract(cr.requested_payload_json, '$.source') END
              IN ('myagapay_directory_onboarding', 'myagapay_koinonia_access', '${DONOR_MEMBERSHIP_SOURCE}')
      )
      AND NOT EXISTS (
        SELECT 1 FROM directory_person_links l
        LEFT JOIN directory_people p ON p.id = l.person_id
        LEFT JOIN directory_parish_affiliations a ON a.person_id = p.id AND a.parish_id = ?1
        LEFT JOIN directory_person_privacy_flags f ON f.person_id = p.id AND f.active = 1
        WHERE l.link_type = 'platform_user' AND l.external_id = u.id
          AND (l.active = 0 OR p.active = 0 OR p.deceased = 1 OR COALESCE(f.is_child, 0) = 1
            OR COALESCE(f.protected_person, 0) = 1 OR a.status = 'former_member'
            OR (a.active = 1 AND a.status IN ('member', 'clergy', 'monastic')))
      )
    ORDER BY d.email
    LIMIT 25
  `,
    parishId
  );

  for (const candidate of candidates) {
    const timestamp = Date.now();
    const personId = generateSecret('dir_person');
    const email = candidate.email;
    const name = candidate.display_name;
    await runAtomic(env, [
      {
        sql: `INSERT INTO platform_users (id, email, display_name)
              VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING`,
        params: [generateSecret('user'), email, name],
      },
      {
        sql: `INSERT INTO directory_people (id, created_by_parish_id, preferred_name, created_at, updated_at)
              SELECT ?, ?, ?, ?, ? FROM platform_users u WHERE u.email = ? AND u.status = 'active'
                AND NOT EXISTS (SELECT 1 FROM directory_person_links l
                  WHERE l.link_type = 'platform_user' AND l.external_id = u.id)`,
        params: [personId, parishId, name, timestamp, timestamp, email],
      },
      {
        sql: `INSERT INTO directory_person_links (id, person_id, link_type, external_id, created_at, updated_at)
              SELECT ?, p.id, 'platform_user', u.id, ?, ?
              FROM directory_people p CROSS JOIN platform_users u WHERE p.id = ? AND u.email = ?`,
        params: [generateSecret('dir_link'), timestamp, timestamp, personId, email],
      },
      {
        sql: `INSERT INTO directory_change_requests
                (id, parish_id, requester_user_id, requester_person_id, target_type, target_id,
                 request_type, status, summary, requested_payload_json, created_at, updated_at)
              SELECT 'donor_membership:' || ?1 || ':' || u.id, ?1, u.id, p.id, 'person', p.id,
                     'person_profile_review', 'pending', 'Home parish membership review',
                     json_object('source', '${DONOR_MEMBERSHIP_SOURCE}', 'preferredName', ?2, 'email', d.email),
                     ?3, ?3
              FROM donors d JOIN platform_users u ON u.email = d.email
              JOIN directory_person_links l ON l.link_type = 'platform_user' AND l.external_id = u.id AND l.active = 1
              JOIN directory_people p ON p.id = l.person_id AND p.active = 1
              WHERE ${eligibleDonor} AND d.email = ?4 AND u.status = 'active'
                AND NOT EXISTS (
                  SELECT 1 FROM directory_change_requests cr WHERE cr.parish_id = ?1 AND cr.requester_user_id = u.id
                    AND cr.request_type = 'person_profile_review'
                    AND CASE WHEN json_valid(cr.requested_payload_json)
                      THEN json_extract(cr.requested_payload_json, '$.source') END
                        IN ('myagapay_directory_onboarding', 'myagapay_koinonia_access', '${DONOR_MEMBERSHIP_SOURCE}')
                )
              LIMIT 1 ON CONFLICT(id) DO NOTHING`,
        params: [parishId, name, timestamp, email],
      },
    ]);
  }
}
