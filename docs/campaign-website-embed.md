# Campaign pages on parish websites

In the parish dashboard, open **Campaigns → Website embed** for a saved campaign. Enter the published HTTPS URL of the parish's own campaign page, choose button/progress/background colors and a heading font, and edit the introductory paragraph. Preview, then copy the generated code.

## Elementor

1. Create or edit the parish campaign page in WordPress with Elementor.
2. Add an **HTML widget** inside a container. Paste the entire generated snippet into that widget, including the iframe and script.
3. Use the container's normal/full width and automatic height. Avoid fixed heights, clipping, and overflow-hidden settings around the widget.
4. Publish or update. Check the published page in a separate browser tab, on both desktop and mobile. Use the published URL in AGAPAY, not a WordPress/Elementor editor or preview URL.

Elementor documents HTML, CSS, and JavaScript support in its [HTML widget](https://elementor.com/help/html-widget/). The loader supports delayed insertion, replacement/cloning of widgets, multiple widgets per page, and repeated inclusion of the loader. It does not require jQuery or Elementor Pro. A native iframe remains as a fixed-height fallback if a WordPress plugin strips the script. An administrator can permit the script or use Elementor Custom Code where available. Site security policy must permit `https://agapay.app` in `frame-src` and `script-src`; optimization/consent plugins must allow the loader when the campaign should display.

## Branding and customization

An AGAPAY logo/wordmark banner with a fixed navy/gold/white palette appears above the campaign. A second fixed-color AGAPAY notice appears at the donation form; the existing branded footer remains. Controls cannot remove or recolor these notices. Only validated hex colors and the two supplied heading fonts are accepted. Button text and headings automatically use contrasting text colors.

The campaign lives in a cross-origin iframe, so ordinary parish/Elementor styles do not override its branding or form. A website owner still controls their own page and can remove or crop an iframe; this is not a technical guarantee against deliberate concealment.

## Traffic and SEO

The generated heading and introduction are native HTML on the parish page. The live campaign story, photos, progress, updates, and form are served by AGAPAY inside the iframe. The copied introduction is a snapshot; update it in Elementor or regenerate the snippet when that copy changes.

Embedded share links point to the parish's published page. The loader uses the configured page URL when it belongs to the current site; otherwise it uses the current page, without query parameters or fragments. The dedicated embed route returns `noindex, indexifembedded`, keeping that route from being a standalone Google search result while allowing embedded-content indexing. See [Google's indexifembedded guidance](https://developers.google.com/search/blog/2022/01/robots-meta-tag-indexifembedded). This does not guarantee rankings. The parish should set its WordPress page title, description, canonical URL, and social preview image, add substantive native content, and share the parish URL. The ordinary AGAPAY public campaign page remains available.

Stripe checkout opens in a separate tab, keeping the parish page open. If a popup is blocked, the embed offers an explicit checkout link. Checkout still uses the existing server-side campaign authorization, status checks, fund attribution, fees, and payment verification; arbitrary external return redirects are not introduced.

## Validation and release

- `node scripts/campaign-embed-tests.mjs`: Worker routing, frame policy isolation, and indexing headers.
- `node scripts/campaign-embed-browser-tests.mjs`: real campaign UI in a cross-origin host, Elementor-style dynamic widget insertion/cloning, repeated loaders, multiple themes, resizing, mobile widths, share URLs, generated HTML escaping, and checkout attribution.
- Existing campaign-management and giving-box tests cover regressions.

These are synthetic browser integration tests, not a test against a particular parish's WordPress installation. Publish the application before installing the production snippet. Screenshots are saved under `artifacts/campaign-embed/`.
