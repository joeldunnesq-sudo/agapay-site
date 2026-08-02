import assert from "node:assert/strict";
import { observeScheduledTask } from "../src/worker.js";

const originalLog = console.log;
const originalError = console.error;
const logs = [];
const errors = [];
console.log = (...args) => logs.push(args);
console.error = (...args) => errors.push(args);

try {
  const result = await observeScheduledTask("test_scheduled_job", Promise.resolve({ processed: 2 }));
  assert.deepEqual(result, { processed: 2 });
  assert.deepEqual(logs, [["test_scheduled_job", JSON.stringify({ processed: 2 })]]);

  const failure = new Error("simulated scheduled failure");
  await assert.rejects(
    observeScheduledTask("test_scheduled_job", Promise.reject(failure)),
    (error) => error === failure,
    "scheduled failures must remain rejected so the invocation and alerting can see them",
  );
  assert.deepEqual(errors, [["test_scheduled_job_failed", "simulated scheduled failure"]]);
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log("Scheduled-job observability tests passed.");
