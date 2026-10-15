export function activateLearnOdysseyAccount(
  env: Partial<Env>,
  email: string,
  odysseyRef: string
): Promise<{ ok: boolean; error?: string; alreadyActive?: boolean }>;
