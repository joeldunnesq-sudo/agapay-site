import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../public/myagapay/directory.html", import.meta.url), "utf8");
const memberDirectory = readFileSync(new URL("../src/directory/member-directory.js", import.meta.url), "utf8");

const photoFunction = page.match(/function photoHtml\(item, className = "member-photo"\) \{[\s\S]*?\n    \}/)?.[0] || "";
assert.match(photoFunction, /item\?\.photo/, "photo rendering should use only the server-gated photo reference on the item");
assert.match(photoFunction, /<img class=[\s\S]*data-auth-src=[\s\S]*item\?\.photo\?\.alt[\s\S]*loading="lazy"/, "authorized photos should render as accessible lazy images");
assert.match(photoFunction, /<span class=[\s\S]*directoryInitials|<span class=[\s\S]*initials/, "items without a photo should retain the initials fallback");

assert.match(page, /\$\{photoHtml\(profile, "family-detail-avatar"\)\}/, "the household profile hero should render its authorized photo");
assert.doesNotMatch(page, /type === "household" \? "" : photoHtml\(profile\)/, "household profile photos must not be skipped");
assert.match(page, /img\.replaceWith\(fallback\)/, "failed image requests should replace the image with initials");

assert.match(memberDirectory, /householdPhotoChildAuthorizationSatisfied[\s\S]*directory_child_publication_requests[\s\S]*approved_photo = 1/, "household photo authorization must be checked against approved child-photo publication server-side");
assert.match(memberDirectory, /async function publishedPhoto[\s\S]*ownerType === "household"[\s\S]*return null/, "unauthorized household photo references must be omitted before payload assembly");
assert.match(memberDirectory, /streamMemberDirectoryMediaVariant[\s\S]*householdPhotoChildAuthorizationSatisfied[\s\S]*DirectoryServiceError/, "direct media delivery must repeat the child authorization gate");
assert.match(memberDirectory, /ownerType === "person" \? "avatar_medium" : "household_card"/, "member payloads should select the correct photo variant");

console.log("Directory photo display tests passed.");
