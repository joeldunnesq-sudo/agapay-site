const baseUrl = (process.argv[2] || "https://agapay.app").replace(/\/+$/, "");

const checks = [
  { name: "home page", method: "GET", path: "/", ok: [200] },
  { name: "onboarding page", method: "GET", path: "/onboarding", ok: [200] },
  { name: "registration page", method: "GET", path: "/register.html", ok: [200] },
  { name: "learn overview page", method: "GET", path: "/learn", ok: [200] },
  { name: "learn pricing page", method: "GET", path: "/learn/pricing", ok: [200] },
  { name: "Give features page", method: "GET", path: "/give/features", ok: [200] },
  { name: "Give how it works page", method: "GET", path: "/give/how-it-works", ok: [200] },
  { name: "Give pricing page", method: "GET", path: "/give/pricing", ok: [200] },
  { name: "Give why page", method: "GET", path: "/give/why", ok: [200] },
  { name: "parish giving shell", method: "GET", path: "/give/smoke-test", ok: [200] },
  { name: "find church giving page", method: "GET", path: "/give/find-parish", ok: [200] },
  { name: "campaign share shell", method: "GET", path: "/give/smoke-test/smoke-test-campaign", ok: [200] },
  { name: "My AGAPAY login shell", method: "GET", path: "/myagapay/login", ok: [200] },
  { name: "My AGAPAY shell", method: "GET", path: "/myagapay", ok: [200] },
  { name: "My AGAPAY giving shell", method: "GET", path: "/myagapay/giving", ok: [200] },
  { name: "My AGAPAY give shell", method: "GET", path: "/myagapay/giving/give", ok: [200] },
  { name: "My AGAPAY Learn shell", method: "GET", path: "/myagapay/learn", ok: [200] },
  { name: "My AGAPAY Learn setup shell", method: "GET", path: "/myagapay/learn/setup", ok: [200] },
  { name: "legacy donor redirect", method: "GET", path: "/donor", ok: [200, 301, 302, 308] },
  { name: "legacy Learn dashboard redirect", method: "GET", path: "/learn/dashboard", ok: [200, 301, 302, 308] },
  { name: "Give login shell", method: "GET", path: "/give/login", ok: [200] },
  { name: "legacy Giving redirect", method: "GET", path: "/giving/features", ok: [301, 302, 308], redirect: "manual" },
  { name: "legacy parish login redirect", method: "GET", path: "/parish/login", ok: [200, 301, 302, 308] },
  { name: "admin app shell", method: "GET", path: "/admin", ok: [200] },
  { name: "security config", method: "GET", path: "/api/security/config", ok: [200] },
  { name: "public parishes", method: "GET", path: "/api/parishes?limit=5", ok: [200] },
  { name: "public campaign missing", method: "GET", path: "/api/campaign?parish=smoke-test&slug=smoke-test", ok: [404] },
  { name: "platform summary", method: "GET", path: "/api/platform/summary", ok: [200] },
  { name: "subscription tiers", method: "GET", path: "/api/subscription-tiers", ok: [200] },
  { name: "learn setup api unauth", method: "GET", path: "/api/learn/setup", ok: [401] },
  { name: "donor dashboard unauth", method: "GET", path: "/api/donor/dashboard", ok: [401] },
  { name: "admin registrations unauth", method: "GET", path: "/api/admin/registrations?limit=5", ok: [401] },
  {
    name: "donor login invalid",
    method: "POST",
    path: "/api/donor/login",
    body: { email: "smoke-test@example.invalid", password: "not-the-password" },
    ok: [400, 401, 403, 429]
  },
  {
    name: "admin login invalid",
    method: "POST",
    path: "/api/admin/session",
    body: { password: "not-the-password" },
    ok: [401, 403, 429]
  },
  {
    name: "parish login invalid",
    method: "POST",
    path: "/api/parish/dashboard/smoke-test/session",
    body: { password: "not-the-password" },
    ok: [401, 404, 429]
  }
];

let failures = 0;

for (const check of checks) {
  const init = {
    method: check.method,
    headers: check.body ? { "content-type": "application/json" } : undefined,
    body: check.body ? JSON.stringify(check.body) : undefined,
    redirect: check.redirect || "follow"
  };
  try {
    const response = await fetch(`${baseUrl}${check.path}`, init);
    const text = await response.text();
    const passed = check.ok.includes(response.status);
    const marker = passed ? "PASS" : "FAIL";
    console.log(`${marker} ${response.status} ${check.name} ${check.path}`);
    if (!passed) {
      failures += 1;
      console.log(text.slice(0, 500));
    }
  } catch (error) {
    failures += 1;
    console.log(`FAIL ERR ${check.name} ${check.path}`);
    console.log(error?.stack || error);
  }
}

if (failures) {
  console.error(`Smoke failed: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("Smoke passed.");
