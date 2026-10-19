// Generated from src/lib/identity-authorization-providers.ts by npm run build:server. Do not edit.
import { recordAuditEvent } from './audit-log.js';
import { createIdentityAuthorization } from './identity-authorization.js';
const { requireCapability, requireActiveMembership } = createIdentityAuthorization({ recordAuditEvent });
export { requireActiveMembership, requireCapability };
