// Publication must compare and write in one database statement. KV has no
// compare-and-swap operation and cannot safely implement this launch command.
export async function saveReviewedRegistration(env, reference, previous, next) {
  if (!env.AGAPAY_DB?.prepare) return false;
  const result = await env.AGAPAY_DB.prepare(
    `
    UPDATE registrations SET data = ?1, parish_id = ?2, status = ?3,
      parish_name = ?4, community_type = ?5, stripe_account_id = ?6,
      stripe_subscription_id = ?7, updated_at = ?8
    WHERE reference = ?9 AND json(data) = json(?10)
  `
  )
    .bind(
      JSON.stringify(next),
      next.parishId,
      next.status,
      next.parishName,
      next.communityType,
      next.stripeAccountId || '',
      next.stripeSubscriptionId || '',
      next.parishUpdatedAt || new Date().toISOString(),
      reference,
      JSON.stringify(previous)
    )
    .run();
  return result.success !== false && Number(result.meta?.changes) === 1;
}
