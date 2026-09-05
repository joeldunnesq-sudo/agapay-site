import { AsyncLocalStorage } from 'node:async_hooks';

// AsyncLocalStorage isolates overlapping requests without mutating shared bindings.
export const requestContext = new AsyncLocalStorage();

export function safeErrorClass(error) {
  try {
    const name = error?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
    if (name === 'SyntaxError') return 'invalid_data';
    if (name === 'TypeError') return 'type_error';
    if (name === 'RangeError') return 'range_error';
  } catch {
    /* Error objects may have hostile accessors. */
  }
  return 'unexpected_error';
}

// Dynamic path segments can contain emails, access tokens, or private record IDs.
// Log a bounded route family, never the raw URL, query string, or dynamic suffix.
const FAMILIES = new Set([
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
const ENDPOINTS = new Set(['contact', 'health', 'register', 'waitlist']);
export function safeRequestRoute(request) {
  const path = new URL(request.url).pathname;
  const [, api, family] = path.split('/');
  if (api !== 'api') return '/assets/*';
  if (ENDPOINTS.has(family) && path === `/api/${family}`) return path;
  return FAMILIES.has(family) ? `/api/${family}/*` : '/api/*';
}
