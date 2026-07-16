# AGAPAY Parish Directory — Phase 0

## Repository, Data Model, Privacy, and Product Readiness Audit

You are working in the production repository for AGAPAY:

`joeldunnesq-sudo/agapay-site`

AGAPAY is an Orthodox parish operating platform built on Cloudflare Workers, D1, KV, R2, Stripe, and static frontend assets.

The platform already includes or is developing:

* My AGAPAY household accounts;
* individual platform users;
* parish memberships;
* capability-based authorization;
* donor records;
* giving and contribution records;
* parish administration;
* household and family-related data;
* invitations;
* parish commerce;
* public Orthodox parish-directory functionality;
* private R2 document and image-storage patterns;
* audit logging;
* staging and local-development infrastructure.

AGAPAY is now beginning development of a new private parish product:

# AGAPAY Parish Directory

This product is distinct from the public AGAPAY directory of Orthodox parishes and organizations.

The Parish Directory will allow each participating parish to maintain a private, self-updating directory of its households and parishioners.

Parishioners will create or use their My AGAPAY accounts, claim or join their household, maintain their own contact information, control what information is visible, and periodically confirm that their information remains current.

Parish leadership will be able to manage membership, invite households, approve claims or changes where required, search directory information, and identify parishioners with vocations, skills, training, resources, or willingness to serve when parish needs arise.

## Strategic Objective

The directory must accomplish three goals:

1. Reduce the parish’s administrative burden by allowing households to maintain their own information.
2. Give parishioners a practical reason to create and regularly use My AGAPAY accounts.
3. Help parish leadership discover and respectfully engage the skills, vocations, gifts, experience, and volunteer willingness already present within the parish.

## Important Product Principle

The directory should be:

> Household-managed, parish-governed, privacy-first, and service-oriented.

Parishioners maintain their information.

The parish controls who belongs to the directory and who may access it.

Each household and person controls what information is published to ordinary parish members.

Leadership access and ordinary directory-member access must remain distinct.

---

# Your Assignment

Perform a comprehensive Phase 0 repository, data-model, privacy, and product-readiness audit.

Do not implement the directory yet.

Do not create migrations.

Do not change code.

Do not modify existing tables.

Do not create UI screens.

Do not create placeholder production behavior.

Do not refactor unrelated modules.

Your task is to determine:

* what relevant identity, household, person, membership, invitation, donor, parish, directory, R2, and authorization infrastructure already exists;
* which existing models should be reused;
* which existing models must remain separate;
* where duplicate or conflicting person/household records could arise;
* what privacy and security rules must govern the product;
* what new domain concepts will be required;
* and how the directory should be divided into safe, phased implementation packages.

Save the completed report as:

`docs/directory/00-parish-directory-phase-0-audit.md`

Create the `docs/directory/` directory if it does not already exist.

---

# Primary Architectural Question

Your audit must answer:

> How should AGAPAY build a private parish household directory and skills-and-service network on top of the existing platform-user, My AGAPAY, donor, household, and parish-membership architecture without duplicating identities, exposing donor or child information, or conflating private parish records with the public Orthodox parish directory?

---

# Core Product Vision

The eventual product should support:

## Household Directory

* Household display names
* Adult household members
* Children, subject to privacy choices
* Household photos
* Phone numbers
* Email addresses
* Mailing addresses
* City and state
* Name days or patron saints
* Birthdays or birthday reminders, where appropriate
* Household relationships
* Parish membership status
* Self-service information updates
* Field-level privacy controls
* Parish approval workflows
* Searchable parish directory
* Printable directory
* Authorized exports

## Skills and Service Profiles

Parishioners may voluntarily provide:

* Vocation or occupation
* Professional field
* Skills and trades
* Professional training
* Certifications or licenses, without unnecessarily storing sensitive identifiers
* Languages
* Ministry experience
* Teaching experience
* Technology skills
* Construction and maintenance skills
* Medical or emergency-response training
* Cooking and hospitality experience
* Transportation availability
* Equipment or resources they may be willing to offer
* Types of parish needs they are willing to help with
* Experience level
* Willingness to advise
* Willingness to volunteer
* Willingness to lead
* Availability
* Temporary unavailability
* Preferred contact method
* Travel or geographic limitations
* Last-confirmed date

