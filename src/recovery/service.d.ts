import type { PortabilityConfiguration } from '../portability/contracts.js';
/** Only the scheduled continuation boundary is declared; the service implementation remains JavaScript. */
export function advanceRecovery(env: PortabilityConfiguration, parishId: string, operationId: string): Promise<unknown>;
