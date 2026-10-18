import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium } from 'playwright';

function functionsFrom(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names
    .map((name) => {
      const node = ast.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
      assert.ok(node, `Missing actual emitted function: ${name}`);
      return node.getText(ast).replace(/^export\s+/, '');
    })
    .join('\n');
}
const shared = functionsFrom('../public/learn/dashboard-shell.js', [
  'isLearnWeekAssignment',
  'parseLearnWeekAssignments',
  'weekAssignmentStorageKey',
  'readWeekAssignmentState',
  'truthyLearn3',
]);
const sandbox = vm.createContext({});
vm.runInContext(shared, sandbox);
const parse = (raw) => sandbox.parseLearnWeekAssignments(raw);
for (const raw of ['{', '', 'null', '[]', 'true', '5', '"invalid"']) {
  const parsed = parse(raw);
  assert.equal(parsed.valid, false);
  assert.deepEqual(Object.keys(parsed.state), []);
}
assert.equal(parse(null).valid, true);
assert.equal(parse('{}').valid, true);
for (const entry of [
  null,
  [],
  3,
  'bad',
  { zone: 3 },
  { note: [] },
  { sourceId: {} },
  { status: null },
  { completed: 'false' },
  { autoPlaced: 1 },
]) {
  const parsed = parse(JSON.stringify({ good: { zone: 'pool', note: 'Keep', extra: { future: true } }, bad: entry }));
  assert.equal(parsed.valid, false);
  assert.deepEqual(Object.keys(parsed.state), ['good']);
  assert.equal(parsed.state.good.note, 'Keep');
  assert.equal(parsed.state.good.extra.future, true);
}
const valid = parse(
  '{"__proto__":{"zone":"pool"},"constructor":{"zone":"auto","autoPlaced":true},"empty":{},"manual":{"zone":"2026-10-18","note":"Greek: Κύριε","completed":false,"status":"future","sourceId":"source"}}'
);
assert.equal(valid.valid, true);
assert.equal(Object.getPrototypeOf(valid.state), null);
assert.equal(valid.state.__proto__.zone, 'pool');
assert.equal(valid.state.constructor.autoPlaced, true);
assert.equal(valid.state.toString, undefined);
assert.equal(valid.state.manual.note, 'Greek: Κύριε');
assert.equal(Object.prototype.zone, undefined);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><main id="learnRoot"></main>' })
  );
  await page.goto('https://learn-boundary.test/fixture');
  const emitted = functionsFrom('../public/learn/dashboard-shell.js', [
    'learnNamedField',
    'setupPayloadFromForm',
    'familyPlanningPayloadFromForm',
    'captureSimpleSetupStep',
    'collectRows',
    'rowValue',
    'truthyLearn10',
    'truthyLearn11',
    'truthyLearn13',
    'wireWeeklyAssignmentBoard',
    'learnMealSlotValue',
  ]);
  const mealHelpers = functionsFrom('../public/learn/dashboard-shell-planner-family.js', [
    'plannerMealSlotValue',
    'plannerMealDinner',
  ]);
  await page.addScriptTag({
    content: `${shared}\n${emitted}\n${mealHelpers}\n
    const root = document.getElementById('learnRoot');
    const SIMPLE_SETUP_STEPS = [0, 1, 2, 3, 4, 5];
    let learnGoogleCalendarStatus = { configured: false, connected: false };
    const savedDrafts = [], dialogs = [], syncs = [];
    const saveSimpleSetupDraft = draft => savedDrafts.push(JSON.parse(JSON.stringify(draft)));
    const showLearnDialog = (...args) => dialogs.push(args);
    const syncLearnGoogleCalendar = (...args) => syncs.push(args);
    const isLearnFamilyPlan = () => true;
    let fetchCalls = 0;
    window.fetch = async () => { fetchCalls++; throw new Error('Unexpected provider call in fixture'); };
  `,
  });
  const controls = await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<form id="controls">
      <input name="wizard.householdName" value="  Household  "><input name="wizard.parentName" value="  Parent  ">
      <select name="wizard.calendarType"><option value="julian">Julian</option></select>
      <input type="radio" name="radio.group" value="first"><input type="radio" name="radio.group" value="second" checked>
      <input type="checkbox" name="wizard.useForms" checked><input type="checkbox" name="wizard.starterWeek" checked>
      <input type="hidden" name="preferences.graceModeActive" value=" true ">
      <input name="household.motherName" value="  Maria  "><input name="length" value="native named field">
      <input id="idOnly" value="by id"><input disabled name="disabled" value="retained">
      <fieldset name="fieldset"></fieldset>
    </form><input form="controls" name="external" value="associated">`
    );
    const form = document.getElementById('controls');
    const read = (name) => learnNamedField(form, name);
    const result = {
      radio: read('radio.group'),
      missing: read('missing'),
      length: read('length'),
      external: read('external'),
      id: read('idOnly'),
      disabled: read('disabled'),
      fieldset: read('fieldset'),
    };
    const draft = { step: 0, children: [{ formLabel: 'Form I' }] };
    captureSimpleSetupStep(form, draft);
    draft.step = 2;
    captureSimpleSetupStep(form, draft);
    result.checked = draft.useForms;
    form.elements.namedItem('wizard.useForms').checked = false;
    captureSimpleSetupStep(form, draft);
    result.unchecked = draft.useForms;
    result.clearedChild = draft.children[0].formLabel;
    draft.step = 5;
    captureSimpleSetupStep(form, draft);
    result.starter = draft.starterWeek;
    result.draft = savedDrafts[0];
    const payload = setupPayloadFromForm(form);
    result.hiddenTrue = payload.preferences.graceModeActive;
    form.elements.namedItem('preferences.graceModeActive').value = 'false';
    result.hiddenFalse = setupPayloadFromForm(form).preferences.graceModeActive;
    result.family = familyPlanningPayloadFromForm(form).household;
    return result;
  });
  assert.equal(controls.radio.value, 'second');
  assert.equal(controls.radio.checked, undefined);
  assert.equal(controls.missing.value, undefined);
  assert.equal(controls.missing.checked, undefined);
  assert.equal(controls.missing.type, undefined);
  assert.equal(controls.length.value, 'native named field');
  assert.equal(controls.external.value, 'associated');
  assert.equal(controls.id.value, 'by id');
  assert.equal(controls.disabled.value, 'retained');
  assert.equal(controls.fieldset.value, undefined);
  assert.equal(controls.fieldset.checked, undefined);
  assert.equal(controls.draft.householdName, 'Household');
  assert.equal(controls.draft.parentName, 'Parent');
  assert.equal(controls.checked, true);
  assert.equal(controls.unchecked, false);
  assert.equal(controls.clearedChild, '');
  assert.equal(controls.starter, true);
  assert.equal(controls.hiddenTrue, true);
  assert.equal(controls.hiddenFalse, false);
  assert.equal(controls.family.motherName, 'Maria');
  assert.equal(controls.family.fatherName, '');
  const meals = await page.evaluate(() => ({
    root: ['breakfast', 'lunch', 'dinner', 'constructor', '__proto__'].map(
      (slot) => learnMealSlotValue({ breakfast: 'Oats', lunch: '', dinner: 'Soup' }, slot) ?? null
    ),
    planner: ['breakfast', 'lunch', 'dinner', 'constructor'].map(
      (slot) => plannerMealSlotValue({ breakfast: 'Oats', dinner: 'Soup' }, slot) ?? null
    ),
    dinners: [null, 'Legacy meal label', {}, { dinner: 42 }, { dinner: 'Soup' }].map(
      (meal) => plannerMealDinner(meal) ?? null
    ),
  }));
  assert.deepEqual(meals.root, ['Oats', '', 'Soup', null, null]);
  assert.deepEqual(meals.planner, ['Oats', null, 'Soup', null]);
  assert.deepEqual(meals.dinners, [null, null, null, null, 'Soup']);

  const cases = ['missing', 'valid', 'invalid-root', 'invalid-sibling', 'get-denied', 'set-denied', 'prototype-id'];
  for (const mode of cases) {
    const result = await page.evaluate(async (mode) => {
      localStorage.clear();
      learnGoogleCalendarStatus = { configured: true, connected: true };
      dialogs.length = 0;
      syncs.length = 0;
      fetchCalls = 0;
      const itemId = mode === 'prototype-id' ? '__proto__' : 'item-a';
      const model = {
        week: { weeklyAssignmentItems: [{ id: itemId, title: 'Math' }], days: [{ date: '2026-10-18' }] },
        familyPlanning: {},
      };
      root.innerHTML = `<section data-week-assignment-board data-week-key="boundary">
        <div data-week-assignment-zone="pool"><article data-week-assignment-card data-item-id="${itemId}" data-statuses="reduced"><strong>Math</strong><textarea data-week-assignment-note></textarea></article></div>
        <div data-week-assignment-zone="2026-10-19"></div><button data-week-designed-print>Print</button>
      </section>`;
      const key = weekAssignmentStorageKey(model, 'boundary');
      const stored =
        mode === 'invalid-root'
          ? '{invalid'
          : JSON.stringify({
              [itemId]: { zone: '2026-10-19', note: 'Saved' },
              ...(mode === 'invalid-sibling' ? { damaged: { zone: 3 } } : {}),
            });
      if (mode !== 'missing') localStorage.setItem(key, stored);
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem;
      if (mode === 'get-denied')
        Storage.prototype.getItem = function (name) {
          if (name === key) throw new DOMException('Denied', 'SecurityError');
          return get.call(this, name);
        };
      if (mode === 'set-denied')
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Full', 'QuotaExceededError');
          return set.call(this, name, value);
        };
      try {
        wireWeeklyAssignmentBoard(model);
        const card = root.querySelector('[data-week-assignment-card]'),
          note = card.querySelector('textarea');
        const restoredZone = card.parentElement.dataset.weekAssignmentZone,
          restoredNote = note.value;
        note.value = 'Edited';
        note.dispatchEvent(new Event('input', { bubbles: true }));
        if (mode.startsWith('invalid') || mode === 'get-denied' || mode === 'set-denied')
          root.querySelector('[data-week-designed-print]').click();
        await new Promise((resolve) => setTimeout(resolve, 1050));
        const print = root.querySelector('[data-week-designed-print]');
        return {
          raw: get.call(localStorage, key),
          stored,
          key,
          restoredZone,
          restoredNote,
          dialogs: dialogs.map((args) => args.slice(0, 2)),
          syncs: syncs.length,
          fetchCalls,
          disabled: print.disabled,
          label: print.textContent,
          read: mode === 'valid' ? readWeekAssignmentState(model, 'boundary') : null,
        };
      } finally {
        Storage.prototype.getItem = get;
        Storage.prototype.setItem = set;
      }
    }, mode);
    const blocked = ['invalid-root', 'invalid-sibling', 'get-denied', 'set-denied'].includes(mode);
    if (blocked) {
      assert.equal(result.raw, result.stored, mode + ': no rejected update may overwrite raw data');
      assert.equal(result.dialogs.length, 2, mode + ': failed save and print show actionable feedback');
      assert.ok(result.dialogs.every(([title]) => title === 'Could Not Save This Week'));
      assert.equal(result.fetchCalls, 0);
      assert.equal(result.syncs, 0);
      assert.equal(result.disabled, false);
      assert.equal(result.label, 'Print');
    } else {
      const state = JSON.parse(result.raw),
        id = mode === 'prototype-id' ? '__proto__' : 'item-a';
      assert.equal(Object.hasOwn(state, id), true);
      assert.equal(state[id].note, 'Edited');
      assert.equal(state[id].zone, mode === 'missing' ? 'pool' : '2026-10-19');
      assert.deepEqual(result.dialogs, []);
      assert.equal(result.syncs, 1, mode + ': valid saved edits schedule exactly one calendar update');
      if (mode === 'valid') assert.equal(result.read['item-a'].note, 'Edited');
    }
    if (mode === 'valid' || mode === 'invalid-sibling') {
      assert.equal(result.restoredZone, '2026-10-19');
      assert.equal(result.restoredNote, 'Saved');
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS - emitted Learn controls, meal fields, shared weekly JSON readers and lossless rejected saves/prints'
  );
} finally {
  await browser.close();
}
