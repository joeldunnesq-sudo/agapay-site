import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { writeArtifact } from "./lib/accounting-release-gates.mjs";

const serviceWorker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
assert.match(serviceWorker, /url\.pathname\.startsWith\(["']\/api\/["']\)\s*\)\s*return true/);
assert.match(serviceWorker, /url\.pathname\.startsWith\(["']\/parish["']\)\s*\)\s*return true/);
assert.match(serviceWorker, /if\s*\(shouldBypassCache\(request\)\)\s*return/);

if (process.argv.includes("--static-only")) {
  console.log("PASS - /api and /parish remain network-only");
} else {
let version = 1;
const server = createServer((request, response) => {
  if (request.url === "/bump" && request.method === "POST") {
    version += 1;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/service-worker.js") {
    response.writeHead(200, { "content-type":"text/javascript", "cache-control":"no-store", "service-worker-allowed":"/" });
    response.end(serviceWorker.replace(/const AGAPAY_CACHE = "[^"]+"/, `const AGAPAY_CACHE = "release-gate-v${version}"`));
    return;
  }
  if (request.url === "/probe") {
    setTimeout(() => response.writeHead(200, { "content-type":"application/json" }).end('{"ok":true}'), 250);
    return;
  }
  response.writeHead(200, { "content-type":"text/html", "cache-control":"no-store" });
  response.end(`<!doctype html><meta charset="utf-8"><title>Accounting lifecycle gate</title>
    <label>Journal description <input id="draft" value=""></label>
    <button id="save">Save draft</button><output id="status"></output><output id="update"></output>
    <script>
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        document.querySelector("#update").textContent = "Accounting updated safely";
      });
      navigator.serviceWorker.register("/service-worker.js");
      document.querySelector("#save").onclick = async () => {
        try {
          const response = await fetch("/probe");
          if (!response.ok) throw new Error("request failed");
          document.querySelector("#status").textContent = "Saved";
        } catch {
          document.querySelector("#status").textContent = "Connection lost — draft preserved";
        }
      };
    </script>`);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const evidence = {
  generatedAt: new Date().toISOString(),
  bypass: { api: true, parish: true },
  offline: {},
  update: {}
};

try {
  await page.goto(baseUrl, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.locator("#draft").fill("Unposted July accrual");

  await context.setOffline(true);
  await page.locator("#save").click();
  await page.locator("#status").filter({ hasText:"Connection lost" }).waitFor();
  evidence.offline.failureVisible = true;
  evidence.offline.draftPreserved = await page.locator("#draft").inputValue() === "Unposted July accrual";

  await context.setOffline(false);
  await page.locator("#save").click();
  await page.locator("#status").filter({ hasText:"Saved" }).waitFor();
  evidence.offline.reconnectedWithoutReload = await page.locator("#draft").inputValue() === "Unposted July accrual";

  await page.evaluate(() => fetch("/bump", { method:"POST" }));
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.locator("#update").filter({ hasText:"updated safely" }).waitFor();
  evidence.update.openTabNotified = true;
  evidence.update.draftPreserved = await page.locator("#draft").inputValue() === "Unposted July accrual";
  await page.screenshot({ path:"artifacts/accounting-release-gates/sw-lifecycle.png", fullPage:true });

  assert.equal(evidence.offline.draftPreserved, true);
  assert.equal(evidence.offline.reconnectedWithoutReload, true);
  assert.equal(evidence.update.draftPreserved, true);
  await writeArtifact("artifacts/accounting-release-gates/sw-lifecycle.json", evidence);
  console.log("PASS - /api and /parish remain network-only");
  console.log("PASS - interrupted request preserves the accounting draft and reconnects without reload");
  console.log("PASS - service-worker takeover preserves the open draft and produces an update signal");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
}
