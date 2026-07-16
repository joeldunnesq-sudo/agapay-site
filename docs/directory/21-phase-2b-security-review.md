# Parish Directory Phase 2B -- Security Review

## Verdict

Phase 2B is ready as a private media foundation. It implements secure metadata, private R2 storage, upload validation, authorization, delivery, deletion, and tests. Native pixel resizing/metadata stripping is intentionally isolated behind the variant writer for future upgrade.

## Reviewed Risks

- MIME spoofing: detected by content sniffing.
- Executable uploads: rejected because signatures do not match supported image types.
- SVG/PDF uploads: rejected.
- Malformed images: rejected by dimension parsers.
- Decompression bombs: bounded by byte, dimension, and decoded-pixel limits.
- Object enumeration: object keys are not returned in DTOs and do not authorize access.
- Public bucket leakage: uses private `DIRECTORY_MEDIA`, not public campaign assets.
- Cross-parish access: owner authority resolves through Phase 2A context.
- Cross-household mutation: household photos require active household administrator.
- Spouse overreach: household admin cannot edit another adult's person photo.
- Child exposure: child person-photo upload is denied.
- Protected-person exposure: privacy policy continues to fail closed.
- Legacy bearer access: media API requires platform-user session.
- Donor-data leakage: no donor, giving, Learn, or accounting tables are read.
- Cache leakage: delivery responses are private.

## Known Limitations

The Worker implementation validates and privately stores image bytes but does not yet use a runtime image-resizing library. The schema, variants, and delivery route are structured so a later transformer can replace the storage implementation without changing the API.
