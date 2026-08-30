export async function routeDirectoryRequest({ request, env, url, actions }) {
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
