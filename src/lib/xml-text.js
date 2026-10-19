// Generated from src/lib/xml-text.ts by npm run build:server. Do not edit.
const NAMED_XML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
});
function decodedCodePoint(value, radix) {
  const point = Number.parseInt(value, radix);
  if (!Number.isInteger(point) || point < 0 || point > 1114111 || (point >= 55296 && point <= 57343)) return '';
  return String.fromCodePoint(point);
}
function decodeXmlEntities(value = '') {
  return String(value).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, named) => {
    if (decimal) return decodedCodePoint(decimal, 10);
    if (hexadecimal) return decodedCodePoint(hexadecimal, 16);
    return NAMED_XML_ENTITIES[String(named || '').toLowerCase()] ?? entity;
  });
}
function markupToText(value, preserveLines) {
  const source = String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  let result = '';
  let cursor = 0;
  let suppressedTag = '';
  while (cursor < source.length) {
    if (source[cursor] !== '<') {
      if (!suppressedTag) result += source[cursor];
      cursor += 1;
      continue;
    }
    const close = source.indexOf('>', cursor + 1);
    if (close < 0) {
      if (!suppressedTag) result += ' ';
      break;
    }
    const tag = source
      .slice(cursor + 1, close)
      .trim()
      .toLowerCase();
    if (tag.startsWith('script') || tag.startsWith('style'))
      suppressedTag = tag.startsWith('script') ? 'script' : 'style';
    if (suppressedTag && tag.startsWith(`/${suppressedTag}`)) suppressedTag = '';
    const lineBreak = preserveLines && (/^br\b/.test(tag) || /^\/?p\b/.test(tag));
    result += lineBreak ? '\n' : ' ';
    cursor = close + 1;
  }
  return result;
}
function plainTextFromMarkup(value = '', { limit = 1200, preserveLines = false } = {}) {
  const decoded = decodeXmlEntities(markupToText(value, preserveLines)).replace(/[<>]/g, ' ');
  const normalized = preserveLines
    ? decoded.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n')
    : decoded.replace(/\s+/g, ' ');
  return normalized.trim().slice(0, limit);
}
function plainXmlAttribute(value = '', limit = 8e3) {
  return decodeXmlEntities(value).replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
export { decodeXmlEntities, plainTextFromMarkup, plainXmlAttribute };
