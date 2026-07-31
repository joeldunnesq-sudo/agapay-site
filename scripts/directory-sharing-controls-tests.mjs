import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../public/myagapay/directory.html", import.meta.url), "utf8");
const selfService = fs.readFileSync(new URL("../src/directory/self-service.js", import.meta.url), "utf8");

function formMarkup(id) {
  const start = page.indexOf(`<form`, page.indexOf(`id="${id}"`) - 100);
  const end = page.indexOf("</form>", start);
  assert.ok(start >= 0 && end > start, `${id} should exist`);
  return page.slice(start, end + 7);
}

const starter = formMarkup("startProfileForm");
for (const field of ["emailVisibility", "phoneVisibility", "profileVisibility"]) {
  assert.doesNotMatch(starter, new RegExp(`name=["']${field}["']`), `${field} should not be requested during first-time setup`);
}
assert.match(selfService, /normalizeStarterVisibility\(data\.profileVisibility, "directory_members"\)/, "starter names keep the existing directory-member default");
assert.match(selfService, /normalizeStarterVisibility\(data\.emailVisibility, "private"\)/, "starter email keeps the existing private default");
assert.match(selfService, /normalizeStarterVisibility\(data\.phoneVisibility, "private"\)/, "starter phone keeps the existing private default");

assert.doesNotMatch(formMarkup("householdDetailsForm"), /name=["']locationVisibility["']/, "location sharing should not be requested while editing household details");
assert.doesNotMatch(formMarkup("memberEditForm"), /name=["']visibility["']/, "nameday sharing should be managed in the consolidated sharing step");

const sharing = formMarkup("contactForm");
for (const [label, name] of [
  ["Name", "shareNameVisibility"],
  ["Email", "shareEmailVisibility"],
  ["Phone", "sharePhoneVisibility"],
  ["Location", "shareLocationVisibility"]
]) {
  const select = sharing.match(new RegExp(`<select name="${name}"[\\s\\S]*?</select>`))?.[0] || "";
  assert.ok(select, `${label} should have a sharing selector`);
  assert.match(select, /value="private"/, `${label} should support private`);
  assert.match(select, /value="staff"/, `${label} should support staff only`);
  assert.match(select, /value="directory_members"/, `${label} should support directory members`);
}

assert.match(sharing, /<strong>Family photo<\/strong>[\s\S]*name="sharePhotoVisibility"/, "family photo visibility should appear in step three");
assert.match(page, /\["private", "staff", "directory_members"\]\.includes\(value\)/, "the UI should preserve every supported three-state visibility value");
assert.match(page, /shareEmailVisibility\.value = sharingVisibility\(emailContact\?\.visibility\)/, "existing staff-only contact visibility should hydrate as staff rather than collapsing to private");
assert.match(page, /data-nameday-id=[\s\S]*value="staff"[\s\S]*value="directory_members"/, "each nameday should retain its own three-state sharing selector");

console.log("Directory sharing controls tests passed.");
