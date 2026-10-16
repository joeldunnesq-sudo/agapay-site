import type { LearnSetupSnapshot } from '../../src/learn/setup-persistence.js';
import type { LearnRuntimeSeed, LearnRuntimeBook } from '../../src/learn/setup-operation-contracts.js';
import { applySetupSnapshotToSeed, getLearnSeedForIdentity } from '../../src/learn/setup-persistence.js';
import { getLearnSeedSnapshot } from '../../src/learn/demo-data.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
const snapshotIsChecked: IsAny<LearnSetupSnapshot> = false;
const householdNameIsChecked: IsAny<LearnSetupSnapshot['household']['name']> = false;
const bookMinutesAreChecked: IsAny<LearnRuntimeBook['minutes']> = false;
const plannerRowsAreChecked: IsAny<LearnRuntimeSeed['plannerWeek']['householdRows'][number]> = false;
void [snapshotIsChecked, householdNameIsChecked, bookMinutesAreChecked, plannerRowsAreChecked];
const runtime: LearnRuntimeSeed = getLearnSeedSnapshot();
void applySetupSnapshotToSeed(runtime, null);
void getLearnSeedForIdentity({}, null);
// @ts-expect-error Normalized household names are text.
const invalidName: LearnSetupSnapshot['household']['name'] = 42;
// @ts-expect-error Planner minutes are numeric day values.
const invalidMinutes: LearnRuntimeSeed['plannerWeek']['householdRows'][number]['minutes'] = ['20'];
// @ts-expect-error Book progress has a numeric or textual value, never a structured object.
const invalidChapter: LearnRuntimeBook['currentChapter'] = { chapter: 2 };
void [invalidName, invalidMinutes, invalidChapter];
