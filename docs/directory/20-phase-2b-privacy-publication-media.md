# Parish Directory Phase 2B -- Privacy and Publication Integration

Photos are private directory data. Uploading a photo does not publish a person or household.

## Privacy

Photo visibility uses the Phase 1B privacy policy engine through:

- `person_photo`
- `household_photo`

Protected-person rules and child safeguards still apply. Child person-photo upload is deferred and denied in Phase 2B.

## Publication

Media upload creates a ready candidate. The user may submit it for review, but self-service users cannot approve their own photo.

The existing publication profile remains authoritative for public/member-facing exposure. Phase 2B does not add a public directory gallery, browse surface, or search card.

## Replacement

New candidates do not delete active approved photos before review. Candidate replacement is atomic at the assignment level.

## Deletion

Deletion immediately marks the asset and assignment deleted. Delivery routes reject deleted assets.
