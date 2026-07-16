# Parish Directory Phase 1B - Contact Information Architecture

Phase 1B adds normalized directory contact records without adding email, phone, or address columns to `directory_people` or `directory_households`.

## Ownership

Contact records are owned by exactly one supported owner:

- `person`
- `household`

The owner is represented by `owner_type` and `owner_id` in:

- `directory_contact_methods`
- `directory_addresses`

The service layer validates that the owner belongs to the actor's parish before any mutation.

## Contact Methods

`directory_contact_methods` stores email and phone records.

Email records include:

- raw value;
- normalized lowercase value;
- label;
- primary flag;
- verified flag;
- visibility;
- active flag;
- timestamps.

Phone records include:

- raw value;
- normalized digit-only value;
- label;
- primary flag;
- SMS-capable flag where known;
- visibility;
- active flag;
- timestamps.

## Addresses

`directory_addresses` stores residential, mailing, and alternate addresses.

Address records include:

- address lines;
- city;
- region;
- postal code;
- country;
- primary flag;
- protected-address flag;
- visibility;
- active flag;
- timestamps.

Phase 1B does not add geocoding or external address verification.

## Primary Contacts

Only one active primary contact is allowed per owner and contact type. Creating or updating a primary contact clears the previous primary record in the same transaction.

Only one active primary address is allowed per owner and address type.

## Duplicate Prevention

Normalized duplicates are prevented per owner:

- same owner, contact type, and normalized email/phone;
- same owner, address type, and normalized address value.

Inactive contacts remain available for history.

## Donor and Login Separation

Directory contact records are not copied from donors and do not update donors. Platform login email is not automatically a directory email. A value may match a login or donor email, but the directory record remains a distinct intentional contact record.

## Auditing

Contact mutations write central audit rows. Audit summaries use masked values and do not include raw full email, phone, or address values.
