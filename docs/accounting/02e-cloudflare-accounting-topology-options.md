# Cloudflare Accounting Topology Options

Supporting document to `docs/accounting/02-phase-0.75-foundational-readiness.md` (Workstream 4). All capability claims below were verified against official Cloudflare documentation on **2026-07-15** (the pages themselves show a "Last updated" date of **Apr 21–23, 2026**, which is within this session's ability to fetch live). URLs are cited per claim. This supersedes and corrects the equivalent section of the Phase 0 audit, which reasoned about static-binding scaling from general platform knowledge rather than from a live documentation check.

## Verified current Cloudflare capabilities

Source: `https://developers.cloudflare.com/d1/platform/limits/` (last updated Apr 21, 2026).

- **Databases per account: 50,000** on Workers Paid (1 on Free), with further increase available by request on Paid/Enterprise plans ("support for millions to tens-of-millions of databases... per account").
- **Maximum bindings per Workers script: approximately 5,000** — the docs explicitly state "you can bind up to ~5,000 D1 databases to a single Worker script," with each binding costing roughly 150 bytes of the Worker's 1 MB script-metadata budget.
- **Maximum database size: 10 GB** per D1 database (Workers Paid) — hard ceiling, not increasable.
- **Each D1 database is single-threaded** (backed by one Durable Object) and processes queries one at a time; throughput is bounded by query duration, not by binding count.
- **A Worker can open up to six simultaneous connections to D1 per invocation.**
- **D1 supports Time Travel** (point-in-time recovery), 30 days on Workers Paid.

Source: `https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/` (last updated Apr 23, 2026).

- Service Bindings let one Worker call another **without a publicly accessible URL**, via RPC (`await env.BINDING.method(...)`) or HTTP (`env.BINDING.fetch(request)`).
- **Zero added latency** — both Workers run on the same thread of the same Cloudflare server by default (Smart Placement can further optimize).
- Each Worker using a Service Binding **is deployed separately**; the target Worker must exist before the calling Worker's binding will deploy successfully.
- **Local development is supported**: run `wrangler dev` in each Worker's directory separately, or use `wrangler dev -c wrangler.json -c ../other-worker/wrangler.json` to run multiple Workers under one command (explicitly documented as **experimental** as of this check).

Source: `https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/` (last updated Apr 21, 2026).

- Workers for Platforms is designed to **"run untrusted code written by your customers, or by AI, in a secure hosted sandbox"** — each tenant gets their own deployed Worker script, dispatched dynamically via a dispatch namespace.
- It supports giving each tenant Worker its own bindings (KV, D1, R2, etc.) through the platform's dispatch mechanism, and offers per-tenant CPU/subrequest limits, cross-tenant observability, and tagging.
- **This is architecturally a mismatch for AGAPAY's actual need.** AGAPAY parishes do not write or deploy their own code — every parish runs the exact same AGAPAY-authored accounting logic. Workers for Platforms solves "let untrusted third parties run their own code safely," not "give the same trusted codebase per-tenant data isolation." Using it here would mean deploying (or dynamically dispatching) a copy of AGAPAY's own accounting Worker per parish — technically possible, but adopting a whole additional product surface (dispatch namespaces, dynamic dispatch Workers, per-tenant Worker script management) to solve a problem that static bindings already solve at the confirmed scale (below).
- I did not verify, and could not verify from documentation alone, whether AGAPAY's specific Cloudflare account has Workers for Platforms enabled or what its current pricing/plan requirements are for this account — that requires dashboard/account-level confirmation, not documentation.

## Corrected scaling conclusion

The Phase 0 audit assumed static D1 bindings would become impractical somewhere in the "low tens" of parishes and recommended treating that as the trigger for evaluating Workers for Platforms. **That assumption is significantly too conservative, per the confirmed limits above.** A single Worker script can statically bind roughly **5,000** D1 databases, and an account can hold **50,000** D1 databases. AGAPAY's real practical ceiling under a static-binding architecture is therefore in the **low thousands of actively provisioned parish accounting databases per Worker**, not dozens — several orders of magnitude beyond what Phase 0 assumed and almost certainly beyond what AGAPAY needs to plan for in the near or medium term.

This does not mean static bindings scale *forever* — `wrangler.toml` (or `wrangler.jsonc`) becomes an increasingly large, mechanically-generated file as parish count grows, every parish addition still requires a deploy (see below), and the ~5,000-binding ceiling is real. It means the *urgency* of evaluating Workers for Platforms is much lower than Phase 0 implied, and the practical trigger point should be reset accordingly (see Recommendation, below).

## Architecture comparison

| Option | Security boundary | Parish isolation | Provisioning | Redeploy to add a parish? | Local dev | Staging | Migration fan-out | Operational complexity | Latency | Cloudflare pricing | API-token exposure | Backup/restore | Path to hundreds–thousands of parishes | Compatible with current repo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A — Accounting module inside the existing Worker, static D1 bindings** | Weak — any bug anywhere in the existing 3,325-line `src/worker.js` or its handler modules runs in the same execution context as code with access to every parish's accounting binding | Application-layer only (no execution-boundary isolation between accounting and non-accounting code) | Add a `[[d1_databases]]` block, redeploy | Yes | Standard `wrangler dev` (though `server.mjs`, the actual local-dev harness in use, does not model bindings at all today — see Workstream 8) | Standard Wrangler environments (none currently configured — see Workstream 7) | Manual/scripted `wrangler d1 migrations apply` per database | Low to start, grows with binding count in one already-large config | None (same Worker, direct binding) | No additional Worker = no additional Worker-invocation cost | None required | Extends existing `AGAPAY_DB` backup pattern per-database | Up to ~5,000 bindings on this one Worker, shared with all of AGAPAY's non-accounting bindings | Yes — least new infrastructure, but weakest isolation |
| **B — Dedicated Accounting Gateway Worker behind a Service Binding, static D1 bindings** | **Strong** — a bug in Learn, commerce, or any non-accounting code physically cannot reach an accounting D1 binding it was never given, because those bindings only exist in a separate Worker's `wrangler.toml` | Application-layer plus a real process/deployment boundary | Add a `[[d1_databases]]` block to the *gateway's* config, redeploy the gateway only | Yes (gateway only — main Worker unaffected) | Confirmed supported: run `wrangler dev` for both Workers, or the experimental multi-config `-c` flag | Each environment gets its own gateway deployment | Manual/scripted fan-out against the gateway's bound databases | Medium — one more deployable to operate, but isolated blast radius | **Confirmed zero added latency** (same-thread by default) | One additional Worker, no additional per-request cost tier described in the docs beyond normal Workers pricing | None required (no Cloudflare API token used for D1 access — bindings only) | Same as Option A, isolated to the gateway's own deploy pipeline | Up to ~5,000 bindings **dedicated to accounting only** (not shared with the rest of AGAPAY's binding budget) | Requires creating one new Worker — moderate new infrastructure, strongest isolation of the options that don't require a new Cloudflare product |
| **C — Cloudflare REST API / HTTP-based D1 access from a Worker** | Weaker — requires a Cloudflare API token live inside a Worker's runtime, which is a broader-blast-radius secret than a binding (a leaked token could reach the account's D1 management API, not just query one database) | Application-layer, plus dependency on correct token scoping (not verified in this pass — Cloudflare API token permission granularity for D1-only access was not independently confirmed against current documentation) | Provision via Cloudflare API calls, no Worker redeploy needed to add a parish | **No** | Straightforward to fake/mock (just HTTP) | Straightforward | Can be scripted centrally without per-database Wrangler binding config | Low to add a database; higher to secure and monitor correctly (token rotation, HTTP error handling, rate limits) | Real, nonzero per-query latency (external API call vs. direct binding) — not appropriate for the primary posting-engine query path | Standard Workers subrequest/API pricing, plus Cloudflare API rate limits to manage | **Real** — a Cloudflare API token with D1-management scope is a genuinely more sensitive secret than a binding | Not evaluated in depth — would need the same D1 database Time Travel/backup mechanics underneath regardless of access method | Best raw scalability of the binding-based options since it sidesteps the ~5,000-per-Worker binding ceiling entirely, at the cost of the latency/security tradeoffs above | Compatible, but not recommended for the ledger's primary read/write path — plausible for a background/admin job (e.g., an out-of-band nightly export) where latency is tolerable |
| **D — Workers for Platforms / dispatch namespaces** | Strong, by product design — but designed for a different problem (untrusted third-party code), not "same trusted code, many tenants" | Strong (each tenant's dispatched Worker is its own isolate) | Requires adopting the dispatch-namespace product: a dynamic dispatch Worker, per-tenant "user Workers," and the associated deployment/management tooling | **No** — this is the option specifically designed to avoid a redeploy per tenant | Not verified in this pass — Workers for Platforms local-development support was listed in the documentation's navigation but not read in depth here; flagged as needing a dedicated follow-up read before this option is seriously considered | Would need its own design | Would need its own orchestration design — no evidence this is automatic | **High** — an entirely additional Cloudflare product surface, additional account configuration, additional operational model to learn and maintain, for a problem AGAPAY does not currently have (static bindings already reach thousands of parishes) | Not evaluated — dispatch-based routing has its own latency characteristics not directly compared here | Workers for Platforms has its own pricing model (not detailed here — would need confirmation against current Cloudflare pricing pages before adoption) | None required for D1 access specifically, though the platform introduces its own API surface | Not evaluated in this pass | The **eventual** answer if AGAPAY ever needs materially more than ~5,000 accounting parishes on one Worker, or wants stronger per-tenant execution isolation than a shared gateway Worker provides | Would require materially new infrastructure and operational investment; **not justified given the confirmed static-binding ceiling** |
| **E — Any other current Cloudflare pattern genuinely fitting this use case** | — | — | — | — | — | — | — | — | — | — | — | — | — | This pass did not identify a materially different, better-fitting current Cloudflare primitive beyond A–D. D1 read replication was noted in passing in the limits documentation but concerns read scaling for a single database, not per-tenant isolation, and was not evaluated further here. |

## Recommended pilot architecture

**Option B — dedicated Accounting Gateway Worker behind a Service Binding, static D1 bindings**, unchanged from Phase 0's recommendation, now with a materially stronger factual basis: this is not just "the best available option under an assumed tight scaling ceiling," it is confirmed to comfortably support thousands of parishes on its own before any more complex architecture is needed.

## Recommended general-release architecture

**Also Option B**, continued — the earlier assumption that general release would require evaluating Option D is not supported by the confirmed limits. General release should stay on Option B until AGAPAY's actual provisioned-parish count approaches a real, confirmed constraint (below), not a previously-assumed one.

## Explicit scaling trigger for reevaluation (revised)

Reevaluate whether Option B remains appropriate when either:
- **Active accounting-parish count approaches roughly 1,000** (a conservative buffer below the ~5,000 static-binding ceiling on the gateway Worker, leaving headroom for non-accounting bindings the gateway may accumulate and for safety margin against the ~150-byte-per-binding script-metadata budget), or
- **`wrangler.toml`/`wrangler.jsonc` for the gateway Worker becomes operationally unwieldy to review, diff, or manage as a mechanically-generated file** — a process/tooling signal independent of the raw numeric ceiling.

At that point, Option D (Workers for Platforms / dispatch namespaces) is the documented, product-supported path Cloudflare provides for per-tenant isolation without a redeploy-per-tenant requirement — but adopting it earlier than necessary would add real operational complexity (a new deployment model, new tooling, new local-dev story) for a scaling problem AGAPAY does not yet have.

## Migration path from pilot to scale architecture (if/when triggered)

Not designed in detail here (out of scope for Phase 0.75), but the shape of it: the central `accounting_databases` registry (Workstream 5) already needs a `binding_name`/routing-identifier field regardless of which physical access pattern is behind it — if that registry is designed cleanly from the start, migrating from "the gateway looks up a static binding name" to "the gateway dispatches to a dynamically-routed tenant Worker" is a change to the gateway's internal resolution logic, not a change to how the rest of AGAPAY calls the gateway. This is a reason to get the registry's abstraction boundary right in Phase 1, even though the higher-scale architecture itself is not being built now.

## Required changes to `wrangler.toml` (pilot)

- No changes to the **existing** `wrangler.toml` (main AGAPAY Worker) beyond, potentially, adding the `services` binding so the main Worker can call the new gateway.
- A **new** `wrangler.toml` for the Accounting Gateway Worker, containing: `name`, `main`, one `[[d1_databases]]` block per provisioned parish (added incrementally as parishes are onboarded), and no public routes (the gateway should not be reachable except via the Service Binding — confirmed supported per the Service Bindings documentation's "isolate services from the public internet" use case).

## Required new Worker/service structure

- New directory/deployable for the Accounting Gateway Worker's source, separate from `src/worker.js`.
- The gateway exposes RPC methods (via `WorkerEntrypoint`, confirmed current pattern) rather than a `fetch()`-only interface, so the main Worker calls typed methods rather than constructing internal HTTP requests.

## Required secrets and bindings

- No new secret type is required for Option B specifically (no Cloudflare API token needed, unlike Option C) — only the D1 bindings themselves and the Service Binding declaration.

## Local-development strategy

- Confirmed supported by Cloudflare via running two `wrangler dev` sessions, or the experimental multi-config `-c` flag.
- **This does not, by itself, solve AGAPAY's actual local-dev gap** — `server.mjs`, the harness AGAPAY's `npm run dev`/`npm run start` scripts actually invoke, does not use `wrangler dev` at all and does not model any bindings. Adopting Option B does not require abandoning `server.mjs` for non-accounting local development, but accounting-specific local development will need its own `wrangler dev`-based path, addressed in Workstream 8, not solved by this workstream alone.

## Acceptance criteria (for this workstream's findings, not for Option B's implementation)

- [x] Current Cloudflare D1 binding/database limits confirmed against live, dated documentation.
- [x] Service Binding latency, local-dev, and deployment-ordering behavior confirmed against live, dated documentation.
- [x] Workers for Platforms' actual design purpose confirmed against live, dated documentation, and found to be a mismatch for AGAPAY's problem shape.
- [x] Phase 0's "low tens of parishes" scaling assumption identified as materially incorrect and corrected.
- [ ] AGAPAY's actual Cloudflare account plan/entitlements (Workers Paid vs. Free, any existing Workers for Platforms enablement) — **not verifiable from this repository or from public documentation; requires Cloudflare dashboard or account-API confirmation before Phase 1 sign-off.**