The system must distinguish:

* a person possessing a skill;
* a person being willing to be contacted about that skill;
* a person’s current availability;
* the visibility of that information.

A person being an attorney, doctor, nurse, contractor, counselor, law-enforcement officer, accountant, or other professional does not automatically mean they consent to provide services to the parish.

## Leadership Search

Authorized parish leadership should eventually be able to search structured skills such as:

* accounting;
* legal;
* construction;
* electrical;
* plumbing;
* technology;
* graphic design;
* medical;
* emergency response;
* transportation;
* cooking;
* hospitality;
* education;
* tutoring;
* languages;
* translation;
* fundraising;
* event planning;
* music;
* liturgical arts;
* childcare;
* elder care;
* facilities;
* agriculture;
* governance;
* communications.

This must be permission-controlled and should not automatically expose sensitive vocation information to every directory user.

---

# Required Areas of Investigation

## 1. Current Identity Architecture

Fully inspect the implementation introduced by Packages 0.75C and 0.75D.

Document:

* `platform_users`;
* authentication and sessions;
* email verification;
* user identity helpers;
* parish memberships;
* membership capabilities;
* invitations;
* membership lifecycle;
* user-to-parish relationships;
* multiple-parish membership;
* capability enforcement;
* self-escalation protections;
* denial auditing;
* legacy parish bearer authentication;
* how the legacy bearer token is excluded from capability-protected routes;
* system and support actor concepts.

Identify:

* which parts can be reused unchanged;
* which parts should be extended;
* which directory actions require new capabilities;
* whether any identity assumptions conflict with household sharing or multiple adult household administrators.

List exact relevant files and tables.

## 2. Current My AGAPAY and Household Architecture

Inspect all code and schema related to:

* My AGAPAY;
* households;
* family members;
* donor accounts;
* donor households;
* spouses;
* children;
* dependents;
* shared household access;
* household signup;
* household onboarding;
* household profile editing;
* household addresses;
* household contact information;
* one-account-per-household assumptions;
* individual adults accessing one household;
* household initials and display names;
* family or Learn records that may overlap.

Determine:

* whether there is already one canonical household record;
* whether “household” is currently only a UI concept;
* whether donor data currently acts as the household model;
* whether multiple adults may independently authenticate and manage the same household;
* whether children are represented as people, free-text names, JSON data, or another model;
* whether current data is normalized or stored in JSON blobs;
* whether the directory should extend the current model or introduce a new canonical household domain.

Do not assume donor records are appropriate directory records merely because they contain names and addresses.

## 3. Person Model

Determine whether AGAPAY currently has a canonical person concept separate from:

* platform user;
* donor;
* household member;
* child;
* parish membership;
* Learn student;
* clergy record;
* contact record.

The audit must distinguish:

### Platform user

An authenticated individual who can log in.

### Person

A human represented in AGAPAY, whether or not that person can log in.

### Household

A family or residential/administrative grouping.

### Household member

A person connected to a household.

### Parish membership

A person’s or household’s relationship to a parish.

### Directory profile

The subset of approved data published in a parish directory.

Recommend whether a new canonical `persons` or equivalent domain concept is needed.

Explain how a child, elderly dependent, non-email-using spouse, or unclaimed imported person would exist without requiring an individual login.

## 4. Current Donor and Giving Data

Inspect:

* donor records;
* donor offerings;
* contribution statements;
* donation contact information;
* donor household assumptions;
* donor identity linking;
* giving-history privacy;
* existing addresses and emails;
* commemorations;
* pledges;
* any parish-facing donor lists.

Determine:

* what donor data may safely seed a directory claim or match;
* what donor data must never automatically become directory-visible;
* whether giving records contain duplicated names or contact information;
* how donor and directory records should be linked without making either one authoritative for the other;
* whether directory updates should alter donor receipt information;
* whether donor receipt information should remain independently controlled for legal and tax purposes.

State explicitly that giving amounts, giving frequency, pledge history, contribution statements, and donor status must never be exposed through the directory.

## 5. Existing Public Directory

Inspect any existing or planned public AGAPAY directory of:

