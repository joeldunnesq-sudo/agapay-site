# Parish Directory Phase 2B -- Image Safety Policy

## Supported Formats

Accepted:

- JPEG
- PNG
- WebP

Rejected:

- SVG
- PDF
- archives
- executable files
- arbitrary binary files
- malformed images
- client MIME spoofing

## Limits

- maximum upload size: 10 MB
- maximum width: 12,000 px
- maximum height: 12,000 px
- maximum decoded pixels: 36,000,000
- upload session TTL: 15 minutes

## Validation

The server validates actual file content using magic bytes and dimension parsing. Client filename and MIME type are not trusted.

Crop input is server-validated. Person photos use a square crop model. Household photos use a 4:3 crop model.

## Metadata

Original uploads are private and are not served to ordinary directory viewers. The current Worker implementation does not introduce a native resizing dependency; derivative object records are private and delivered only through authorization routes. A future image-transform implementation can replace the derivative writer without changing the schema.
