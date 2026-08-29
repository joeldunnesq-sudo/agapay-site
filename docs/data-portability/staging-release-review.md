# Portability staging release review

August 29, 2026. **Production release is not approved.** A private, route-less
staging test Worker was temporarily deployed for the hosted drill. The production
Worker now includes the verified public-media route, while portability, closure,
storage-guard, and strict-expiry switches remain off. The temporary Worker was removed after preserving the completed drill
record and version identifier; the isolated data resources remain for evidence and
the pending natural-expiry observation.

## Results

| Gate | Result |
| --- | --- |
| Full schema review | Passed against zero-row schema-only exports; no parish rows copied. |
| Isolated remote resources | Created four D1 databases, two KV namespaces, and nine private R2 buckets. |
| Ledger protection | Rules read back; actual remote overwrite and delete attempts rejected. |
| Controlled-clock backup sweep | Remote synthetic object deleted and absence verified with HEAD. Not natural expiry. |
| Backup restoration | Hashed synthetic central/accounting snapshots restored into separate remote D1 targets; files/KV isolated; ledger not restored. |
| Authentic central D1 restore | Passed against the newest paired private production SQL/checksum artifact. The checksum and migration history were verified before target creation; pending migrations and 441 barriers were applied to a fixed unbound scratch D1; all read-only validator checks passed. The scratch database and local backup copies were deleted after success. Production was not written. |
| Real provider multi-store restore | Passed under evidence hash `4d90e468ac6393d4c070bdcb9794bdd9a3625ccbe1c0fe957cffede74d7585fc`: live central and St. Fiacre accounting D1 exports, all 26 production file objects (24,828,438 bytes), and all 35 current KV keys were restored into fixed private scratch resources. Central validation, exact accounting schema/ledger fingerprints, file/KV body hashes, and source-stability readback passed. Scratch D1/KV/R2 resources and local SQL files were deleted with readback; production was read-only. |
| Full-schema local export/closure/restore | Passed, including other-parish preservation, retained financial file, book freeze, credential removal, and repeated sanitization. |
| Remote closure/restore suppression | Passed in a private hosted Worker: ZIP verification, consent, freeze, authorization, purge, old-restore denial, replay, sanitization, and repeated sanitization. The earlier operator-proxy run remains recorded as interrupted. |
| Hosted query budget | Passed: every phase stayed within the enforced 800-operation work budget; maximum hosted use was 697. |
| Regression suite/bundle | npm run check and Wrangler deploy --dry-run passed. They do not clear the failed release gates. |
| Natural lifecycle / D1 recovery expiry | Probe planted at 2026-08-28 23:55:46 UTC; the one-day threshold is 2026-08-29 23:55:46 UTC. Absence has not yet been observed or certified. |
| Production scoped readiness audit | Passed after controlled reconciliation: all 31 legacy accounting tables are empty, the book identity is independently evidenced, the backup bucket has a verified 365-day object-expiration rule, and all release flags remain false. This does not clear the remaining release gates. |
| Production ownership/schema | Passed: migrations 0108-0110, 441 generated barriers, 26 R2 ownership rows, 18 KV ownership rows, and three inventory reviews read back successfully; there are zero jobs/closures and all flags remain false. |
| Production private portability storage | Passed: three separate private R2 buckets were created and read back with r2.dev disabled and no custom domains. The temporary export prefix has a seven-day lifecycle; authority, closure, and completion prefixes have indefinite locks; authority.json matches the configured identifier. No Worker was deployed and all flags remain false. |
| Public media migration | Passed: registry-owned Worker delivery is deployed with no-store and range support. Three historical references were hash-guarded and rewritten, all objects were verified through the Worker, all three r2.dev origins read back disabled, and there are zero custom domains. The disabled-origin attestation is staged for deployment. |
| Browser/MFA/billing gate | Passed: the local real-client gate opened and completed MFA step-up, active billing blocked final-export creation, and an ordinary ZIP download made no closure-confirmation request. A duplicate-parish-row authentication mismatch found in the signed-in production panel was fixed and deployed. The post-deployment read-only production walkthrough accepted a fresh MFA-backed session, showed the intended release-disabled state with zero jobs and disabled actions, and logged no browser warnings or errors. No production export, billing change, or purge was attempted. |
| Recovery-copy inventory | Partially passed: 29 recent scheduled backup runs were successful, none of 297 current GitHub Actions artifacts was a database backup, and D1 Time Travel was available at 7/29 days but unavailable at 31 days. The separate real provider multi-store restore qualification passed; off-provider/manual copies remain unverified and natural lifecycle expiry is still pending. |
| Realistic volume | Passed locally and in a separate private hosted Worker. The reviewed full schemas exported 21,008 synthetic rows, including 4,000 offerings, 3,000 journal entries, and 6,000 journal lines, into an 11,350,769-byte hosted ZIP. Counts, hash, secret exclusion, and tenant scope passed. A 10,001-row boundary returned 413, left all source rows intact, and published no archive. The route-less Worker was removed; its private synthetic archive has one-day lifecycle expiry. |

