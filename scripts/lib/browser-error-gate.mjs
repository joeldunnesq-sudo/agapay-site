import assert from 'node:assert/strict';

export function captureBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('crash', () => errors.push('Browser page crashed'));
  return {
    errors,
    assertClean() {
      assert.deepEqual(errors, [], 'Uncaught browser errors must fail the smoke gate');
    },
  };
}
