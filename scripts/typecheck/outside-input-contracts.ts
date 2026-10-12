import { outsideGiftInput, outsideDigest, auditStatement } from '../../src/lib/outside-gifts.js';
import { validateOutsidePledge } from '../../src/lib/outside-pledges.js';
declare const db: D1Database;
const input = outsideGiftInput({ amountCents: 'untrusted input' }, { funds: [{ id: 'general' }] });
const amount: number = input.amountCents;
void amount;
void validateOutsidePledge(db, 'a', input, { email: 'a@example.test' });
// @ts-expect-error hashing requires text
void outsideDigest(123);
// @ts-expect-error funds must be a collection
void outsideGiftInput({}, { funds: 'general' });
// @ts-expect-error pledge kind is checked
void validateOutsidePledge(db, 'a', { givingKind: 'invalid', pledgeYear: 2026 }, {});
// @ts-expect-error giver email must be text
void validateOutsidePledge(db, 'a', input, { email: 42 });
// @ts-expect-error audit needs revision and parish scope
void auditStatement(db, { id: 'a' }, 'update', 'staff', '', 'now');
