# Homepage to Give funnel

The homepage introduces the platform; `/give` supports plan selection, security
review, and requests for a parish demo. Direct demos and registrations are also
successful outcomes, not lost homepage-to-Give clicks.

## Attribution implemented

`public/marketing-funnel.js` decorates internal links to `/give`, the demo form,
and registration with `agapay_entry=homepage` and an `agapay_cta` value. Values
identify the hero, connected-system section, calculator, parish-life section,
final call to action, navigation, or footer. Existing UTM attribution is preserved.
The Give page carries those values into demo and registration links.

The demo form includes attribution in its existing referral notes. Registration
includes it in its existing notes field when there is room within the intake limit;
the visitor's notes take precedence. Attribution is saved with a successfully
submitted form. It is visitor-supplied context, not a trusted
identity or authorization signal.

The script also emits a document-level `agapay:funnel-click` CustomEvent containing
only page, destination path/anchor, entry, and CTA. No cookies, visitor IDs, storage,
form values, or new third-party tracking scripts are used.

## Measurement boundary

No sitewide analytics event collector was present on the homepage or Give page.
The click event is an integration hook, not a persisted analytics report. The
existing Meta Lead event on the demo form is unchanged. Do not report a click rate
until an approved collector provides both homepage visits and click counts.

Use attributed successful demo and registration records to compare outcomes by
entry point. Once a collector is connected, measure homepage-to-Give click rate
alongside subsequent completed demos and registrations. Do not count a CTA click
or form error as a completed conversion.

## Koinonia preview

Both marketing pages share `koinonia-preview.js` and its stylesheet. The preview
waits for all three screenshots to decode, advances only while visible, provides
explicit pause/play and next-screen controls, and starts paused for reduced-motion
preferences. Manual next also pauses autoplay; hovering no longer freezes it.

## Earlier marketing work recovered

The local checkout was based on an older branch and did not contain the marketing
work from `16919ff6` (the saved `origin/main` revision at recovery time). Restored
the Giving, In the app, Campaigns, Automated reports, and Get the app sections,
expanded reporting charts and Koinonia copy, six supplied screenshots, the updated
four-page council PDF, and the Give / Serve / Live header wording.

Combined only the relevant marketing files with the current changes; no branch
switch, application-code rollback, commit, or deployment was performed. The
current hero copy, gold italic phrase, smaller watermark, Koinonia controls,
attribution, canonical navigation, and Pricing-before-Security order remain.

Pre-recovery copies and three-way merge inputs are in
`tmp-marketing-recovery-8TnUBG/`. Validation confirmed all original section headings,
all 25 local asset references, exact screenshot/PDF bytes, valid section links,
and desktop/mobile rendering. The consolidated Give test now requires the five
recovered sections and their navigation links where applicable.
