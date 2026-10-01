export function numericCents(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}
