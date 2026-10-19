# Styling the parish giving card

In the parish dashboard, select **Customize CSS** next to the giving embed links. Edit the CSS declarations, update the preview, and copy the styled embed code into your website. The copied code stores the design; this does not change a parish-wide setting. Reopening the editor starts with the default palette.

The giving card is an iframe. The loader reads these CSS custom properties from its container and applies the supported values inside that iframe. Ordinary parent-page selectors cannot style the card's internal elements.

```html
<style>
  .parish-giving {
    --agapay-giving-primary: #234b43;
    --agapay-giving-primary-text: #ffffff;
    --agapay-giving-accent: #dfc78a;
    --agapay-giving-accent-text: #665321;
    --agapay-giving-background: #faf9f5;
    --agapay-giving-surface: #ffffff;
    --agapay-giving-text: #253832;
    --agapay-giving-muted: #626d67;
    --agapay-giving-border: #d6ddd6;
    --agapay-giving-font: Arial, sans-serif;
    --agapay-giving-heading-font: Georgia, serif;
  }
</style>
<div class="parish-giving" data-agapay-giving="YOUR_PARISH_ID"></div>
<script async src="https://agapay.app/giving-box.js"></script>
```

| CSS property suffix | Controls |
| --- | --- |
| `primary` | Selected amounts, headings, primary text on accent buttons |
| `primary-text` | Text on selected amounts and secondary buttons |
| `accent` | Main button, highlights, focus indicators |
| `accent-text` | Field labels and secondary action text |
| `background` | Card background |
| `surface` | Inputs, option cards, progress ribbon, footer |
| `text` | Body and input text |
| `muted` | Explanatory text |
| `border` | Card, field borders and dividers |
| `success`, `danger` | Success and error indicators |
| `font`, `heading-font` | Body/control and heading font-family stacks |

Prefix each suffix with `--agapay-giving-`. Omitted or invalid values use AGAPAY defaults. Color values must be valid CSS colors. Choose contrasting text/background pairs, especially `primary` against `accent`, and `primary-text` against `primary`.

Font families can use installed device fonts, generic families, or the card's included DM Sans and Cormorant Garamond. A custom web font loaded only on the parent website is unavailable inside the iframe; provide a suitable fallback. Arbitrary CSS rules, stylesheet URLs, and `@font-face` declarations are not accepted.

Define the CSS before the loader runs. Different containers can have different themes. If your site changes its theme after mounting, call `window.AGAPAYGivingBox.refreshTheme()` to reread the computed CSS properties without resetting the donor's form. Parent CSS variables such as `--agapay-giving-primary: var(--site-brand)` resolve through the normal CSS cascade; use literal values in the dashboard editor.

The theme applies to the embedded giving card. Stripe hosts and styles its separate checkout page. The standalone page after returning from Stripe uses the default theme.
