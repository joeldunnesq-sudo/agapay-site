# Organization-readiness foundation

AGAPAY remains a church-first product. This architecture establishes a neutral tenant boundary so future Orthodox
organization types can reuse the platform without weakening parish behavior or forcing a repository-wide rename.

## Current scope

The public registration UI and onboarding launch path remain limited to churches, missions, cathedrals, and monasteries.
Future organization classifications are recognized only so shared code can fail closed and avoid embedding new
parish-only assumptions. Recognizing a classification does not activate public registration controls, entitlements,
modules, routes, or billing.

This package is behavior-preserving:

- Existing parish URLs and API response shapes do not change.
- Existing `parish_id`, `parishId`, and `parish_*` storage contracts remain authoritative compatibility contracts.
- The registration record remains the organization-context source; there is no second tenant registry.
- Existing entitlement checks remain authoritative. Organization-module eligibility is an additional boundary, never an
  entitlement grant.
- Existing church terminology remains the active presentation profile.

## Organization context

New shared-domain code should receive an immutable `OrganizationContext` instead of an unqualified raw parish ID. The
context is derived from an existing registration by `src/organizations/context.js` and contains only bounded identity,
classification, policy, terminology, and compatibility metadata. It deliberately excludes the registration document so
the context itself cannot leak credentials, tax evidence, contact details, or billing identifiers.

The initial identity invariant is:

```text
organizationId = legacy parishId
```

The `legacy` block makes that compatibility explicit. A future storage migration can change the physical tenant model
without changing every feature contract.

Lookup remains injected into `resolveOrganizationContext()`. The organization domain does not import a handler or reach
directly into D1 or KV. This avoids circular dependencies, keeps binding access in the existing repository boundary, and
makes the resolver straightforward to test.

## Classification is not entitlement

Organization type answers what the entity is. Subscription tier answers what the entity purchased. Verification policy
answers how the entity is reviewed. These must remain independent.

The production classifications are:

- `church`: mission, parish, or cathedral
- `monastery`: monastery or skete
- `diocese`: reserved for the existing cathedral/diocese commercial path, but not public self-registration

Future classifications are dormant:

- `ministry`
- `nonprofit`
- `school`
- `business`
- `other`

Dormant classifications receive the `reserved` module profile with no eligible modules. A subscription tier, registration
field, or client-supplied value cannot activate them.

## Verification policies

Registration field requirements now delegate to `src/organizations/verification-policies.js`. The currently active
policies preserve existing church behavior:

- canonical churches require jurisdictional review;
- canonical monasteries require jurisdictional review;
- business, ministry/nonprofit, school, and other Orthodox organization intake definitions preserve their existing
  values-review, description, and website requirements while remaining publicly disabled.

Unknown classifications use the unsupported policy and never inherit church or future-organization privileges.

The policy layer owns intake requirements plus the canonical identity-review portion of onboarding. Treasurer signoff,
tax readiness, Stripe readiness, payment-provider configuration, and subscription readiness remain independent gates.

## Terminology

Shared future surfaces may obtain bounded display nouns from `src/organizations/terminology.js`. Church-only features may
and should continue using precise Orthodox terms. The terminology profile is presentation metadata, never authorization or
financial classification.

## Module eligibility

`src/organizations/module-profiles.js` defines whether a module is structurally eligible for an organization type. It does
not replace `src/lib/entitlements.js`.

A module is available only when all applicable checks pass:

```text
organization-type eligible
AND subscription entitled
AND organization setting enabled
AND actor authorized
```

The current church, monastery, and diocese profiles match the existing product catalog. Future profiles stay reserved and
empty until their legal, financial, privacy, and operational requirements are implemented and reviewed.

## First production adoption: Parish Library

The authenticated Parish Library is the first production path to resolve and carry `OrganizationContext`. Its existing
route names, bearer authentication, `parish_id` storage, response payloads, and subscription rules remain unchanged.

The adapter now applies the complete module-access conjunction before staff or donor library access:

```text
recognized request tenant
AND organization-type eligibility
AND existing subscription entitlement
```

