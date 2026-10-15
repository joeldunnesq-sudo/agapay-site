import DOMPurify from '../vendor/dompurify.es.mjs?v=3.4.14';

export function renderSanitizedMarkup(target: Element, markup: unknown) {
  target.innerHTML = DOMPurify.sanitize(String(markup || ''));
}
