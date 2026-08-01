import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, service, admin, selfHandler, parishApp, parishCss, memberUi] = await Promise.all([
  readFile(new URL("../migrations/0082_directory_review_correspondence.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/directory/review-correspondence.js", import.meta.url), "utf8"),
  readFile(new URL("../src/directory/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/directory-self-service.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/parish/redesign.css", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/directory.html", import.meta.url), "utf8")
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS directory_review_correspondence/);
assert.match(migration, /direction IN \('staff_to_member', 'member_to_staff'\)/);
assert.match(admin, /cleanedDecision === "return"[\s\S]*Tell the member what information is needed/);
assert.match(admin, /directoryReviewMessageStatement\([\s\S]*staff_to_member/);
assert.match(admin, /owner_type === "household"[\s\S]*directory_household_verifications/,
  "approving a first household submission must complete its initial confirmation");
assert.match(service, /member_to_staff[\s\S]*status = 'pending_approval'[\s\S]*queue_status = 'pending_review'/,
  "a member response must place the same source back into the review queue");
assert.match(selfHandler, /\/api\/directory\/self\/review-requests/);
assert.match(parishApp, /fetch\(directoryAdminApi\('\/queue'\)/);
assert.match(parishApp, /Confirm submission[\s\S]*Ask for information[\s\S]*Decline/);
assert.doesNotMatch(parishApp, /directoryMaintenanceActions\(maintenance\.actions \|\| \{\}\)/);
assert.match(parishApp, /queue\.map\(\(item\) => \(\{ \.\.\.item, queueKind: 'submission' \}\)\)/,
  "the parish queue must be derived only from submitted review items");
assert.doesNotMatch(parishApp, /queueKind: 'followup'|Account links needed|Adult account link needed/,
  "unlinked donors and unfinished profiles must not become parish follow-up work");
assert.match(parishCss, /pdx-dir-health-ring[\s\S]*conic-gradient/);
assert.match(memberUi, /directoryReviewRequests[\s\S]*Send response and resubmit/);
assert.match(memberUi, /Confirm household is current[\s\S]*verification\/complete/);

console.log("PASS - directory review queue, information request, member response, and household confirmation are wired end to end");
