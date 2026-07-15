# AGAPAY Accounting Package 0.75G -- Local Development Guide

## 1. Fresh Checkout

From a clean checkout:

```text
npm ci
```

The committed lockfile is required by the CI gate.

## 2. Local Configuration

Copy `.dev.vars.example` to `.dev.vars` and fill only local/test values. Never put production secrets in `.dev.vars`.

Minimum local accounting marker:

```text
AGAPAY_ENVIRONMENT=local
AGAPAY_APP_URL=http://localhost:8787
AGAPAY_PUBLIC_URL=http://localhost:8787
```

`.dev.vars` is ignored by Git.

## 3. Running Locally

Existing non-accounting local development may continue to use:

```text
npm run dev
```

Future accounting work should prefer Wrangler-based local development once multiple D1 bindings or Service Bindings are added, because `server.mjs` does not model Cloudflare bindings.

## 4. Environment Diagnostics

Print a safe environment summary:

```text
npm run accounting:env -- --env=local
npm run accounting:env -- --env=staging
```

This prints names and configuration shape. It does not read secrets or contact Cloudflare.

## 5. Testing

Run the full gate:

```text
npm run check
```

The check includes:

- existing platform tests
- identity/membership tests
- accounting gateway tests
- accounting environment tests

## 6. Migration Planning

Prepare a reviewable command without executing it:

```text
npm run accounting:migration-plan -- --env=staging --database=agapay-staging --remote
```

Production requires explicit confirmation:

```text
npm run accounting:migration-plan -- --env=production --database=agapay-production --remote --confirm-production
```

The script prints the command. It does not run it.

## 7. Common Problems

Unknown environment:

Use one of `local`, `test`, `staging`, or `production`. Aliases such as `dev`, `preview`, and `prod` are accepted and normalized.

Missing central D1 binding:

Automated tests use in-memory D1-shaped fixtures. A real Worker environment must provide `AGAPAY_DB`.

Accidental production target:

Migration planning refuses production unless the caller passes `--confirm-production`. This is intentional.