* Orthodox parishes;
* monasteries;
* schools;
* ministries;
* organizations;
* clergy;
* public contact information.

Document:

* relevant tables;
* routes;
* handlers;
* frontend pages;
* APIs;
* naming conventions;
* permissions;
* public/private assumptions.

Define a strict terminology and code-boundary distinction between:

### AGAPAY Directory

The public directory of Orthodox organizations.

### Parish Directory

A private directory of households and people within one parish.

Recommend domain names, route names, table prefixes, and code directories that minimize future confusion.

Do not reuse public-directory tables for private household information.

## 6. Parish Membership Semantics

Determine what a current `parish_membership` means.

Does it mean:

* access to parish administrative software;
* actual ecclesial/parish membership;
* an invited staff user;
* a volunteer;
* a directory member;
* any authenticated relationship to a parish?

This distinction is essential.

A bookkeeper may have administrative software access but may not be a parishioner.

A child may be a parish member but have no authenticated platform account.

A parishioner may appear in the directory without having an administrative role.

Recommend whether the product needs distinct concepts such as:

* platform access membership;
* parish affiliation;
* household directory membership;
* clergy/staff relationship;
* directory publication status.

Do not overload one existing table if its current meaning is materially different.

## 7. Household Claiming and Record Matching

Design conceptually how a parish may import existing households and how parishioners later claim them.

Investigate existing invitation and matching tools.

Address:

* individual invitation;
* household invitation;
* bulk CSV import;
* parish-specific signup link;
* QR code signup;
* email matching;
* phone matching;
* name and address matching;
* invitation-token matching;
* exact-match rules;
* likely-match rules;
* ambiguous-match handling;
* manual parish confirmation;
* household claim approval;
* duplicate detection;
* record merging;
* undoing an incorrect merge;
* preserving source lineage;
* preventing hostile claims.

Do not implement matching yet.

Recommend safe matching principles.

Never recommend silently merging uncertain records.

## 8. Household Administration

Determine how multiple adults should manage one household.

Address:

* primary household administrator;
* additional household administrators;
* spouse invitations;
* shared editing;
* conflicting edits;
* removing an adult’s access;
* separation or household changes;
* adult children creating their own household;
* deceased members;
* moved-away members;
* children becoming adult platform users;
* guardians and dependents;
* one person belonging to multiple households, if ever allowed.

Reevaluate the existing “one My AGAPAY account per household” language in light of individual platform identities.

Recommend a future formulation such as:

> One My AGAPAY household profile per household, managed by one or more individually authenticated adults.

## 9. Directory Publication Model

Define the distinction between:

* canonical person/household data;
* parish-office-visible data;
* directory-published data;
* leadership-only service/skills data;
* private data never shown in the directory.

Determine whether publication should use:

* direct field visibility flags;
* a separate directory-profile projection;
* an approval snapshot;
* another model.

Evaluate the benefits and risks of each.

The directory must not merely expose raw household records.

## 10. Field-Level Privacy

Design a privacy matrix for at least:

* household name;
* adult legal name;
* adult preferred name;
* children’s names;
* children’s ages;
* exact birth dates;
* month/day birthday reminders;
* name days;
* patron saints;
* email;
* phone;
* street address;
* city/state;
* household photo;
* person photo;
* vocation;
* skills;
* professional credentials;
* languages;
* willingness to serve;
* availability;
* emergency contacts;
* pastoral notes;
* giving information.

Potential visibility levels may include:

* household administrators only;
* person only;
* parish clergy;
* authorized parish staff;
* parish leadership;
* ministry coordinators;
* all verified parish-directory members;
* hidden.

Recommend safe defaults.

Children’s information must receive especially conservative defaults.

## 11. Skills and Service Domain

Design the domain conceptually.

Recommend structured entities for:

* skill categories;
* standardized skills;
* person skills;
* custom skills;
* vocation;
* experience level;
* professional versus hobby experience;
* willingness types;
* availability;
* visibility;
* preferred contact;
* last confirmed;
* expiration/reconfirmation status;
* leadership notes, if any.

Do not store professional license numbers by default.

Do not store background-check information in the ordinary skills profile.

Do not treat the presence of a skill as consent to provide professional services.