## Schema corrections

The central baseline has 209 reviewed tables after applying 0108/0109/0110 in
memory and installing barriers. The accounting baseline has 110 reviewed tables,
including 31 non-accounting legacy remnants. Every source table was verified empty.
Normalized baselines contain DDL, not fabricated migration-history entries.

The catalog now includes historical `giving_funds` and
`parish_stewardship_settings`; legacy giving definitions are financial retention
records. `stewardship_generated_packets.storage_key` is recognized, but a populated
value blocks export until physical storage is reconciled. No packet is silently
omitted or assigned a guessed bucket.

The exact reviewed accounting legacy table/column set is accepted only while
empty and frozen with the books. Any row requires ownership/migration review.
A fixed-scope read-only production audit checked all 31 legacy accounting tables;
all were empty. It read aggregate counts and identity/schema metadata only, not
parish payload rows, and reported zero writes. Every export still checks every
actual table at execution time.

Ledger retries now compare existing locked authorization/completion records
without another PUT. Conflicts still fail closed. Regression tests cover these
retries, legacy accounting writes, and historical packet blocking.

## Resources and scope

Prefix: `agapay-portability-staging-20260828`. Accounting names:
`agapay-acct-staging-portability-20260828` and
`agapay-acct-staging-portability-restore-20260828`.

| Binding | D1 ID |
| --- | --- |
| AGAPAY_DB | d92aa9d5-f23b-4a26-bc93-96fc4a52f4d2 |
| RESTORE_AGAPAY_DB | f58c874b-5d98-4a7b-a5db-929ffa59ddb8 |
| DRILL_BOOKS | 0c3a42c2-eb2a-4f40-8462-2bdc61ff698c |
| RESTORE_DRILL_BOOKS | 464c420a-84d1-4036-be32-a0daedf98b36 |

All nine R2 buckets have r2.dev access disabled and no custom domains, verified
by readback. Ledger `authority.json`, `closures/`, and `completions/` have indefinite
prefix locks. Exports expire after seven days; synthetic backup prefix `trial/`
uses a one-day test lifecycle. Retained evidence has no blanket disposal rule.
Administrators can change lock rules; this is not irrevocable external custody.

The storage config has no application entrypoint, route, services, assets, or
cron; workers.dev and preview URLs are disabled. The temporary hosted harness also
had no route, workers.dev URL, assets, or cron and was callable only through an
operator service binding. It was deleted after the drill passed. Stripe/email
credentials were not supplied to the drill.

Only new staging stores received synthetic test payload data. Production was contacted
for schema-only exports, fixed metadata/reference reads, and the reviewed control
writes described above. One independently evidenced `parish_id` row and one 365-day
backup lifecycle rule were added; migrations 0108-0110, 441 barriers, 26 R2 owners,
18 KV owners, and three inventory reviews were then installed and read back. Three
private portability buckets and their reviewed safeguards were also provisioned;
their only object is the locked closure authority. No production application
deployment or release flag changed. Shared staging was left untouched.
D1 export can briefly block queries; avoid unnecessary repeat production exports.

