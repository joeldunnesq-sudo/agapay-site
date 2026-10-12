import {
  computeAvailableSlots,
  isSlotStillOpen,
  zonedTimeToUtc,
  type AvailableSlot,
} from '../../src/lib/sacrament-availability.js';
void computeAvailableSlots({}, { parishId: 'p', sacramentType: 'confession', timezone: 'UTC', maxSlots: 4 });
void isSlotStillOpen({}, { parishId: 'p', date: '2030-01-01', time: '10:00' });
const date: Date = zonedTimeToUtc('2030-01-01', '10:00', 'UTC');
void date;
// @ts-expect-error Slot limits must be numeric.
void computeAvailableSlots({}, { parishId: 'p', sacramentType: 'confession', timezone: 'UTC', maxSlots: '4' });
// @ts-expect-error A booking check requires a time.
void isSlotStillOpen({}, { parishId: 'p', date: '2030-01-01' });
// @ts-expect-error Slot timestamps remain strings.
const slot: AvailableSlot = { date: '', time: '', priestName: '', priestEmail: '', startsAt: new Date(), label: '' };
void slot;
