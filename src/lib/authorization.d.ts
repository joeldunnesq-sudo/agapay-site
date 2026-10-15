/** Only the legacy capability boundary consumed by Directory is declared here. */
export function requireCapability(
  request: Request,
  env: Partial<Env>,
  parishId: string,
  capability: string
): Promise<{
  user: { id: string };
  membership: { parishId: string };
  capabilities: readonly string[];
} | null>;

export function currentUser(
  request: Request,
  env: Partial<Env>
): Promise<{ id: string; [field: string]: unknown } | null>;

export function expandRoleTemplate(roleTemplate: string): string[];

export function authorize(
  request: Request,
  env: Partial<Env>,
  options?: { parishId?: string; capability?: string }
): Promise<{ user: { id: string }; membership: { id: string }; capabilities: readonly string[] } | null>;

export function requireActiveMembership(
  request: Request,
  env: Partial<Env>,
  parishId: string
): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof import('./identity.js').requirePlatformUser>>>;
  membership: { id: string; parishId: string };
  capabilities: readonly string[];
} | null>;

export const CAPABILITY_CATALOG: readonly string[];
export const ROLE_TEMPLATES: Readonly<Record<string, readonly string[] | undefined>>;
export function sanitizeGrantableCapabilities(capabilities: readonly unknown[]): string[];
