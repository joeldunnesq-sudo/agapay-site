// Generated from src/lib/normalize-email.ts by npm run build:server. Do not edit.
function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
export { normalizeEmail };
