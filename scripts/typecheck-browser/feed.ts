const feedAnnouncement: DonorFeedAnnouncement = { id: 'announcement-1', title: 'Update', body: 'Parish news' };
const feedPayload: DonorFeedPayload = { announcements: [feedAnnouncement], unreadCount: 1 };
void feedPayload;
setFeedCategoryFilter('pinned');
setDigestPreferenceUi(false);
window.MyAgapayShell?.setFeedUnreadCount(1);
// @ts-expect-error Read counts are numeric.
const invalidFeed: DonorFeedPayload = { unreadCount: '1' };
// @ts-expect-error Digest consent is a boolean.
setDigestPreferenceUi('false');
// @ts-expect-error Filter inputs are strings.
setFeedCategoryFilter(42);
// @ts-expect-error Announcement IDs are strings.
openFeedAnnouncement(42);
void invalidFeed;
