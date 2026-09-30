import { accountingHealthTotp } from './accounting-health-totp.mjs';

// Use the same password + enrolled TOTP flow as the application. Never log
// credentials, challenges, session tokens, or raw authentication responses.
export async function stagingParishSession({
  baseUrl,
  parishId,
  password,
  email,
  totpSecret,
  label = 'Staging parish',
}) {
  if (baseUrl !== 'https://agapay-site-staging.joeldunnesq.workers.dev')
    throw new Error('Staging credentials require the dedicated staging origin.');
  async function post(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${label} authentication returned HTTP ${response.status}.`);
    return response.json();
  }
  let login = await post(
    email ? '/api/identity/login' : `/api/parish/dashboard/${encodeURIComponent(parishId)}/session`,
    email ? { parishId, email, password } : { password }
  );
  if (login.mfaRequired === true) {
    if (login.enrollmentRequired)
      throw new Error(`${label} requires MFA enrollment through the application before this smoke can run.`);
    if (!totpSecret || !login.methods?.includes('totp')) {
      throw new Error(`${label} requires its enrolled TOTP secret in the protected GitHub environment.`);
    }
    if (typeof login.pendingToken !== 'string' || !login.pendingToken)
      throw new Error(`${label} is missing an MFA challenge.`);
    login = await post('/api/mfa/verify', {
      pendingToken: login.pendingToken,
      method: 'totp',
      code: accountingHealthTotp(totpSecret),
    });
  }
  const token = email ? login.parishToken : login.token;
  if (login.mfaRequired || typeof token !== 'string' || !token) {
    throw new Error(`${label} authentication did not return a session token.`);
  }
  return token;
}
