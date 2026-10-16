import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { readBrowserContractSourceSync } from './lib/browser-typescript.mjs';
const source = readBrowserContractSourceSync('public/donor/app.js');
export function pledgeFunctions(code) {
  const ast = ts.createSourceFile('donor.js', code, 99, true, ts.ScriptKind.JS);
  return ast.statements
    .filter((n) => ts.isFunctionDeclaration(n) && ['money', 'renderPledgeTracker'].includes(n.name.text))
    .map((n) => n.getText(ast))
    .join('\n');
}
const ids = [
  'pledgeTrackerCard',
  'pledgeActiveState',
  'pledgeEmptyState',
  'pledgeLockedState',
  'pledgeBarFill',
  'pledgeBarTrack',
  'pledgeTrackerLabel',
  'pledgeRaised',
  'pledgePct',
  'pledgeGoal',
  'desktopPledgeTracker',
  'desktopPledgeActiveState',
  'desktopPledgeEmptyState',
  'desktopPledgeLockedState',
  'desktopPledgeBarFill',
  'desktopPledgeBarTrack',
  'desktopPledgeTitle',
  'desktopPledgeRaised',
  'desktopPledgePct',
  'desktopPledgeGoal',
];
const markup = readFileSync(new URL('../public/myagapay/index.html', import.meta.url), 'utf8');
for (const id of ids)
  assert.ok(markup.includes(`id="${id}"`), 'Pledge fixture must match actual dashboard markup: ' + id);
export function exercisePledge(code, { donor, summary = {}, parish, missing = [] }) {
  const trace = [],
    timers = [],
    elements = new Map();
  for (const id of ids.filter((id) => !missing.includes(id))) {
    const attrs = {},
      classes = {},
      link = { href: 'original' },
      element = {
        hidden: false,
        textContent: 'original',
        style: { width: 'original' },
        attrs,
        classes,
        link,
        setAttribute(name, value) {
          attrs[name] = String(value);
          trace.push(['attribute', id, name, String(value)]);
        },
        classList: {
          toggle(name, enabled) {
            classes[name] = enabled;
            trace.push(['class', id, name, enabled]);
          },
        },
        querySelector(selector) {
          trace.push(['query', id, selector]);
          return link;
        },
      };
    elements.set(id, element);
  }
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super('2026-10-16T12:00:00Z');
    }
  }
  const context = vm.createContext({
    Date: FixedDate,
    document: {
      getElementById(id) {
        trace.push(['get', id]);
        return elements.get(id) || null;
      },
    },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
    },
  });
  vm.runInContext(code, context);
  context.renderPledgeTracker(donor, summary, parish);
  const snapshot = () =>
    Object.fromEntries(
      [...elements].map(([id, e]) => [
        id,
        {
          hidden: e.hidden,
          textContent: e.textContent,
          style: { ...e.style },
          attrs: { ...e.attrs },
          classes: { ...e.classes },
          href: e.link.href,
        },
      ])
    );
  const before = snapshot();
  for (const timer of timers) timer.callback();
  return { before, after: snapshot(), delays: timers.map((t) => t.delay), trace };
}
const code = pledgeFunctions(source),
  parish = { id: 'test-parish', pledgeTrackerEnabled: true };
const annual = exercisePledge(code, {
  donor: { pledgeAmountCents: 10000, pledgeCadence: 'annual' },
  summary: { stewardshipYtdCents: 2500, ytdCents: 999999, stewardshipMonthCents: 100 },
  parish,
});
assert.equal(annual.before.pledgeBarFill.style.width, 'original');
assert.equal(annual.after.pledgeBarFill.style.width, '25%');
assert.equal(annual.after.desktopPledgeBarFill.style.width, '25%');
assert.equal(annual.after.pledgeRaised.textContent, '$25 given');
assert.equal(annual.after.desktopPledgeRaised.textContent, '$25 given');
assert.equal(annual.after.pledgeTrackerLabel.textContent, '2026 Annual Pledge');
assert.equal(annual.after.desktopPledgeTitle.textContent, '2026 Annual Pledge');
assert.equal(annual.after.pledgeBarTrack.attrs['aria-valuenow'], '25');
assert.equal(annual.after.pledgeTrackerCard.href, '/myagapay/account#pledge');
assert.deepEqual(annual.delays, [120, 120]);
const monthly = exercisePledge(code, {
  donor: { pledgeAmountCents: 10000, pledgeCadence: 'monthly' },
  summary: { stewardshipMonthCents: 15000, stewardshipYtdCents: 1 },
  parish,
});
assert.equal(monthly.after.pledgeBarFill.style.width, '100%');
assert.equal(monthly.after.desktopPledgeBarFill.classes['pledge-complete'], true);
assert.equal(monthly.after.pledgeRaised.textContent, '$150 given');
for (const [donor, p, activeHidden, emptyHidden, lockedHidden] of [
  [{ pledgeAmountCents: 0 }, parish, true, false, true],
  [{ pledgeAmountCents: 10000 }, { ...parish, pledgeTrackerEnabled: false }, true, true, false],
]) {
  const result = exercisePledge(code, { donor, parish: p });
  for (const prefix of ['pledge', 'desktopPledge']) {
    assert.equal(result.after[prefix + 'ActiveState'].hidden, activeHidden);
    assert.equal(result.after[prefix + 'EmptyState'].hidden, emptyHidden);
    assert.equal(result.after[prefix + 'LockedState'].hidden, lockedHidden);
  }
  assert.deepEqual(result.delays, []);
}
const absent = exercisePledge(code, { donor: { pledgeAmountCents: 1 }, parish: null });
assert.equal(absent.after.pledgeTrackerCard.hidden, true);
assert.equal(absent.after.desktopPledgeTracker.hidden, true);
assert.deepEqual(exercisePledge(code, { donor: null, parish }).trace, []);
console.log(
  'PASS - both pledge layouts preserve scoped giving amounts, annual/monthly labels, complete/empty/locked states, native ARIA values, edit links and delayed fill timing'
);
