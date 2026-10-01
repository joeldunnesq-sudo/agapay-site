// Generated from src/lib/outside-gift-error.ts by npm run build:server. Do not edit.
class OutsideGiftError extends Error {
  constructor(message, status = 422, code = 'outside_gift_invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export { OutsideGiftError };
