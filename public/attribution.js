import { captureTouch, readUtms, sanitizeTouch } from './attribution-core.js';

const FIRST_KEY = 'agapay.attribution.first.v1';
const VISIT_KEY = 'agapay.attribution.visit.v1';
const RETENTION = 90 * 24 * 60 * 60 * 1000;
const VISIT_TIMEOUT = 30 * 60 * 1000;
let firstTouch;
let visit;
function read(key) {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory-only fallback. */ }
}
function initialize() {
  const now = Date.now();
  const arrival = captureTouch(window.location.href, document.referrer, new Date(now).toISOString());
  firstTouch = sanitizeTouch(read(FIRST_KEY));
  if (!firstTouch || now - Date.parse(firstTouch.timestamp) >= RETENTION) {
    firstTouch = arrival;
    write(FIRST_KEY, firstTouch);
  }
  const previous = read(VISIT_KEY);
  let internal = false;
  try { internal = new URL(document.referrer).origin === window.location.origin; } catch { /* Direct arrival. */ }
  const explicit = Object.values(readUtms(window.location.href)).some(Boolean);
  const priorTouch = sanitizeTouch(previous?.touch);
  const sameCampaign = priorTouch && Object.entries(readUtms(window.location.href)).every(([key, value]) => !value || value === priorTouch[key]);
  visit = internal && (!explicit || sameCampaign) && priorTouch && now - previous.seenAt < VISIT_TIMEOUT
    ? { touch: priorTouch, seenAt: now } : { touch: arrival, seenAt: now };
  write(VISIT_KEY, visit);
}
export function getAttribution() {
  try {
    if (!visit) initialize();
    const current = captureTouch(window.location.href, document.referrer, new Date().toISOString());
    const explicit = Object.entries(current.currentUtms).some(([key, value]) => value && value !== visit.touch[key]);
    const lastTouch = { ...(explicit ? current : visit.touch), page: current.page,
      timestamp: current.timestamp, referringUrl: current.referringUrl, currentUtms: current.currentUtms };
    visit.seenAt = Date.now();
    write(VISIT_KEY, visit);
    return { version: 1, firstTouch, lastTouch };
  } catch { return null; }
}
window.getAgapayAttribution = getAttribution;
try { initialize(); } catch { /* Attribution must never block a form. */ }
