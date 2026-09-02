# AGAPAY Giving Box

Organizations can place their verified AGAPAY giving experience on any website with two lines of HTML. In the AGAPAY dashboard, use **Copy embed code** to get a snippet containing the organization's actual public ID and URL.

```html
<div data-agapay-giving="your-organization-id"><a href="https://agapay.app/give/embed/your-organization-id" target="_blank" rel="noopener">Give securely with AGAPAY</a></div>
<script async src="https://agapay.app/giving-box.js"></script>
```

The link inside the container is a no-JavaScript fallback. When the loader runs, it replaces that link with the responsive giving box and safely adjusts the frame height as the donor moves through the flow.

## Optional defaults

Add any of these attributes to the `data-agapay-giving` element:

| Attribute | Example | Purpose |
| --- | --- | --- |
| `data-amount` | `50` | Preselect a gift amount from $1 to $50,000. |
| `data-frequency` | `monthly` | Preselect `once`, `monthly`, `quarterly`, or `yearly`. |
| `data-fund` | `Scholarship Fund` | Preselect a fund by its public ID or exact name. |
| `data-max-width` | `680` | Set a maximum width from 280–1,200 pixels. |
| `data-align` | `left` | Align the box `left`, `center` (default), or `right`. |
| `data-height` | `760` | Set the initial height while the box loads. |
| `data-loading` | `eager` | Load immediately instead of lazily. |
| `data-title` | `Support our academy` | Provide a custom accessible iframe title. |

For example:

```html
<div data-agapay-giving="your-organization-id" data-frequency="monthly" data-fund="Scholarship Fund" data-max-width="680"></div>
<script async src="https://agapay.app/giving-box.js"></script>
```

Multiple giving boxes can appear on one page. Include the loader script once; it discovers boxes added before or after the script loads.

## Content Security Policy

Sites with a restrictive Content Security Policy need to allow `https://agapay.app` in both `script-src` and `frame-src`. Checkout opens through the AGAPAY frame and is completed securely with Stripe.

## Events and manual mounting

The container emits `agapay:mounted` when its frame is ready and `agapay:resize` when its height changes. Sites that add markup through a framework may also call:

```js
window.AGAPAYGivingBox.scan();
```

The loader validates both the message origin and the sending frame before applying resize messages.
