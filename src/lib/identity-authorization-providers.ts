import { recordAuditEvent } from './audit-log.js';
import { createIdentityAuthorization } from './identity-authorization.js';
export const { requireCapability, requireActiveMembership } = createIdentityAuthorization({ recordAuditEvent });
