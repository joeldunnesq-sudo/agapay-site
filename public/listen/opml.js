// Generated from src/browser/listen/opml.ts by npm run build:browser. Do not edit.
import DOMPurify from '../vendor/dompurify.es.mjs?v=3.4.17';
function importOpml(text) {
  const xml = String(text ?? '');
  if (/<!DOCTYPE\s|<!ENTITY\s/i.test(xml)) return [];
  const source = xml.replace(/^\uFEFF?\s*<\?xml\s[^?]*\?>/i, '');
  const attributes = ['version', 'type', 'text', 'title', 'xmlUrl', 'htmlUrl', 'description', 'imageUrl'];
  const doc = DOMPurify.sanitize(source, {
    PARSER_MEDIA_TYPE: 'application/xhtml+xml',
    // DOMPurify's pinned namespace map uses the key 'null' for XML xmlns="".
    ALLOWED_NAMESPACES: ['http://www.w3.org/1999/xhtml', 'null'],
    ALLOWED_TAGS: ['opml', 'head', 'body', 'outline', 'title', 'dateCreated', 'dateModified', 'ownerName'],
    ALLOWED_ATTR: attributes,
    // These are inert OPML metadata, not HTML href/src attributes. URLs are checked below.
    ADD_URI_SAFE_ATTR: attributes,
    RETURN_DOM: true,
  });
  if (!doc) return [];
  const outlines = [...doc.querySelectorAll('outline[type="rss"], outline[xmlUrl]')];
  return outlines
    .map((el) => ({
      title: boundedText(el.getAttribute('title') || el.getAttribute('text') || 'Untitled', 240),
      xmlUrl: safeWebUrl(el.getAttribute('xmlUrl')),
      htmlUrl: safeWebUrl(el.getAttribute('htmlUrl')),
      description: boundedText(el.getAttribute('description'), 1200),
    }))
    .filter((f) => f.xmlUrl);
}
function boundedText(value, limit) {
  return String(value || '')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
function safeWebUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}
function exportOpml(subs) {
  const now = /* @__PURE__ */ new Date().toUTCString();
  const outlines = subs
    .map(
      (s) =>
        `    <outline type="rss" text="${xmlEsc(s.title)}" title="${xmlEsc(s.title)}" xmlUrl="${xmlEsc(s.xmlUrl)}"${s.image ? ` imageUrl="${xmlEsc(s.image)}"` : ''}/>`
    )
    .join('\n');
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
export { exportOpml, importOpml };
