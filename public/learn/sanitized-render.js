import DOMPurify from '../vendor/dompurify.es.mjs?v=3.4.14';

export function renderSanitizedMarkup(target, markup) {
  target.innerHTML = DOMPurify.sanitize(String(markup || ''));
}
