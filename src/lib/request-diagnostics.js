import { corsJson } from './core.js';
import { logEvent } from './logging.js';
import { requestContext, safeErrorClass, safeRequestRoute } from './request-context.js';

export function withRequestDiagnostics(handler) {
  return {
    ...handler,
    async fetch(request, env, ctx) {
      const context = {
        requestId: crypto.randomUUID(),
        route: safeRequestRoute(request),
        method: request.method,
        startedAt: Date.now(),
        deploymentVersion: env?.AGAPAY_BUILD_SHA || 'unknown',
      };
      return requestContext.run(context, async () => {
        let response;
        let errorClass;
        try {
          response = await handler.fetch(request, env, ctx);
        } catch (error) {
          errorClass = safeErrorClass(error);
          response = corsJson(
            {
              error: 'Unable to complete your request. Please contact support with this reference.',
              requestId: context.requestId,
            },
            env,
            { status: 500 }
          );
        }
        if (response.status >= 400) {
          await logEvent(env, {
            eventType: 'request.failed',
            severity: response.status >= 500 ? 'error' : 'warn',
            metadata: {
              status: response.status,
              errorClass: errorClass || (response.status >= 500 ? 'http_server_error' : 'http_client_error'),
            },
          });
        }
        // Preserve streaming bodies, status, cookies, and Cloudflare response properties.
        const result = new Response(response.body, response);
        result.headers.set('X-Request-ID', context.requestId);
        const exposed = result.headers.get('Access-Control-Expose-Headers');
        result.headers.set('Access-Control-Expose-Headers', exposed ? `${exposed}, X-Request-ID` : 'X-Request-ID');
        return result;
      });
    },
  };
}
