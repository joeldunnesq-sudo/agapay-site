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