The first remote attempt ran service code in an operator Node process through real
remote bindings and remains incomplete evidence. The successful rerun used separate
hosted Worker invocations for each bounded phase. That closure drill does not certify
browser/MFA/billing flows or all production upload routes. A later isolated volume
gate separately exercised 3,000 accounting journal entries, 6,000 journal lines,
and 12,003 central parish/control rows inside a hosted Worker. All data was synthetic;
this is not a claim about the size distribution of live parishes.

## Evidence and recovery

Evidence is in the ignored `artifacts/portability-staging/` directory:

- `resources.json` and `wrangler.json`: exact identities and safeguard readbacks.
- `schema-audit.json` and both `*-baseline.sql` files: verified zero-row DDL.
- `local-drill-state.json`: completed full-schema local run.
- `remote-drill-state.json`: partial remote checkpoints, explicit incomplete state.
- `stopped-run-readback.json`: direct final status and remaining lease; zero rows written.
- `query-budget.json`: offline counts of actual service operations.
- `hosted-drill-state.json`: per-invocation result, operation count, and Worker version.
- `volume-gate.json`: local workerd profile, archive checksum/size, timing, and
  the successful fail-closed boundary assertions.
- `natural-expiry-state.json`: planted object hash, original upload time, threshold, and later observations.
- `production-readiness-audit.json`: read-only production flags, identity result,
  31 aggregate legacy counts, registry/barrier counts, and lifecycle readback.
- `production-storage-ownership.json` and
  `production-storage-registry-proposal.json`: metadata/reference inventory,
  conflict counts, and complete R2/KV proposal hashes (raw values are not stored).
- `production-storage-registry-apply.json`: verified post-transaction counts and
  full R2/KV readback hashes.
- `production-private-storage.json`: exact bucket names plus hashed public-access,
  custom-domain, lifecycle, lock, and authority readbacks. It records that no
  Worker was deployed and no feature flag was enabled.
- `production-public-media-rewrite.json`: exact hashed three-record proposal and
  post-write verification for one registration, one legacy KV record, and one
  teaching post; raw values are not persisted.
- `production-public-media-disable.json`: exact provider/Worker evidence hash and
  post-write readback for three disabled r2.dev origins and zero custom domains.
- `production-public-media-audit.json`: provider status hashes and metadata-only
  HEAD evidence; all three r2.dev origins are disabled and all three inventoried
  objects are reachable through the Worker with no-store.
- `production-recovery-inventory.json`: read-only scheduled-run and GitHub artifact
  counts, D1 Time Travel checks at 7/29/31 days, and the existing R2 lifecycle
  evidence reference. It records that no restore was performed and that manual or
  off-provider copies remain unverified.
- `production-quarantined-d1-restore.json`: newest private SQL/checksum metadata,
  source/migration/barrier evidence hashes, validator-output hash, and verified
  scratch/local cleanup. Raw backup bytes are not retained in the evidence.
- `production-accounting-identity.json`: Cloudflare/Git/book evidence hash and
  post-write identity readback.
- `production-backup-lifecycle.json`: metadata-only 59-object inventory, age
  bounds, zero-expired assertion, rule evidence hash, and provider readback hash.

The ignored `artifacts/portability-volume-hosted/` directory holds the separate
volume resource manifest, disabled-public-access and lifecycle readbacks, reviewed
configs, and `hosted-volume-state.json`. The temporary Worker version was
`6126a7ec-cf3a-4ab6-b7aa-63fa07ea1981` and was deleted after the successful run.

Baseline SHA-256 values:

```text
central:    71ca5b0ae88a36ecd5c1157b93fbf0c8a5dd1a0cc073c3d377a549b389f96cd6
accounting: b891b2e24dff8429f487cb3f7569875df44915f204479b7285362da977c25fab
```

Resource/schema evidence SHA-256:
`28c692e2aa693447178ad267b30f8f6fd82607f7a2dfec2bfb680af4c524e5ad`.
Remote job: `f5242846-8093-409d-b64d-c90d17a4f5f6`; post-stop status `ready`,
122,096 bytes, `confirmed_at = NULL`. Its lease expires August 28 at
23:44:27.695 UTC. Re-read before recovery; stopping a process is not rollback.
Never remove a live lease or infer a verified download from a ready row.

