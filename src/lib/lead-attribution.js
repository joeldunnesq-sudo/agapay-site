// Generated from src/lib/lead-attribution.ts by npm run build:server. Do not edit.
import { htmlEscape } from './format.js';
import { sanitizeAttribution } from '../../public/attribution-core.js';
function attributionEmail(attribution) {
  if (!attribution) return { html: '', text: '' };
  const lines = [];
  for (const [key, label, pageLabel, timeLabel] of [
    ['firstTouch', 'First touch', 'Landing page', 'First visited'],
    ['lastTouch', 'Last touch', 'Conversion page', 'Submitted'],
  ]) {
    const touch = attribution[key];
    if (!touch) continue;
    lines.push(`${label}: ${touch.category}`);
    for (const [field, title] of [
      ['source', 'Source'],
      ['medium', 'UTM Medium'],
      ['campaign', 'UTM Campaign'],
      ['content', 'UTM Content'],
      ['term', 'UTM Term'],
      ['rawReferrer', 'Referrer'],
      ['referringUrl', 'Referring page'],
      ['page', pageLabel],
    ]) {
      if (touch[field]) lines.push(`${title}: ${touch[field]}`);
    }
    if (touch.timestamp)
      lines.push(
        `${timeLabel}: ${new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          dateStyle: 'long',
          timeStyle: 'short',
        }).format(new Date(touch.timestamp))} (America/Chicago)`
      );
    lines.push('');
  }
  const text = lines.length
    ? `Referral Attribution

${lines.join('\n')}`
    : '';
  return {
    text,
    html: text
      ? `<div style="margin-top:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;">${htmlEscape(text)}</div>`
      : '',
  };
}
export { attributionEmail, sanitizeAttribution };
