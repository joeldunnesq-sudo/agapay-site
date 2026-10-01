import { json, corsJson, corsHeaders } from '../../src/lib/http-responses.js';
import { withRequestDiagnostics } from '../../src/lib/request-diagnostics.js';

declare const env: Env;
corsJson({ ok: true }, env, { status: 201, headers: { 'X-Test': 'yes' } });
corsHeaders(null);
json(null);
// @ts-expect-error: this helper spreads records rather than normalizing Headers.
json({}, { headers: new Headers() });
// @ts-expect-error: header values must be strings.
corsJson({}, env, { headers: { 'X-Count': 4 } });
const scheduled = async (_event: ScheduledController, _env: Env, _ctx: ExecutionContext) => {
  void [_event, _env, _ctx];
};
const wrapped = withRequestDiagnostics({
  scheduled,
  label: 'worker',
  fetch(_request: Request, _env: Env, _ctx: ExecutionContext) {
    void [_request, _env, _ctx];
    return new Response('ok');
  },
});
declare const ctx: ExecutionContext;
const response: Promise<Response> = wrapped.fetch(new Request('https://example.test'), env, ctx);
const preserved: typeof scheduled = wrapped.scheduled;
void response;
void preserved;
// @ts-expect-error: preserve the original handler's required environment bindings.
void wrapped.fetch(new Request('https://example.test'), {}, ctx);
// @ts-expect-error: preserve execution-context requirements.
void wrapped.fetch(new Request('https://example.test'), env, {});
withRequestDiagnostics({
  // @ts-expect-error: fetch handlers must return a Response or a Promise of one.
  fetch() {
    return 'not a response';
  },
});