Commands from the repository root:

```powershell
# Needs previously reviewed schema-only inputs. Do not change evidence mid-run.
node scripts/portability-schema-audit.mjs
# Default only prints a resource plan; --create makes remote resources.
node scripts/portability-staging-provision.mjs
node scripts/portability-staging-drill.mjs --local
node scripts/portability-query-budget.mjs
```

Do not rerun the drill's `--remote` blindly: diagnose transport errors, inspect
state/lease, and verify unchanged evidence first. Preserve the manifest and audit
timestamps. Initialization refuses populated databases; partial restore setup
requires review, not a forced wipe. Keep the separate ledger independent.

## Bounded hosted work result

The checked-in budget regression uses full schemas, an accounting identity, eight
files, eight legacy keys, restore checks, scheduler overhead, two pending jobs,
and no monetary transactions:

| Operation | SQL statements | D1 binding calls |
| --- | ---: | ---: |
| Prepare | 506 | 506 |
| Submit consent | 17 | 15 |
| Freeze books | 395 | 63 |
| Authorize | 690 | 688 |
| Delete | 360 | 238 |

Batch statements and binding calls are separate counts; the runtime guard counts
SQL statements and storage operations together. The offline authorization phase
totals 726 operations. In the actual hosted run its observed maximum was 697.
Cloudflare documents 1,000 D1 queries per paid Worker invocation (50 on Free), so
the product remains paid-plan dependent. Work over 800 fails before publishing a
partial archive, leaving 100 operations reserved for cleanup. The earlier proxy
errors were a separate transport/lifecycle issue, not evidence of a platform-limit
failure; hosted phase boundaries and disposed RPC results avoid relying on one
long-lived proxy execution.

## Realistic-volume result

`npm run test:portability-volume` now runs in `check:release-gates`. The local
native-binding run exported 21,008 rows into an 11,350,769-byte ZIP with 235 entries
in under four seconds. The private hosted Worker exported the same row profile and byte
size in 9.009 seconds. Content hashes differ because the manifest contains each
run's export timestamps. Both runs verified every declared file checksum, removed
synthetic registration/accounting secrets, preserved another tenant, and stayed
below the 24 MB and 10,000-row-per-dataset limits.

A separate parish with 10,001 `directory_people` rows failed with
`export_too_large`/HTTP 413 locally and remotely. Its job retained no manifest or
archive key, its R2 job prefix remained empty, and all 10,001 source rows remained.
The hosted resources use the exact prefix `agapay-portability-volume-20260829`;
the bucket has r2.dev disabled, no custom domains, and one-day expiry for
`parish-exports/`. Production resources and flags were not read or changed.

Remaining release work, in order:

1. After the lifecycle threshold, run
   `node scripts/portability-staging-expiry.mjs --check`.
   This only performs HEAD and does not run a sweep. The planted probe prevents the
   main drill from running and contaminating the observation. Check that no manual
   deletion/sweep occurred before treating absence as lifecycle evidence.
2. Finish the off-provider/manual-copy attestation and retention disclosure approval.
   The browser/MFA/billing gate, realistic-volume gate, and real accounting, file,
   and KV provider restore qualification are complete.

The production accounting identity and 365-day backup lifecycle items are complete.
The identity was corroborated by the immutable database UUID/creation time, the
contemporaneous Git binding commit, 12 internal `st-fiacre:` journal source keys,
and the central registry. The lifecycle inventory found objects from July 21
through August 28 and no object already beyond the configured period. The strict
application sweep remains disabled pending the rest of the release review.

Natural lifecycle deletion is asynchronous; crossing the threshold does not
prove deletion. A read-only HEAD at 2026-08-29 00:04:43 UTC confirmed that the
object was still present before its threshold. No follow-up automation is running.

Staging resources remain for investigation and incur normal provider usage.
Before teardown, preserve evidence, verify exact names/IDs, and obtain approval.
Locked ledger objects need an explicit reviewed lock change. Never use broad
account-wide deletion or touch similarly named production/shared resources.

## Provider references

- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Wrangler programmatic bindings](https://developers.cloudflare.com/workers/wrangler/api/)
- [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [R2 lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
