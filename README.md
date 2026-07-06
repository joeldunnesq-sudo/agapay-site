# agapay-site
AGAPAY website files.

## Quality checks

- **Local checks** (syntax, route-map integrity, platform/Learn assertions, hardening tests):
  `npm run check`
- **Route-map integrity only** (fails if a Worker route points at a file
  that doesn't exist under `public/` — see `scripts/route-map-integrity.mjs`):
  `node scripts/route-map-integrity.mjs`
- **Soft-launch readiness checks** (worker syntax, static branding/route
  assertions, and optionally a handful of live checks against a real
  deployment): `npm run prelaunch`
  - Add `AGAPAY_BASE_URL` to also exercise `/`, `/give`, `/marketplace`,
    `/directory`, `/vision`, `/onboarding`, `/register`, and
    `/api/security/config` against a live deployment:
    - bash: `AGAPAY_BASE_URL=https://agapay.app npm run prelaunch`
    - PowerShell: `$env:AGAPAY_BASE_URL="https://agapay.app"; npm run prelaunch`
- **Production smoke checks** (comprehensive — covers Odyssey dashboard/
  login/activate, My AGAPAY tabs, admin/parish/donor auth surfaces,
  `/api/health`, and more; see `scripts/smoke-live.mjs` for the full list):
  `node scripts/smoke-live.mjs https://agapay.app`
  - Defaults to `https://agapay.app` if no URL is given as the first argument.

See `docs/SOFT_LAUNCH_READINESS.md` for the full soft-launch hardening
tracker and `docs/launch-incident-runbook.md` for what to check first
during an incident.
