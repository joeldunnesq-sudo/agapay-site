import type { LearnShellBindings } from '../../src/browser/learn/dashboard-shell.js';
import type { LearnShellPayload, LearnShellNode } from '../../src/browser/learn/dashboard-shell-contracts.js';
import { safeArray } from '../../src/browser/learn/dashboard-view-models-shared.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
const apiResultIsChecked: IsAny<Awaited<ReturnType<LearnShellBindings['apiGet']>>> = false;
const weeks = safeArray([1, 2, 3]);
const numericWeek: number = weeks[0];
const completion: LearnShellNode = { checked: true, scheduledWeeks: [1, 2], scheduledDays: ['1', '2'] };
const response: LearnShellPayload = { plan: 'family', fullAccess: true, printLimit: 3 };
void [apiResultIsChecked, numericWeek, completion, response];
// @ts-expect-error Numeric weeks stay numeric rather than becoming any.
const badWeek: string = weeks[0];
// @ts-expect-error Authentication URL is text.
const badUrl: LearnShellPayload = { authUrl: false };
// @ts-expect-error Live entitlement is boolean.
const badAccess: LearnShellPayload = { fullAccess: 'true' };
// @ts-expect-error Selected week numbers are numeric.
const badSchedule: LearnShellNode = { scheduledWeeks: ['1'] };
void [badWeek, badUrl, badAccess, badSchedule];
