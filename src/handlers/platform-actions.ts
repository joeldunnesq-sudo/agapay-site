type PlatformEnvironment = Partial<Env> &
  Partial<
    Record<
      'STRIPE_SECRET_KEY' | 'RESEND_API_KEY' | 'TURNSTILE_SECRET_KEY' | 'AGAPAY_BUILD_SHA' | 'AGAPAY_DEPLOYED_AT',
      string
    >
  >;
import { d1, json } from '../lib/core.js';
import { mfaReadiness } from '../lib/mfa.js';
import { activateLearnOdysseyAccount } from '../learn/billing.js';

export async function handleLearnOdysseyActivate(request: Request, env: PlatformEnvironment) {
  let body;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const password = String(body.password || '').trim();
  const odysseyRef = String(body.odysseyRef || '').trim();
  if (!email || !password || !odysseyRef) {
    return Response.json({ ok: false, error: 'Email, password, and Odyssey reference are required.' }, { status: 400 });
  }
  // Authenticate against the existing My AGAPAY donor account
  const loginRes = await fetch(
    new Request(new URL('/api/donor/login', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  );
  const loginData = (await loginRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!loginRes.ok || !loginData.token) {
    return Response.json({ ok: false, error: loginData.error || 'Invalid email or password.' }, { status: 401 });
  }
  // Activate Odyssey Learn plan
  const result = await activateLearnOdysseyAccount(env, email, odysseyRef);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 500 });
  return Response.json({
    ok: true,
    token: loginData.token,
    email,
    plan: 'family',
    source: 'odyssey',
    alreadyActive: result.alreadyActive || false,
  });
}

export async function handleHealth(env: PlatformEnvironment) {
  const now = new Date().toISOString();
  const checks = {
    worker: { ok: true },
    mfa: await mfaReadiness(env),
    d1: { ok: false } as { ok: boolean; error?: unknown },
    kv: { ok: false } as { ok: boolean; error?: unknown },
    stripe: { configured: Boolean(env.STRIPE_SECRET_KEY) },
    email: { configured: Boolean(env.RESEND_API_KEY) },
    turnstile: { configured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) },
    r2: {
      campaignAssets: Boolean(env.CAMPAIGN_ASSETS),
      taxExemptionDocs: Boolean(env.TAX_EXEMPTION_DOCS),
      nonprofitPricingDocs: Boolean(env.NONPROFIT_PRICING_DOCS),
      givingStatements: Boolean(env.GIVING_STATEMENTS),
      accountingBackups: Boolean(env.ACCOUNTING_BACKUPS),
      sacramentDocuments: Boolean(env.SACRAMENT_DOCUMENTS),
    },
  };

  try {
    const db = d1(env);
    if (db) {
      await db.prepare('SELECT 1 AS ok').first();
      checks.d1.ok = true;
    } else {
      checks.d1.error = 'not_configured';
    }
  } catch (error) {
    checks.d1.error = (error as Error | null)?.message || 'unavailable';
  }

  try {
    if (env.AGAPAY_REGISTRATIONS?.get) {
      await env.AGAPAY_REGISTRATIONS.get('__agapay_healthcheck__');
      checks.kv.ok = true;
    } else {
      checks.kv.error = 'not_configured';
    }
  } catch (error) {
    checks.kv.error = (error as Error | null)?.message || 'unavailable';
  }

  const ok = Boolean(checks.worker.ok && checks.d1.ok && checks.kv.ok && (!checks.mfa.required || checks.mfa.ok));
  return json(
    {
      ok,
      version: env.AGAPAY_BUILD_SHA || 'unknown',
      deployedAt: env.AGAPAY_DEPLOYED_AT || '',
      checkedAt: now,
      checks,
    },
    { status: ok ? 200 : 503 }
  );
}
