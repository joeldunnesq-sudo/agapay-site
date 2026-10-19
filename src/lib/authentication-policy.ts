export function privilegedMfaRequired(env: Partial<Pick<Env, 'PRIVILEGED_MFA_REQUIRED'>>) {
  return (
    String(env?.PRIVILEGED_MFA_REQUIRED || '')
      .trim()
      .toLowerCase() === 'true'
  );
}
