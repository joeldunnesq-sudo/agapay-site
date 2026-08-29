# Portability local runtime drill

Date: August 28, 2026. Result: **six local workerd checkpoints passed**.
This is not a remote Cloudflare restore qualification or deployment approval.

The complete `npm run check` suite and Wrangler deployment dry run also passed.
The full suite initially detected an outdated dashboard script cache-version
expectation, now updated to the portability release's existing version. Syntax
checks and `git diff --check` passed. The generated production bundle contains
neither the local drill capability flag nor the synthetic administrator adapter.

## Run

```sh
npm ci
npm run test:parish-portability-runtime
```

The drill also runs in `npm run check:release-gates` and the full `npm run check`.
Node 24 is used in CI. Miniflare and esbuild are pinned to the versions already
used by this repository's Wrangler dependency. The harness reads only the
production compatibility date from wrangler.toml, never resource identifiers.

The test entrypoint is `scripts/fixtures/portability-runtime-worker.js`. It is
not a deployment entrypoint, is never imported by the application, and must not
be deployed. It accepts only a per-run capability token on a loopback listener.
Bindings are ephemeral local D1/R2/KV resources; the Miniflare instance is disposed
in a finally block. Application egress is denied and telemetry is disabled.

## Verified checkpoints

1. Initialize real local D1 schemas/triggers, guarded file ownership, legacy KV
   registries, and strict backup sweep evidence.
2. Capture the pre-closure D1/R2/KV contents into separate local restore bindings.
   Keep the original independent closure ledger outside the snapshot.
3. Abort an ordinary export download and prove that rows remain and closure
   confirmation is rejected.
4. Download the closure ZIP, verify its SHA-256 and every manifest entry, check
   credential filtering and tenant scope, then confirm closure. D1, R2, and KV
   reject late writes even if the export UI flag is switched off.
5. Complete deletion. Verify eligible rows/files/KV keys and temporary exports
   are gone, another parish and shared identities remain, and financial evidence
   is readable in private retention storage with a minimal registration stub.
6. Prove the restored state cannot pass the runtime gate. Require quarantine,
   replay independent closure markers, reject replay-only/intermediate states,
   sanitize restored data, then pass the gate. Quarantine is still explicit and
   repeated sanitization is safe.

The runtime exposed a protected D1 metadata table missing from earlier mocks.
The catalogs now exclude the exact `_cf_METADATA` provider table, alongside the
previously recognized tables; arbitrary `_cf_*` application tables still fail.
Cloudflare documents that table in its
[workerd SQLite metadata implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/util/sqlite-metadata.h).

## Limits and next remote gate

- Fixtures cover the directory/registration/legal/portability schemas and a
  minimal financial-document foreign key. This is not every production table,
  full accounting books, every upload route, or representative production volume.
  Existing separate accounting tests exercise book freezes and immutable history.
- The test calls production service functions through a test-only adapter. It
  does not replace browser, fresh-MFA, cancellation, and full HTTP-route testing.
- Local R2/KV cannot establish provider lifecycle timing, cross-region KV
  convergence, public CDN/browser cache disposal, or D1 Time Travel expiry.
- Backup expiry evidence here comes from an empty synthetic backup bucket.
  Timestamp expiry and newest-copy gate behavior are separately regression-tested
  with controlled objects; actual remote retention must still be demonstrated.
- A read-only blank SQLite replay of sorted historical migrations stopped at
  `0003_stewardship.sql` because `household_pledges` did not yet exist. The drill
  uses the documented fixture subset. Do not rename/rewrite applied migrations
  or treat the static migration-integrity check as proof of a blank bootstrap.
  Review a complete schema baseline and actual applied migration history before
  initializing the dedicated remote staging environment.
- Shared accounting staging currently lacks the portability resources. It was
  not changed. The next remote drill needs isolated central/accounting databases,
  KV, owned file buckets, three private portability buckets, restricted access,
  and a ledger that remains independent of restore targets. Do not use live
  parish data, production credentials, public cache attestations, or the local
  synthetic evidence hash to bypass those prerequisites.

A read-only query of remote `agapay-staging` on August 28 found no migration
history entries for 0108, 0109, or 0110 and no portability control tables.
The table-count query returned 192 after excluding SQLite/Cloudflare internals
(this count includes the migration ledger). Every query reported zero rows written
and `changed_db=false`. No parish records were retrieved. This confirms that the
shared environment cannot run the new flow as currently provisioned.

All portability flags and the strict backup-expiry gate remain off in production.
This local fixture drill itself changes no remote resources. A subsequent,
separate full-schema staging exercise created isolated remote resources and its
private hosted closure/restore drill passes. Natural lifecycle timing and the
remaining production reconciliation gates are still pending. See
[Staging release review](staging-release-review.md) for current scope and evidence.
