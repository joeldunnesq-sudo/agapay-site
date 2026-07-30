import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const ACCOUNTING_HANDLER_FILES = Object.freeze([
  "accounting-ledger.js",
  "accounting-setup-reports.js",
  "accounting-payables-budgets.js",
  "accounting-reconciliation-commerce.js",
  "accounting-close.js",
  "accounting-adjustments.js",
  "accounting-governance.js",
  "accounting-attachments.js",
  "accounting-recurring.js"
]);

export const ACCOUNTING_READ_SMOKE_PATHS = Object.freeze([
  ["ledger", "/ledger"],
  ["reports", "/reports/financial-position"],
  ["payables", "/payables/overview"],
  ["budgets", "/budgets"],
  ["reconciliation", "/bank/accounts"],
  ["close", "/close/workspace"],
  ["governance", "/governance/health"],
  ["attachments", "/attachments?entityType=bill&entityId=release-gate-probe"]
]);

export function baseUrlFrom(argv = process.argv, fallback = "https://agapay.app") {
  const positional = argv.find((value, index) => index > 1 && !value.startsWith("--"));
  return String(positional || process.env.ACCOUNTING_GATE_BASE_URL || fallback).replace(/\/+$/, "");
}

export function requiredEnvironment(names, env = process.env) {
  const missing = names.filter((name) => !String(env[name] || "").trim());
  if (missing.length) throw new Error(`Missing required release-gate environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((name) => [name, String(env[name]).trim()]));
}

export async function writeArtifact(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

function exactRoutes(source, handler) {
  const routes = [];
  const patterns = [
    /request\.method\s*===\s*["']([A-Z]+)["']\s*&&\s*path\s*===\s*["']([^"']+)["']/g,
    /path\s*===\s*["']([^"']+)["']\s*&&\s*request\.method\s*===\s*["']([A-Z]+)["']/g
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of source.matchAll(pattern)) {
      const method = index === 0 ? match[1] : match[2];
      const path = index === 0 ? match[2] : match[1];
      routes.push({ handler, method, path, source: "exact" });
    }
  }
  return routes;
}

function representativeRegexPath(pattern) {
  let value = pattern
    .replaceAll("\\/", "/")
    .replace(/\(\[\^\/\]\+\)/g, "release-gate-id")
    .replace(/\(\?:\/release-gate-id\)\?/g, "/release-gate-id")
    .replace(/\(\?:\/\(([^)]+)\)\)\?/g, (_, alternatives) => `/${alternatives.split("|")[0]}`)
    .replace(/\(\?:\(([^)]+)\)\)\?/g, (_, alternatives) => alternatives.split("|")[0])
    .replace(/\(([^()|]+)\|[^)]+\)/g, "$1")
    .replace(/\(\?:([^()|]+)\|[^)]+\)/g, "$1")
    .replace(/[?*]/g, "")
    .replaceAll("\\", "");
  if (value.includes("(")) value = value.slice(0, value.indexOf("("));
  if (!value.startsWith("/")) value = `/${value}`;
  return value;
}

function regexRoutes(source, handler) {
  const routes = [];
  for (const match of source.matchAll(/path\.match\(\/\^(.+?)\$\/\)/gs)) {
    const pattern = match[1];
    routes.push({ handler, method: "GET", path: representativeRegexPath(pattern), pattern, source: "regex" });
  }
  return routes;
}

export async function enumerateAccountingRoutes(root = process.cwd()) {
  const routes = [];
  const coverage = [];
  for (const handler of ACCOUNTING_HANDLER_FILES) {
    const source = await readFile(resolve(root, "src", "handlers", handler), "utf8");
    const found = [...exactRoutes(source, handler), ...regexRoutes(source, handler)];
    coverage.push({ handler, routes: found.length });
    routes.push(...found);
  }
  const unique = new Map();
  for (const route of routes) unique.set(`${route.handler}:${route.method}:${route.path}:${route.pattern || ""}`, route);
  return { routes: [...unique.values()], coverage };
}

export async function loginPlatformUser(page, { baseUrl, email, password }) {
  await page.goto(`${baseUrl}/myagapay/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#donorEmail").fill(email);
  await page.locator("#donorPassword").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("agapayDonorToken")));
  const token = await page.evaluate(() => localStorage.getItem("agapayDonorToken"));
  return { Authorization: `Bearer ${token}` };
}

