type RouteResult = Response | null | undefined;
type AwaitableResult = RouteResult | Promise<RouteResult>;

export interface DirectoryActions<TEnv> {
  handleDirectoryAdmin(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleDirectoryIntake(request: Request, env: TEnv): AwaitableResult;
  handleDirectoryMedia(request: Request, env: TEnv): AwaitableResult;
  handleDirectoryMember(request: Request, env: TEnv): AwaitableResult;
  handleDirectorySelfService(request: Request, env: TEnv): AwaitableResult;
}

export interface DirectoryRouteContext<TEnv> {
  request: Request;
  env: TEnv;
  url: URL;
  actions: DirectoryActions<TEnv>;
}

export async function routeDirectoryRequest<TEnv>({ request, env, url, actions }: DirectoryRouteContext<TEnv>) {
  if (url.pathname === '/api/directory/intake') {
    return actions.handleDirectoryIntake(request, env);
  }

  const adminMatch = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)\/directory\/admin(?:\/.*)?$/);
  if (adminMatch) {
    return (await actions.handleDirectoryAdmin(request, env, decodeURIComponent(adminMatch[1]))) || null;
  }
  if (url.pathname.startsWith('/api/directory/member')) {
    return (await actions.handleDirectoryMember(request, env)) || null;
  }
  if (url.pathname.startsWith('/api/directory/media/')) {
    return (await actions.handleDirectoryMedia(request, env)) || null;
  }
  if (url.pathname.startsWith('/api/directory/')) {
    return (await actions.handleDirectorySelfService(request, env)) || null;
  }
  return null;
}
