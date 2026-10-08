export interface RegistrationInsert {
  [field: string]: unknown;
  reference: string;
  parishId: string;
  status: string;
  parishName: string;
  communityType: string;
  receivedAt: string;
}
import { sha256Hex } from './core.js';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable((value as Record<string, unknown>)[key])])
  );
}

export async function registrationRetryIdentity(request: Request, body: unknown) {
  const key = request.headers.get('Idempotency-Key');
  if (!key) return null;
  if (!/^[a-f0-9-]{36}$/i.test(key)) return { error: 'Invalid registration retry key.' };
  return {
    reference: `AGP-REG-${await sha256Hex(key)}`,
    hash: await sha256Hex(JSON.stringify(stable(body))),
  };
}

export async function insertRegistrationOnce(env: Pick<Env, 'AGAPAY_DB'>, registration: RegistrationInsert) {
  const result = await env.AGAPAY_DB.prepare(
    `INSERT INTO registrations
    (reference, parish_id, status, parish_name, community_type, stripe_account_id,
     stripe_subscription_id, received_at, updated_at, data)
    VALUES (?1, ?2, ?3, ?4, ?5, '', '', ?6, ?6, ?7)
    ON CONFLICT(reference) DO NOTHING`
  )
    .bind(
      registration.reference,
      registration.parishId,
      registration.status,
      registration.parishName,
      registration.communityType,
      registration.receivedAt,
      JSON.stringify(registration)
    )
    .run();
  return Number(result.meta?.changes) === 1;
}
