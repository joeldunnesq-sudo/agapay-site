// Contract for the legacy submission boundary; this does not validate incoming JSON.
export function submitParishSupportTicket(
  env: Partial<Env>,
  request: Request,
  parish: Record<string, unknown>,
  body: object
): Promise<{ ok: true; ticket: Record<string, unknown> } | { ok: false; status: number; error: string }>;
