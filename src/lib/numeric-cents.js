// Generated from src/lib/numeric-cents.ts by npm run build:server. Do not edit.
function numericCents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}
export { numericCents };