Recommend a controlled category list plus optional free text.

Assess whether parishes may create custom skill categories.

## 12. Skills Search and Outreach

Define future leadership behavior.

Address:

* who may search;
* which capabilities are required;
* whether clergy and designated coordinators have different visibility;
* filters;
* experience level;
* willingness;
* current availability;
* last confirmed;
* direct contact;
* request-for-help workflow;
* whether outreach is logged;
* whether a person can decline future outreach;
* whether a leader may export skills data;
* whether skills data appears in the ordinary directory.

Recommend that skills data default to leadership-only unless a parishioner opts into broader visibility.

## 13. Reconfirmation and Data Freshness

Design how AGAPAY should keep directory information current.

Address:

* last confirmed date;
* annual or semiannual reconfirmation;
* reminders;
* household completion percentage;
* stale contact flags;
* stale skills/availability flags;
* “temporarily unavailable” status;
* parish-led verification;
* member-led confirmation;
* archived or inactive households;
* reminders through email or My AGAPAY.

Distinguish “last edited” from “last confirmed.”

## 14. Directory Authorization and Capabilities

Review the existing 0.75D capability catalog.

Recommend new capabilities such as:

* `directory.view`
* `directory.household.manage`
* `directory.self.manage`
* `directory.members.manage`
* `directory.claims.review`
* `directory.import`
* `directory.export`
* `directory.settings.manage`
* `directory.skills.view`
* `directory.skills.manage`
* `directory.skills.search`
* `directory.photos.manage`
* `directory.audit.view`

Use the repository’s existing naming conventions rather than blindly adopting these names.

Define:

* ordinary member access;
* household administrator access;
* clergy access;
* parish staff access;
* leadership access;
* directory administrator access;
* platform support access.

Legacy parish bearer authentication must not authorize private directory access.

## 15. Audit Requirements

Define what must be audited.

At minimum:

* household created;
* household claimed;
* claim approved or denied;
* household merged;
* household split;
* person added;
* person removed;
* adult access granted;
* adult access revoked;
* contact information changed;
* visibility changed;
* photo uploaded or removed;
* skills added or removed;
* willingness changed;
* parish membership activated or archived;
* import performed;
* export performed;
* leadership skills search, if appropriate;
* support access.

Distinguish:

* ordinary profile editing;
* sensitive privacy-setting changes;
* privileged parish actions.

## 16. R2 and Photo Storage

Inspect current R2 patterns.

Determine how to store:

* household photos;
* person photos;
* future printable-directory PDFs;
* import files;
* export files.

Address:

* dedicated private bucket versus existing private bucket;
* object-key conventions;
* parish isolation;
* image validation;
* image-size limits;
* image resizing;
* metadata;
* authorization;
* deletion;
* orphan cleanup;
* default avatars;
* child photos;
* photo approval.

No directory photo may be stored in the public campaign-assets bucket.

## 17. Import and Export

Design future import support for:

* households;
* people;
* contact details;
* parish status;
* skills, only if explicitly imported;
* existing ChMS exports;
* CSV files.

Address:

* staging;
* mapping;
* validation;
* duplicate detection;
* dry run;
* approval;
* rollback before finalization;
* source preservation;
* audit trail.

Design future exports for:

* printable directory;
* PDF photo directory;
* mailing list;
* mailing labels;
* authorized CSV;
* leadership-only skills report.

Exports must obey permissions and privacy.

## 18. Children and Vulnerable Persons

Create a dedicated privacy and safety analysis.

Address:

* minimum child information;
* parent/guardian control;
* child photos;
* children’s names;
* birthdays;
* age visibility;
* contact information;
* households with custody considerations;
* foster children;
* protected addresses;
* vulnerable adults;
* clergy/staff-only visibility;
* directory exports containing children.

Do not make legal conclusions unsupported by counsel.

Flag decisions that require legal or child-safety review.

## 19. Search Architecture

Define conceptual search requirements.

The ordinary directory should eventually search:

* household name;
* adult name;
* preferred name;
* city;
* ministry or group, if later supported.

Leadership skills search should search:

* vocation;
* structured skill;
* category;
* language;
* willingness;
* availability;
* experience level;
* last-confirmed status.

