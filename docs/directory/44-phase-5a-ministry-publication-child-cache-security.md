# Phase 5A Ministry Publication, Child, Cache, and Security Policy

## Publication

Participation and directory publication are separate. Approval of an interest request creates participation, not a public ministry affiliation.

An affiliation appears on an adult private directory profile only when:

- the participant status is `active`;
- publication preference is `directory`;
- staff has approved publication;
- the ministry is active or paused;
- the ministry visibility permits member display;
- the person is not protected and not a child.

Leadership display has separate publication state and never grants capabilities.

## Child Restrictions

Children are excluded from Phase 5A interest requests, leadership, ordinary participation, ministry profile display, and directory ministry affiliations. Child contacts are never used.

## Cache And Service Worker

Private ministry APIs live under `/api/directory/...` and use the private directory response pattern. Service workers must not treat these JSON responses as public assets. Logout and account switching rely on the existing private-directory authorization checks and header variance.

## Cross-Domain Separation

Phase 5A does not read or serialize donor, giving, accounting, Commerce, Learn, Marketplace, messaging, attendance, scheduling, skills, export, import, map, or public-page data.
