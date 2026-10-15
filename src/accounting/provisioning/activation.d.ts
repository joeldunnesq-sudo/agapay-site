export interface ActivationOperation extends Record<string, unknown> {
  id: string;
  status: string;
  entity_status: string;
  activation_status: string;
  provisioning_status: string;
  health_status: string;
}
export function activationOperation(env: Partial<Env>, parishId: string): Promise<ActivationOperation | null>;
export function activationDto(
  operation: ActivationOperation | null,
  available?: boolean
): { status: string; completed: boolean; staffReady?: boolean; [field: string]: unknown };
export function first<T = Record<string, unknown>>(
  env: Partial<Env>,
  sql: string,
  ...params: unknown[]
): Promise<T | null>;
export function run(env: Partial<Env>, sql: string, ...params: unknown[]): Promise<unknown>;
