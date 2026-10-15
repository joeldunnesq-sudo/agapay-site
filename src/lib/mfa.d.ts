export function mfaReadiness(env: Partial<Env>): Promise<{ required: boolean; ok: boolean; error?: string }>;
