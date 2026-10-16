import assert from 'node:assert/strict';
import { familyPlannerModel, choreTimeValues } from '../public/learn/dashboard-shell-planner-family.js';
import { ACCENTS, safeArray } from '../public/learn/dashboard-view-models-shared.js';
const children = [{ firstName: 'Ada' }, { name: 'Ben', color: '#123456' }, {}];
const vm = { familyPlanning: { weekStart: '2026-10-16', children }, week: { days: [] }, month: { days: [] } };
const model = familyPlannerModel(vm);
assert.deepEqual(
  model.children.map(({ name, color, initial }) => ({ name, color, initial })),
  [
    { name: 'Ada', color: ACCENTS[0], initial: 'A' },
    { name: 'Ben', color: '#123456', initial: 'B' },
    { name: 'Child 3', color: ACCENTS[2], initial: '?' },
  ]
);
assert.equal(model.dates.length, 7);
assert.equal(model.dates[0], '2026-10-11');
assert.equal(model.dates[6], '2026-10-17');
assert.equal(vm.familyPlanning.children, children);
assert.equal(children[0].color, undefined, 'Presentation fallback must not mutate saved child records.');
assert.deepEqual(choreTimeValues('Morning,Evening'), ['Morning', 'Evening']);
assert.deepEqual(choreTimeValues(['Afternoon', 'invalid']), ['Afternoon']);
assert.deepEqual(safeArray([1, 2, 3]), [1, 2, 3]);
console.log(
  'PASS - Learn family palette fallback, explicit colors, dates, immutable records, chore values and numeric arrays'
);
