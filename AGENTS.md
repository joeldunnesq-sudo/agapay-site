# AgaPay Development Guide

AgaPay is an Orthodox Christian giving/donation platform built as a Cloudflare Worker with a Node.js local dev server.

## Cursor Cloud specific instructions

### Running the dev server

```bash
node server.mjs          # serves at http://localhost:3000
```

The dev server (`server.mjs`) serves static files from `public/` and dynamically imports API route handlers from `api/`. No npm dependencies are required.

### Key dev commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local dev server (port 3000) |
| `npm run check` | Syntax check `src/worker.js` + platform assertions |
| `node scripts/smoke-api.mjs` | Smoke tests for API endpoints (parishes, checkout) |

### Architecture notes

- **Production**: Cloudflare Worker (`src/worker.js`) with KV storage, Stripe, and Resend integrations.
- **Local dev**: Node.js static server (`server.mjs`) + API shims in `api/` that use filesystem-backed data (`data/parishes.json`, `data/registrations/`).
- The `lib/parishes.js` module provides `listParishes()` and `findParish(id)` for the local API routes. It reads from `data/parishes.json`.
- Without `STRIPE_SECRET_KEY`, the checkout endpoint returns demo responses (mode: "demo").
- Without `RESEND_API_KEY`, email sending is silently skipped.

### Gotchas

- `data/registrations` must be a directory, not a file. The registration handler uses `mkdir({ recursive: true })` which fails if a file exists at that path.
- The giving page for a specific parish is at `/give/form?parish={parishId}` on the dev server. The production Worker handles `/give/{parishId}` routing differently.
- The `src/worker.js` file uses Cloudflare Workers APIs (KV, Assets binding, cron triggers) that are not available in the Node.js dev server. Use `npx wrangler dev` for full Worker emulation if needed.
