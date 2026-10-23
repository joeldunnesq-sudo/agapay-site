// Generated from src/browser/learn/sanitized-render.ts by npm run build:browser. Do not edit.
import DOMPurify from '../vendor/dompurify.es.mjs?v=3.4.17';
function renderSanitizedMarkup(target, markup) {
  target.innerHTML = DOMPurify.sanitize(String(markup || ''));
}
export { renderSanitizedMarkup };