After authentication, repository calls receive the compatibility ID from `organizationScope.legacyParishId`, not a second
client-derived tenant value. Library mutations also use organization-scoped audit fields. The adapter makes
`organizationId` authoritative in audit records and adds the bounded organization type/subtype as metadata; it does not
put the registration record or contact data into the audit payload.

`authorizeOrganization()` provides the same bridge for platform-user capability authorization. It deliberately accepts
the existing authorization function as a dependency and translates the verified organization context back to the current
named `{ parishId, capability }` contract. This lets later handlers migrate one at a time without a circular dependency or
an all-at-once authorization rewrite.

## Package 2: capability authorization adoption

The shared Accounting request context is the first platform-user capability boundary migrated through
`authorizeOrganization()`. The adapter resolves the registration and verifies that its legacy tenant ID matches the
requested organization before either platform membership authorization or the existing Accounting staff-profile fallback
can grant access.

This migration is intentionally internal. Accounting URLs, capability names, response payloads, staff PIN sessions, D1
registries, and physical database selection remain unchanged. Once authorized, Accounting repositories receive only
`organizationScope.legacyParishId`, and downstream Accounting handlers can read the immutable organization context from
their existing shared request context.

Organization eligibility is checked before a physical Accounting database is resolved. An authenticated dormant ministry,
school, business, nonprofit, or unknown classification therefore receives the existing subscription-denied response and
cannot open church Accounting books, even if a legacy record contains Parish-tier subscription fields.

## Package 3: payment classification boundary

`src/payments/classification.js` is the server-owned classification contract for payment purpose and payment components.
It separates four concepts that must not be inferred from one another:

- purpose: donation, commerce, tuition, platform subscription, or unknown;
- component: principal, processor fee, legacy platform fee, fee refund, refund, dispute, or payout;
- organization availability: active, reserved, context required, or unsupported;
- downstream routing hints: Stripe volume class, Accounting family, and settlement-profile kind.

Fees are components of a payment flow, not a revenue-purpose alias. A Stripe processing fee remains attached to its
donation or commerce family, while a legacy AGAPAY application fee is explicitly classified as a platform-fee component.
The contract does not infer charitable status or tax treatment; both fields deliberately remain `not_inferred`.

Church, monastery, and existing diocesan payment purposes preserve current donation and commerce availability when an
organization context is supplied. Ministry, nonprofit, school, business, other, and unknown tenants remain unable to use
those purposes. Tuition has a defined classification and reserved Accounting source vocabulary, but stays reserved even
for a school context. Defining the future vocabulary does not create a tuition checkout, settlement route, entitlement,
or posting path.

`organizationEligible` describes only the organization-type side of the boundary. It is not permission to process a
payment; the existing entitlement, route authorization, onboarding, and payment-provider readiness checks remain
independently required.

The Give/Stripe and Commerce Accounting source-type lists now derive from the shared classification registry. This keeps
principal, fee, refund, dispute, and payout events in their intended family and prevents future tuition event names from
entering either active pipeline. Stripe source-event envelopes also carry bounded classification facts without adding
ledger fields or changing their existing operational-record and idempotency contracts.

The previous `classifyStripeCharge()` export remains as a compatibility facade for nonprofit-volume reporting. It now
delegates to the shared metadata classifier, so existing metadata and legacy aliases produce the same payment classes.
Canonical purpose metadata is accepted only with the supported classification version; legacy payment-class metadata
continues to work for historical Stripe records.

## Package 4: verification-policy onboarding adoption

The verification-policy interface now owns the canonical onboarding evidence contract and its workflow steps. For the
active church, monastery, and existing diocesan policies, that preserves the current requirements exactly:

- registration status is `verified`;
- reviewer identity is recorded;
- the official verification source is recorded;
- the bishop or responsible authority is recorded;
- the diocese or deanery is recorded;
- the approving priest's confirmation of treasurer access is recorded as the existing manual check.

