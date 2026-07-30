# Root `api/` and `lib/` decision record

## Owner decision

On 2026-07-29, the repository owner approved Option A after a read-only review confirmed:

- `agapay.app` is attached directly to the `agapay-site` Cloudflare Worker;
- Cloudflare DNS has no `api`, `www`, Vercel, Netlify, or other external web-origin record;
- GitHub reports no external deployments or repository webhooks; and
- the current commit checks come only from GitHub Actions and Cloudflare.

The root `api/` and `lib/` implementation is therefore confirmed unused. It remains unchanged in this hygiene PR; removal belongs in the documented follow-up PR so that deletion stays independently reviewable.

The original decision constraint was: do not remove the root `api/` or root `lib/` directories until the repository owner confirms whether an external serverless deployment still routes production or preview traffic to them.

The repository contains no deployment configuration that activates these files, but a Vercel-style deployment can be configured entirely outside the repository. That external fact cannot be proven from source control alone.

## What the directories do

The root `api/` directory is a small Node-style serverless implementation that overlaps routes now handled by the Cloudflare Worker:

- `api/parishes.js` lists fallback parishes and verified registrations loaded from local JSON files.
- `api/create-checkout-session.js` creates Stripe Checkout sessions directly through Node's `https` module, or returns a demo response when `STRIPE_SECRET_KEY` is absent.
- `api/registrations.js` validates a registration and writes it to `data/registrations/*.json`.
- `api/donor/dashboard.js` exposes an in-memory preview donor dashboard.

The root `lib/http.js` and `lib/parishes.js` modules support only those handlers. They use Node request/response objects, `process.env`, and local filesystem storage; they are separate from the Cloudflare Worker implementation in `src/worker.js`, `src/handlers/`, and `src/lib/`.

The active Worker defines overlapping routes for `/api/parishes`, `/api/registrations`, `/api/donor/dashboard`, and `/api/create-checkout-session`. The local `server.mjs` implements its own preview API handling and does not import the root handlers.

## In-repository usage

- `scripts/smoke-api.mjs` imports `api/parishes.js` and `api/create-checkout-session.js`.
- That smoke script is not invoked by `package.json`, `npm run check`, or any workflow under `.github/workflows/`.
- `docs/accounting/00-phase-0-architecture-audit.md` mentions the smoke script as historical inventory.
- No `vercel.json`, workflow, Wrangler configuration, package script, application import, or current documentation identifies a separate deployment target for root `api/`.
- Current architecture reports identify the Cloudflare Worker routes as the active implementations.

Within this repository, the root implementation is therefore unexercised by normal development, CI, and deployment.

## Options requiring owner confirmation

### Option A — confirmed unused

If no Vercel project or other external serverless target points at this repository's root `api/` directory, remove `api/`, its private root `lib/` dependencies, and `scripts/smoke-api.mjs` in a follow-up PR. Also remove or update historical documentation only where it inaccurately describes current behavior; preserve true audit history.

### Option B — still serving traffic

If an external target still uses these handlers, keep them and document:

- the provider, project, and environments that deploy them;
- the public hostnames and routes they serve;
- why they remain separate from the Cloudflare Worker;
- who owns their deployment and monitoring;
- whether local-file registration storage and the preview donor response are intentional for that target.

Then wire `scripts/smoke-api.mjs` into an appropriate CI command so the live code is not untested.

## Recommendation

Option A is confirmed. Remove root `api/`, its private root `lib/` dependencies, and `scripts/smoke-api.mjs` in a separate follow-up PR, with the normal full regression suite and a final reference search.
