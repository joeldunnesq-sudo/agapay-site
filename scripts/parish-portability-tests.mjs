await import('./portability-tests/lifecycle.test.mjs');
await import('./portability-tests/export.test.mjs');
await import('./portability-tests/deletion.test.mjs');
await import('./portability-tests/safeguards.test.mjs');

console.log('Parish portability suites passed: lifecycle, export, deletion, and safeguards.');
