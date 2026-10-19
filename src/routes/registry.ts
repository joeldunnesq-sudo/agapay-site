export type RouteRegistry<TContext> = (
  context: TContext
) => Response | null | undefined | Promise<Response | null | undefined>;

export async function dispatchRouteRegistries<TContext>(
  registries: readonly RouteRegistry<TContext>[],
  context: TContext
): Promise<Response | null> {
  for (const registry of registries) {
    const response = await registry(context);
    if (response != null) return response;
  }
  return null;
}