Both the Admin transition to `verified` and the parish onboarding workflow delegate to this policy. They no longer keep
separate lists of canonical evidence fields. Existing church step keys, titles, details, ordering, error message, and
missing-field response remain unchanged, so the dashboard and stored onboarding records keep their current contract.

Registrations without a historical `communityType` use the legacy parish policy. Explicit ministry, nonprofit, school,
business, other, and unknown classifications receive a reserved verification-policy step that always blocks launch; even
complete church-shaped evidence cannot activate their onboarding. Future verticals therefore require an intentional
policy activation rather than inheriting church approval by accident.

Verification remains only one part of launch authorization. The policy does not grant entitlements, enable modules,
approve tax treatment, declare Stripe ready, select a subscription, or replace the final treasurer signoff.

## Package 5: versioned organization API boundary

The first versioned organization route is `GET /api/v1/organizations/:organizationId`. It is an authenticated,
read-only compatibility boundary for organization identity. It resolves the existing registration server-side, verifies
that the requested organization ID matches the stored legacy `parishId`, and then verifies the existing parish dashboard
bearer session against that same registration.

The response contains only bounded organization identity and compatibility fields: ID, type, subtype, display name,
terminology profile, module profile, and the explicit legacy tenant mapping. It never returns the registration document,
legal or tax evidence, contacts, payment-provider identifiers, entitlement data, or session material. Responses are
private and non-cacheable.

This route does not alias the parish dashboard API or create generic CRUD endpoints. Existing `/api/parish` routes remain
the production feature contract. Church, monastery, and existing diocesan compatibility profiles may read the descriptor;
ministry, nonprofit, school, business, other, and unknown classifications receive a not-found response before legacy
session authorization is attempted. Activating one of those types therefore requires a reviewed API-policy change in
addition to verification, module, entitlement, billing, and product work.

## Package 6: organization-aware dashboard entitlements

The shared entitlement boundary now requires both structural organization eligibility and the existing subscription or
legacy-add-on entitlement. Subscription calculation remains independent: a stored Parish tier can still be inspected as
a billing fact, but it cannot grant modules to a reserved or unrecognized organization classification.

The server-computed dashboard entitlement summary carries bounded organization-eligibility metadata and masks every
module, module source, legacy bundle, comp grant, and giving feature when the organization profile is reserved. The
dashboard's legacy top-level module booleans derive from the same guarded functions, so they cannot contradict the nested
summary. Registrations without a historical `communityType` retain the legacy church default, preserving existing parish
behavior.

This is a defense-in-depth adoption, not a new product catalog. Church, monastery, and existing diocesan profiles retain
their current subscription behavior. Future types still require an explicit module-profile activation, an entitlement
catalog, verification approval, route policy, and product review.

## Compatibility and migration rules

1. Do not perform a global `parish` to `organization` rename.
2. Do not duplicate the registration source of truth.
3. Do not infer organization type from subscription tier.
4. Do not infer tax classification or charitable eligibility from organization type.
5. Do not grant a module solely because its name appears in an organization profile.
6. Do not authorize a request from a client-supplied organization ID; resolve and verify the membership server-side.
7. Keep request-specific context in function arguments, never mutable module scope.
8. New generic domains should prefer `organizationId`; existing storage repositories may translate it to `parish_id`.
9. Existing APIs and exports retain legacy names; new shared contracts use the versioned organization API boundary.
10. Unknown or dormant organization types fail closed.

## Next implementation packages

1. Migrate additional platform-user capability boundaries through `authorizeOrganization()` after Package 2 proves the
   shared Accounting path in production.
2. Adopt `paymentMetadataForPurpose()` in checkout producers as those handlers are next revised, without accepting a
   client-supplied purpose as authoritative.
3. Add product endpoints beneath the versioned organization namespace only when a non-church product is approved for
   launch; do not expose the parish route surface wholesale.

## Expansion readiness test

The test suite includes a dormant ministry fixture. It proves that the platform can classify the organization, select a
future verification and terminology policy, and deny every module without exposing a registration route or changing a
church entitlement. This is the architectural proof required now; a public vertical is intentionally out of scope.