Recommend indexing strategy conceptually, without writing schema.

Do not use public search-engine indexing.

## 20. Notifications and Adoption Funnel

Design the future parish onboarding funnel.

Address:

* bulk invitation;
* individual invitation;
* household claim invitation;
* parish-specific signup link;
* QR code;
* bulletin announcement;
* reminder cadence;
* claimed versus unclaimed dashboard;
* profile completion;
* missing data reminders;
* stale data reminders;
* privacy onboarding;
* skills-profile invitation;
* opt-out.

Identify how this strengthens My AGAPAY adoption without using coercive or misleading patterns.

## 21. Mission and Parish Tier Packaging

Recommend which directory features belong in:

### Mission Tier — $99/month

Expected core functionality may include:

* household directory;
* individual and household invitations;
* self-service updates;
* field-level privacy;
* household photos;
* search;
* basic directory administration;
* basic printable directory;
* skills/service profiles;
* leadership skills search.

### Parish Tier — $199/month

Potential advanced functionality may include:

* bulk import;
* approval queues;
* advanced custom fields;
* advanced exports;
* multiple directory views;
* ministries/groups;
* custom skill categories;
* mailing labels;
* birthday/name-day reports;
* historical changes;
* advanced household merge tools;
* expanded staff permissions.

Assess whether core skills-and-service functionality should be included in both tiers to maximize adoption and parish value.

## 22. Existing Features That Can Be Reused

Identify every reusable item.

For each, state:

* reuse as-is;
* extend;
* wrap;
* migrate;
* replace;
* keep separate.

At minimum consider:

* platform users;
* memberships;
* invitations;
* capability authorization;
* audit logs;
* My AGAPAY signup;
* donor profiles;
* household data;
* Learn family/student data;
* R2 storage;
* CSV utilities;
* PDF generation;
* email infrastructure;
* QR generation;
* background jobs;
* observability;
* environment configuration.

## 23. Architectural Conflicts and Technical Debt

Identify risks such as:

* donor record treated as a person;
* household represented only in JSON;
* duplicate family models between Give and Learn;
* one shared household login assumption;
* admin membership conflated with ecclesial parish membership;
* public and private directories using similar names;
* privacy settings absent or too coarse;
* children exposed by default;
* uncontrolled free-text skills;
* direct SQL in handlers;
* multiple sources of address truth;
* legacy bearer access;
* insufficient photo isolation;
* household merge irreversibility.

Rank each as:

* Critical
* High
* Medium
* Low

State which must be resolved before implementation.

## 24. Threat Model

Address:

* Parish A accessing Parish B’s directory;
* ordinary parishioner accessing leadership-only information;
* hostile household claim;
* account takeover;
* child-information exposure;
* protected-address exposure;
* scraped directory data;
* unauthorized exports;
* skills-profile misuse;
* leadership overreach;
* self-escalation;
* malicious CSV import;
* image upload abuse;
* R2 exposure;
* duplicate record takeover;
* incorrect household merge;
* platform support misuse;
* legacy bearer-token access;
* stale former-member access.

For each threat, include:

* asset;
* actor;
* attack path;
* likelihood;
* impact;
* existing mitigation;
* missing mitigation;
* required control;
* verification test;
* phase by which it must be resolved.

## 25. Recommended Domain Model

Recommend a conceptual model, without writing final SQL.

At minimum evaluate concepts such as:

* persons;
* households;
* household_members;
* household_administrators;
* parish_affiliations;
* directory_memberships;
* directory_profiles;
* directory_field_visibility;
* contact_methods;
* addresses;
* household_claims;
* directory_invitations;
* skill_categories;
* skills;
* person_skills;
* service_preferences;
* directory_change_requests;
* directory_photos;
* import_batches;
* merge_events.

Do not automatically use all these entities.

Recommend the smallest model that remains correct and extensible.

For each concept, define:

* purpose;
* authority;
* relationship to platform users;
* relationship to donor records;
* relationship to parish memberships;
* lifecycle;
* privacy implications.

## 26. Recommended Product Phases

Create a phased implementation roadmap.

A likely sequence is:

### Directory Phase 1A — Canonical Person and Household Foundation

