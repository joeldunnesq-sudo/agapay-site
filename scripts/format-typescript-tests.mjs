import assert from 'node:assert/strict';
import { absoluteWebsiteUrl, htmlEscape, monthLabel, slugify, parishSlug } from '../src/lib/format.js';

for (const value of [undefined, null, '', false, 0, NaN]) {
  assert.equal(absoluteWebsiteUrl(value), '');
  assert.equal(htmlEscape(value), '');
  assert.equal(slugify(value), '');
  assert.equal(parishSlug(value), 'parish');
}
assert.equal(absoluteWebsiteUrl('  example.org/path?q=1  '), 'https://example.org/path?q=1');
assert.equal(absoluteWebsiteUrl('HTTP://example.org'), 'HTTP://example.org');
assert.equal(absoluteWebsiteUrl('//example.org'), 'https:////example.org');
assert.equal(absoluteWebsiteUrl('mailto:office@example.org'), 'https://mailto:office@example.org');
assert.equal(htmlEscape('<a title="A&B">\'hello\'</a>'), "&lt;a title=&quot;A&amp;B&quot;&gt;'hello'&lt;/a&gt;");
assert.equal(htmlEscape('&amp;'), '&amp;amp;');
assert.equal(htmlEscape({ toString: () => '<custom>' }), '&lt;custom&gt;');
assert.equal(htmlEscape(42), '42');
assert.equal(monthLabel(0), 'Jan');
assert.equal(monthLabel(11), 'Dec');
for (const index of [-1, 12, 1.5, NaN, Infinity]) assert.equal(monthLabel(index), '');
assert.equal(monthLabel('2'), 'Mar', 'Legacy JavaScript string indices retain their behavior');
assert.equal(slugify('  Saints Peter & Paul!  '), 'saints-peter-and-paul');
assert.equal(slugify('Église Saint-Élie'), 'glise-saint-lie');
assert.equal(slugify('a'.repeat(79) + ' b'), 'a'.repeat(79) + '-', 'Retain truncation after separator trimming');
assert.equal(parishSlug('Holy Trinity Greek Orthodox Church', 'Chicago'), 'holy-trinity-chicago');
assert.equal(parishSlug('St. Mary Parish', 'Austin'), 'st-mary-austin');
assert.equal(parishSlug('Austin Church', 'Austin'), 'austin');
assert.equal(parishSlug('Holy Trinity Chicago', 'Chicago'), 'holy-trinity-chicago');
assert.equal(parishSlug('Church', ''), 'church', 'Retain original-name fallback after suffix removal');
assert.equal(parishSlug('', 'Chicago'), 'parish-chicago');
assert.equal(parishSlug('a'.repeat(79), 'b'), 'a'.repeat(79), 'Trim the truncated city separator');
const failure = new Error('coercion failed');
const hostile = {
  toString() {
    throw failure;
  },
};
for (const format of [absoluteWebsiteUrl, htmlEscape, slugify, parishSlug]) {
  assert.throws(
    () => format(hostile),
    (error) => error === failure
  );
}
console.log(
  'PASS - shared formatting preserves escaping, coercion, URL defaults, month lookup, and stable parish slugs'
);
