// Generated from src/routes/registry.ts by npm run build:server. Do not edit.
async function dispatchRouteRegistries(registries, context) {
  for (const registry of registries) {
    const response = await registry(context);
    if (response != null) return response;
  }
  return null;
}
export { dispatchRouteRegistries };
