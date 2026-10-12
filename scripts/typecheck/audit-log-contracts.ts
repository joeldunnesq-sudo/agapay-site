import { recordAuditEvent, listAuditEvents } from '../../src/lib/audit-log.js';
void recordAuditEvent({}, null, { action: 'test', before: { status: 'old' } });
void listAuditEvents({}, { limit: 10, organizationId: 'parish' });
// @ts-expect-error requests must expose actual headers
void recordAuditEvent({}, {});
// @ts-expect-error action must be text
void recordAuditEvent({}, null, { action: 3 });
// @ts-expect-error limit must be numeric
void listAuditEvents({}, { limit: '10' });
// @ts-expect-error filter identifiers must be text
void listAuditEvents({}, { organizationId: {} });
// @ts-expect-error parsed metadata must be narrowed before property access
void listAuditEvents({}).then((result) => result.events[0]?.metadata.secret);
