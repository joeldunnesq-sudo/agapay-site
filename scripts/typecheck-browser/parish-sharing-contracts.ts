const sharingDownload: Promise<void> = downloadQrPng();
void sharingDownload;
const givingTheme: ParishGivingTheme | null = previewGivingEmbedTheme();
void givingTheme;
// @ts-expect-error QR placement requires numeric coordinates.
positionBulletinQr('<svg/>', '10', 20, 30);
// @ts-expect-error Theme values are CSS strings.
const invalidGivingTheme: ParishGivingTheme = { primary: 123 };
void invalidGivingTheme;
// @ts-expect-error Branding requires an image URL string.
brandQrSvg('<svg/>', null);