export async function loginParishAccounting(page, {
  baseUrl, parishId, parishPassword, profileId = "", profileName = "", pin
}) {
  await page.goto(`${baseUrl}/give/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#parishId").fill(parishId);
  await page.locator("#parishToken").fill(parishPassword);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL((url) => url.pathname === "/parish/dashboard");
  await page.locator("#nav-accounting").click();
  const accessForm = page.locator("#accountingPane form");
  await accessForm.waitFor();
  const profile = accessForm.locator('select[name="profileId"]');
  if (profileId) await profile.selectOption(profileId);
  else if (profileName) {
    const option = profile.locator("option").filter({ hasText:new RegExp(profileName, "i") }).first();
    await profile.selectOption(await option.getAttribute("value"));
  }
  await accessForm.locator('input[name="pin"]').fill(pin);
  await accessForm.getByRole("button", { name: /open accounting/i }).click();
  await page.waitForFunction((id) => {
    const raw = sessionStorage.getItem(`agapay.accountingStaff.${id}`);
    return Boolean(raw && JSON.parse(raw)?.token);
  }, parishId);
  return page.evaluate((id) => {
    const parishToken = document.getElementById("parishToken")?.value || "";
    const staff = JSON.parse(sessionStorage.getItem(`agapay.accountingStaff.${id}`) || "{}");
    return {
      Authorization: `Bearer ${parishToken}`,
      "X-AGAPAY-Accounting-Profile": staff.profile.id,
      "X-AGAPAY-Accounting-Token": staff.token
    };
  }, parishId);
}

export async function runCrossTenantMatrix({
  baseUrl, routes, principals, artifactPath = "artifacts/accounting-release-gates/cross-tenant-matrix.json"
}) {
  const denied = new Set([401, 403, 404]);
  const matrix = [];
  for (const principal of principals) {
    for (const route of routes) {
      const target = `${baseUrl}/api/parish/dashboard/${encodeURIComponent(principal.oppositeParishId)}/accounting${route.path}`;
      let status = 0;
      let responseBytes = 0;
      let responseSha256 = "";
      let contentType = "";
      try {
        const response = await principal.context.request.fetch(target, {
          method: route.method,
          headers: { ...principal.headers, "content-type": "application/json" },
          data: route.method === "GET" ? undefined : {}
        });
        status = response.status();
        contentType = response.headers()["content-type"] || "";
        const body = new TextEncoder().encode(await response.text());
        responseBytes = body.byteLength;
        responseSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))]
          .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      } catch (error) {
        responseSha256 = `request-error:${error?.name || "Error"}`;
      }
      const passed = denied.has(status);
      matrix.push({
        principal: principal.name,
        authPath: principal.authPath,
        sourceParishId: principal.parishId,
        targetParishId: principal.oppositeParishId,
        handler: route.handler,
        method: route.method,
        route: route.pattern || route.path,
        requestPath: route.path,
        status,
        passed,
        contentType,
        responseBytes,
        responseSha256
      });
    }
  }
  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    routeCount: routes.length,
    attemptCount: matrix.length,
    passed: matrix.every((row) => row.passed),
    matrix
  };
  await writeArtifact(artifactPath, artifact);
  if (!artifact.passed) {
    const failures = matrix.filter((row) => !row.passed);
    throw new Error(`Cross-tenant isolation failed for ${failures.length} request(s).`);
  }
  return artifact;
}

export async function readAccountingSections({ context, baseUrl, parishId, headers }) {
  const results = [];
  for (const [section, suffix] of ACCOUNTING_READ_SMOKE_PATHS) {
    const url = `${baseUrl}/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting${suffix}`;
    const response = await context.request.get(url, { headers });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    const body = new TextEncoder().encode(text);
    results.push({
      section,
      path: suffix,
      status: response.status(),
      saneShape: response.status() === 200 && payload && typeof payload === "object" && !Array.isArray(payload),
      responseBytes:body.byteLength,
      responseSha256:[...new Uint8Array(await crypto.subtle.digest("SHA-256", body))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("")
    });
  }
  return results;
}
