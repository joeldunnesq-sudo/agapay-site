import { parseParishBlogFeed, resolveParishBlogFeed } from '../../src/handlers/parish-blog.js';
import { handleListenProgress } from '../../src/handlers/listen.js';
import { handleIdentityLogin, handleIdentityInvitationAccept } from '../../src/handlers/identity.js';
import { computeParishDonorYearGiving } from '../../src/handlers/giving-statements.js';
import { sendAnnouncementPush, sendWebPush } from '../../src/lib/push-notifications.js';
import { savePreparationTemplate, attachPreparationToRequests } from '../../src/sacraments/preparation.js';
import { buildSundayLiturgicalBlock } from '../../src/handlers/parish-bulletins.js';
import { storeTeachingAudio } from '../../src/handlers/parish-teaching.js';
import { syncPledgeToHousehold } from '../../src/handlers/stewardship-reports.js';
declare const env: Env;
declare const request: Request;
declare const bucket: R2Bucket;
declare const source: ReadableStream<Uint8Array>;
void parseParishBlogFeed('<rss/>', 'https://example.org/feed');
void resolveParishBlogFeed('https://example.org', fetch, { enrichImages: true });
void handleListenProgress(request, env);
void computeParishDonorYearGiving(env, 'parish', 2026);
void sendAnnouncementPush(env, {
  parishId: 'parish',
  parishName: 'Parish',
  announcement: { id: 'announcement', title: 'Title' },
});
void savePreparationTemplate(env, 'parish', 'baptism', {
  title: 'Preparation',
  items: [{ title: 'Meeting', itemType: 'clergy_review' }],
});
const prepared = attachPreparationToRequests(env, [
  { id: 'request', status: 'requested', sacrament_type: 'baptism', parish_id: 'parish', customField: 123 },
]);
void prepared.then((rows) => {
  const custom: number = rows[0].customField;
  void custom;
});
void storeTeachingAudio(bucket, {
  parishId: 'parish',
  key: 'audio',
  source,
  contentType: 'audio/mpeg',
  contentLength: 128,
});
void buildSundayLiturgicalBlock({ serviceDate: '2026-10-18' });
// @ts-expect-error XML parsing requires text
void parseParishBlogFeed(42, 'https://example.org');
// @ts-expect-error enrichment is a boolean flag
void resolveParishBlogFeed('https://example.org', fetch, { enrichImages: 'yes' });
// @ts-expect-error handlers require a Request
void handleListenProgress({}, env);
// @ts-expect-error report years must be numeric
void computeParishDonorYearGiving(env, 'parish', '2026');
// @ts-expect-error push content requires an identifier
void sendAnnouncementPush(env, { parishId: 'parish', parishName: 'Parish', announcement: { title: 'Title' } });
void sendWebPush(
  env,
  { endpoint: 'https://push.example', p256dh: 'key', auth: 'key' },
  // @ts-expect-error push notification targets must be textual
  { title: 'Title', body: 'Body', url: 42, tag: 'tag' }
);
// @ts-expect-error request plans require status
void attachPreparationToRequests(env, [{ id: 'request', parish_id: 'parish' }]);
// @ts-expect-error storage input must be a stream
void storeTeachingAudio(bucket, { parishId: 'parish', key: 'audio', source: 'audio', contentType: 'audio/mpeg' });
// @ts-expect-error pledge amounts are numeric
void syncPledgeToHousehold(env, 'donor@example.org', 'parish', '100');
// @ts-expect-error bulletin service dates are textual
void buildSundayLiturgicalBlock({ serviceDate: 20261018 });

void handleIdentityLogin(request, env);
// @ts-expect-error identity login requires a real Request
void handleIdentityLogin({}, env);
// @ts-expect-error invitation tokens must be textual
void handleIdentityInvitationAccept(request, env, 42);

import { searchJournalEntries } from '../../src/accounting/ledger/workspace.js';
declare const db: Parameters<typeof searchJournalEntries>[0];
void searchJournalEntries(db, { limit: '25', offset: '0' });
// @ts-expect-error pagination does not accept boolean limits
void searchJournalEntries(db, { limit: true });

import { ROLE_TEMPLATES } from '../../src/lib/authorization.js';
const roleCapabilities: readonly string[] | undefined = ROLE_TEMPLATES.treasurer;
void roleCapabilities;
// @ts-expect-error role templates contain capability arrays rather than nested capability objects
void ROLE_TEMPLATES.treasurer?.capabilities;
