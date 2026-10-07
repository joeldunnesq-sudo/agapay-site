// Narrow declarations for the still-JavaScript facade consumed by migrated catalog code.
// These re-exports describe existing bindings; core.js is not yet type-checked.
export { d1, d1First } from './database-reads.js';
export { DONOR_OFFERING_KEY_PREFIX, listKvKeys } from './kv-reads.js';
