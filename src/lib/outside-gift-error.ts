export class OutsideGiftError extends Error {
  declare status: number;
  declare code: string;
  constructor(message: string, status = 422, code = 'outside_gift_invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
