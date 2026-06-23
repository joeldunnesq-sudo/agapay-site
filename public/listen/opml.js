/**
 * AGAPAY Listen — OPML Import / Export
 * Standard OPML 2.0 format — compatible with Overcast, Pocket Casts,
 * Castro, Apple Podcasts, and every major podcast app.
 */

/**
 * Parse an OPML file string.
 * Returns an array of { title, xmlUrl, htmlUrl, description }
 */
export function importOpml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const outlines = [...doc.querySelectorAll('outline[type="rss"], outline[xmlUrl]')];
  return outlines
    .map(el => ({
      title:       el.getAttribute('title') || el.getAttribute('text') || 'Untitled',
      xmlUrl:      el.getAttribute('xmlUrl') || '',
      htmlUrl:     el.getAttribute('htmlUrl') || '',
      description: el.getAttribute('description') || '',
    }))
    .filter(f => f.xmlUrl);
}

/**
 * Generate an OPML file string from an array of subscription objects.
 * Each sub: { title, xmlUrl, image? }
 */
export function exportOpml(subs) {
  const now = new Date().toUTCString();
  const outlines = subs.map(s =>
    `    <outline type="rss" text="${xmlEsc(s.title)}" title="${xmlEsc(s.title)}" xmlUrl="${xmlEsc(s.xmlUrl)}"${s.image ? ` imageUrl="${xmlEsc(s.image)}"` : ''}/>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>AGAPAY Listen Subscriptions</title>
    <dateCreated>${now}</dateCreated>
    <dateModified>${now}</dateModified>
    <ownerName>AGAPAY Listen</ownerName>
  </head>
  <body>
    <outline text="Subscriptions" title="Subscriptions">
${outlines}
    </outline>
  </body>
</opml>`;
}

function xmlEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
