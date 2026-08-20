import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, iconSprite] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/styles/platform-preview.css", import.meta.url), "utf8"),
  readFile(new URL("../public/images/icons/agapay-icons.svg", import.meta.url), "utf8")
]);

assert.match(html, /One platform for all of <em>Orthodox parish life\.<\/em>/, "homepage should lead with the complete Orthodox parish platform position");
assert.match(html, /Many companies can process a donation\. <span>AGAPAY understands how an Orthodox parish actually operates\.<\/span>/, "homepage should distinguish AGAPAY from donation-only products");
assert.match(html, /above all these things put on agapē, which is the bond of perfectness/, "homepage should connect AGAPAY's purpose to Colossians 3:14 using the requested transliteration");
assert.match(html, /<figcaption>Colossians 3:14<\/figcaption>/, "homepage should visibly attribute the scripture quotation");
assert.match(html, /All canonical jurisdictions supported:<\/strong> OCA, Greek, ROCOR, Serbian, Antiochian, Romanian, and more/, "homepage should communicate broad canonical-jurisdiction support");
assert.match(iconSprite, /id="orthodox-cross"[\s\S]*?<path d="M8 17l8 4"\/>/, "canonical Orthodox cross should use three bars with a slanted footbar");
assert.ok(
  html.indexOf('class="op-jurisdictions"') > html.indexOf('class="op-hero"')
    && html.indexOf('class="op-jurisdictions"') < html.indexOf('class="op-statement op-verse-band"'),
  "canonical-jurisdiction trust bar should sit directly between the hero and scripture"
);
assert.match(html, /parish-bookstore\.jpg\?v=df993248c4c8/, "homepage should cache-bust the latest Bookstore screenshot");
assert.match(html, /sacraments-and-services\.jpg\?v=4ec640ba3917/, "homepage should cache-bust the latest Sacraments & Services screenshot");
assert.ok(
  html.indexOf('id="pillars"') < html.indexOf('class="op-statement op-positioning"')
    && html.indexOf('class="op-statement op-positioning"') < html.indexOf('id="connected-system"'),
  "Orthodox-first positioning should sit between The Platform and the connected-system section"
);
assert.match(html, /One parish\. One connected system\./, "homepage should explain that every parish capability shares one system");
assert.match(html, /One Church deserves[\s\S]*one unified place for parish life\./, "connected-system copy should make the platform benefit clear");
assert.match(html, /Your parish,[\s\S]*connected\./, "connected-system section should express its shared foundation in parish-centered language");
assert.match(html, /Give · Serve · Love/, "connected-system center should express AGAPAY's parish-life actions");
for (const icon of ["heart-give", "handshake", "orthodox-cross", "grid"]) {
  assert.match(html, new RegExp(`/images/icons/agapay-icons\\.svg(?:\\?[^"#]+)?#${icon}`), `connected-system section should use the canonical ${icon} icon`);
}
for (const capability of ["Koinonia", "Directory", "Sacraments", "Events", "Meals", "Bookstore", "sales tax", "Accounting"]) {
  assert.ok(html.includes(capability), `homepage should surface ${capability}`);
}
for (const room of ["give", "koinonia", "directory", "sacraments", "bookstore"]) {
  assert.match(html, new RegExp(`role="tab"[^>]+data-room="${room}"`), `homepage should expose an accessible ${room} room tab`);
  assert.match(html, new RegExp(`data-room="${room}"[^>]+src="/images/app/screenshots/`), `homepage should show a real ${room} app screen`);
}
const expectedRoomOrder = ["give", "bookstore", "koinonia", "directory", "sacraments"];
const roomTabPositions = expectedRoomOrder.map((room) => html.indexOf(`role="tab" aria-selected="${room === "give" ? "true" : "false"}" aria-controls="opPhoneScreen" data-room="${room}"`));
assert.ok(roomTabPositions.every((position, index) => position >= 0 && (index === 0 || position > roomTabPositions[index - 1])), "room tabs should mirror the app bottom navigation order");
assert.match(html, /Ministries can do real work\. The parish keeps the keys\./, "homepage should explain ministry delegation with parish oversight");
assert.match(html, /Every part of AGAPAY already knows what day it is in the Church\./, "homepage should explain shared liturgical awareness");
assert.match(html, /href="\/site-chrome\.css"/, "homepage should use the canonical shared navigation and footer styles");
assert.match(html, /src="\/site-chrome\.js"/, "homepage should use the canonical shared navigation and footer behavior");
assert.doesNotMatch(html, /data-no-site-chrome/, "homepage should allow the canonical site chrome to render");
assert.match(html, /rel="canonical" href="https:\/\/agapay\.app\/"/, "platform homepage should publish the root canonical URL");
assert.match(html, /href="\/give\/request-demo"/, "homepage should route parish demo requests to the existing form");
assert.match(html, /href="\/register"/, "homepage should preserve the free-start route");
assert.match(css, /@media \(max-width: 980px\)/, "preview should include a tablet layout");
assert.match(css, /@media \(max-width: 620px\)/, "preview should include a narrow-phone layout");
assert.match(css, /\.op-hero::after[\s\S]*?background: url\("\/mark\.png"\)[\s\S]*?opacity: \.07/, "hero should carry a restrained oversized AGAPAY mark");
assert.match(css, /\.op-oversight-step-mark svg[\s\S]*?left: 50%; top: 50%[\s\S]*?translate\(-50%, -50%\)/, "workflow checkmarks should be centered inside their circles");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "preview should respect reduced-motion preferences");

console.log("PASS - product-first homepage presents the real app, shared liturgical context, ministry oversight, commerce, and accounting as one parish platform");