### Directory Phase 1B — Parish Affiliation and Directory Membership

### Directory Phase 1C — Household Claiming and Invitations

### Directory Phase 2 — Household Self-Service

### Directory Phase 3 — Parish Administration

### Directory Phase 4 — Private Member Directory

### Directory Phase 5 — Skills and Service Network

### Directory Phase 6 — Imports, Exports, and Printable Directory

### Directory Phase 7 — Adoption and Reconfirmation Tools

Modify the sequence if the repository findings justify it.

For every phase, include:

* objective;
* schema concepts;
* services;
* routes;
* UI;
* permissions;
* privacy requirements;
* tests;
* acceptance criteria;
* dependencies;
* risks;
* explicit exclusions.

---

# Required Final Deliverable

Create:

`docs/directory/00-parish-directory-phase-0-audit.md`

Use this exact structure:

# AGAPAY Parish Directory — Phase 0 Audit

## 1. Executive Summary

State:

* overall readiness;
* whether the existing identity system can support the directory;
* whether a canonical person or household model already exists;
* the recommended domain model;
* the greatest privacy risks;
* the recommended first implementation phase.

## 2. Product Definition

Define the private Parish Directory and distinguish it from the public AGAPAY Directory.

## 3. Confirmed Current Architecture

Describe relevant identity, household, donor, membership, invitation, R2, authorization, and audit systems.

## 4. Current Data Map

Show how current records represent:

* people;
* users;
* donors;
* households;
* children;
* parish access;
* parish affiliation;
* directory-like data.

## 5. Reuse and Separation Decisions

State what should be reused, extended, kept separate, or replaced.

## 6. Recommended Canonical Domain Model

Provide a text diagram.

## 7. Household and Person Ownership

Explain who owns and may edit each kind of data.

## 8. Parish Membership and Directory Membership

Clarify the distinction.

## 9. Directory Publication and Privacy Model

Include the field-level privacy matrix.

## 10. Skills and Service Model

Include:

* categories;
* structured skills;
* willingness;
* availability;
* visibility;
* leadership search;
* reconfirmation;
* safeguards.

## 11. Household Claiming and Duplicate Management

Define safe principles and workflows.

## 12. Children and Vulnerable-Person Safety

Document safe defaults and unresolved legal/policy questions.

## 13. Authorization and Capability Model

Recommend capabilities and role access.

## 14. R2 and Media Architecture

Recommend private photo and export storage.

## 15. Import, Export, and Search Architecture

Define conceptual requirements.

## 16. Adoption Funnel

Explain household onboarding and reconfirmation.

## 17. Tier Packaging

Recommend Mission and Parish feature boundaries.

## 18. Threat Model

Provide a severity-ranked table.

## 19. Existing Technical Conflicts

Rank blockers and required refactors.

## 20. Recommended Phased Roadmap

Define all implementation phases.

## 21. Phase 1A Scope

Define the exact first implementation package, including:

* entities;
* migrations;
* services;
* routes;
* tests;
* documentation;
* acceptance criteria;
* exclusions.

Do not implement it.

## 22. Human Decisions Required

List every decision Joel must make, with a recommended default.

## 23. Final Readiness Verdict

State one of:

* Ready for Directory Phase 1A
* Ready after specified prerequisites
* Not ready

Explain why.

---

# Audit Standards

* Ground every repository-specific statement in actual code or schema.
* Use exact file paths.
* Include line references where practical.
* Distinguish confirmed facts from recommendations.
* Do not assume donor, household, or Learn models can be merged without inspecting them.
* Do not recommend exposing giving data.
* Do not recommend making children visible by default.
* Do not recommend a single shared household password.
* Do not recommend reusing public directory storage for private people data.
* Do not recommend storing authoritative directory state in KV.
* Do not recommend uncontrolled free-text-only skills.
* Do not recommend automatic merging of uncertain records.
* Do not expose secret values.
* Do not modify code.

# Final Response

After producing the audit, return:

1. A concise readiness verdict
2. The recommended person and household model
3. The recommended privacy model
4. The recommended skills-and-service model
5. The five greatest implementation risks
6. The exact first implementation package
7. Any finding that materially changes the proposed roadmap

Do not begin implementation.
