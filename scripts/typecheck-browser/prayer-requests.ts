const memberPrayer: MemberPrayerRequest = {
  id: 'prayer-1',
  body: 'Please pray for our family.',
  status: 'active',
  visibility: 'parish_members',
  requesterName: 'Parish member',
  createdAt: 0,
  anonymous: false,
  mine: true,
  prayedByMe: false,
  prayerCount: 0,
};
prayerStatusLabel(memberPrayer);
updateOwnPrayer(memberPrayer.id, 'answered');
// @ts-expect-error Member browser records do not expose administrative identities.
void memberPrayer.actualRequesterName;
// @ts-expect-error Member status writes cannot perform parish moderation.
updateOwnPrayer(memberPrayer.id, 'declined');
// @ts-expect-error Prayer counts are numeric.
const invalidPrayerPayload: MemberPrayerPayload = { prayerCount: '2' };
// @ts-expect-error Anonymous settings use booleans.
const invalidPrayerSettings: MemberPrayerSettings = { allowAnonymous: 'false' };
// @ts-expect-error Request IDs are strings.
togglePrayer(42);
void invalidPrayerPayload;
void invalidPrayerSettings;
