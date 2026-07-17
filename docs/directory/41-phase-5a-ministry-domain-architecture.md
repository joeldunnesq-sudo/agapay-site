# Phase 5A Ministry Domain Architecture

Phase 5A adds parish-scoped ministries and service groups to the directory domain. A ministry is a structured parish-life record, not a role template, permission grant, social group, event roster, or attendance record.

## Data Model

- `directory_ministries`: parish-owned ministry records with controlled category, lifecycle, visibility, interest policy, publication policies, display order, and archive metadata.
- `directory_ministry_leaders`: display-only leadership assignments for eligible adult canonical people.
- `directory_ministry_participants`: adult participation assignments with status, source, type, and separate publication controls.
- `directory_ministry_interest_requests`: member-submitted adult interest requests reviewed through the Phase 3A queue.

## Controlled Values

Categories are controlled: `liturgical`, `educational`, `charitable`, `hospitality`, `administrative`, `maintenance`, `youth`, `fellowship`, `outreach`, `bookstore`, `committee`, and `other`.

Lifecycle states are `draft`, `active`, `paused`, and `archived`. Archived ministries are not hard-deleted.

Visibility is server-enforced: `staff_only`, `parish_members`, `participants_only`, and `hidden`.

Request policy is controlled: `closed`, `request_interest`, or `administrator_assignment_only`.

## Directory Integration

Published adult ministry affiliations are added to private person-profile DTOs only when participation is active, publication preference is `directory`, staff approval is present, the ministry itself is visible to members, and the person is neither protected nor a child.

Member browse supports ministry filtering through server-generated published ministry data only.

## Alias Handling

Person IDs are resolved through `directory_merge_aliases` before leadership, participation, and interest operations. Assignments are stored on the survivor person ID and alias loops fail closed.

## Caching

Phase 5A ministry APIs use the existing private directory response pattern. Private member JSON varies by authorization/session headers and is never public site content.
