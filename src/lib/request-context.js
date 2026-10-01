// Generated from src/lib/request-context.ts by npm run build:server. Do not edit.
import { AsyncLocalStorage } from 'node:async_hooks';
const requestContext = new AsyncLocalStorage();
function safeErrorClass(error) {
  try {
    const name = error?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
    if (name === 'SyntaxError') return 'invalid_data';
    if (name === 'TypeError') return 'type_error';
    if (name === 'RangeError') return 'range_error';
  } catch {}
  return 'unexpected_error';
}
const FAMILIES = /* @__PURE__ */ new Set([
  'admin',
  'parish',
  'donor',
  'learn',
  'accounting',
  'directory',
  'public',
  'stripe',
  'auth',
  'organizations',
]);
const ENDPOINTS = /* @__PURE__ */ new Set(['contact', 'health', 'register', 'waitlist']);
function safeRequestRoute(request) {
  const path = new URL(request.url).pathname;
  const [, api, family] = path.split('/');
  if (api !== 'api') return '/assets/*';
  if (ENDPOINTS.has(family) && path === `/api/${family}`) return path;
  return FAMILIES.has(family) ? `/api/${family}/*` : '/api/*';
}
export { requestContext, safeErrorClass, safeRequestRoute };
