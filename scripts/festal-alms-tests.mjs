import assert from "node:assert/strict";
import {
  activeFestalAlmsCampaigns,
  festalAlmsVisibilityWindow
} from "../src/festal-alms.js";

const campaign = (id) => ({ id, name: id, enabled: true });

const dormition = festalAlmsVisibilityWindow(campaign("dormition"), "gregorian", "2026-08-10");
assert.deepEqual(dormition, {
  feastDate: "2026-08-15",
  startsAt: "2026-08-01",
  endsAt: "2026-08-22",
  fastStartId: "dormition-fast-begins"
});
assert.equal(activeFestalAlmsCampaigns([campaign("dormition")], "gregorian", "2026-08-01").length, 1);
assert.equal(activeFestalAlmsCampaigns([campaign("dormition")], "gregorian", "2026-07-31").length, 0);
assert.equal(activeFestalAlmsCampaigns([campaign("dormition")], "gregorian", "2026-08-22").length, 1);
assert.equal(activeFestalAlmsCampaigns([campaign("dormition")], "gregorian", "2026-08-23").length, 0);

const theophany = festalAlmsVisibilityWindow(campaign("theophany"), "gregorian", "2026-01-06");
assert.equal(theophany.startsAt, "2025-12-30");
assert.equal(theophany.endsAt, "2026-01-13");
assert.equal(theophany.fastStartId, null);

const julianNativity = festalAlmsVisibilityWindow(campaign("nativity-christ"), "julian", "2026-01-07");
assert.equal(julianNativity.feastDate, "2026-01-07");
assert.equal(julianNativity.startsAt, "2025-11-28");
assert.equal(julianNativity.endsAt, "2026-01-14");

const onlyNearest = activeFestalAlmsCampaigns(
  [campaign("circumcision"), campaign("theophany")],
  "gregorian",
  "2026-01-05"
);
assert.equal(onlyNearest.length, 1);
assert.equal(onlyNearest[0].id, "theophany");

assert.equal(activeFestalAlmsCampaigns([{ ...campaign("theophany"), enabled: false }], "gregorian", "2026-01-06").length, 0);

console.log("festal alms visibility tests passed");
