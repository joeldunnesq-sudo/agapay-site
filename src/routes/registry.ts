export type RouteRegistry<TContext, TResult = Response> = (
  context: TContext
) => TResult | null | undefined | Promise<TResult | null | undefined>;

export async function dispatchRouteRegistries<TContext, TResult>(
  registries: Iterable<RouteRegistry<TContext, TResult>>,
  context: TContext
): Promise<NonNullable<TResult> | null> {
  for (const registry of registries) {
    const response = await registry(context);
    if (response != null) return response;
  }
  return null;
}
