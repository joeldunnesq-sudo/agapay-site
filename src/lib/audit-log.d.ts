// Narrow event-write boundary. The legacy audit implementation is not migrated.
export interface AuditEventFields extends Record<string, unknown> {
  action?: string;
  actorUserId?: string;
  actorType?: string;
  targetType?: string;
  targetId?: string;
  organizationId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}
export function recordAuditEvent(
  env: Partial<Env>,
  request: Request | null,
  fields?: AuditEventFields
): Promise<string | null>;
