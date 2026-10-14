// Generated from src/accounting/provisioning/naming.ts by npm run build:server. Do not edit.
import { requireNonEmptyString } from '../validation.js';
async function deterministicAccountingDatabaseName({ parishId, environment }) {
  const source = `${requireNonEmptyString(environment, 'environment')}:${requireNonEmptyString(parishId, 'parishId')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const suffix = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20);
  return `agapay-acct-${environment}-${suffix}`;
}
export { deterministicAccountingDatabaseName };
