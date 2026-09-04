function storeAssociationResponse(request, payload) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function androidAssetLinks(request, env) {
  const fingerprints = String(env.ANDROID_APP_SIGNING_SHA256 || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  if (!fingerprints.length) return storeAssociationResponse(request, []);
  return storeAssociationResponse(request, [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.ANDROID_APP_PACKAGE_ID || 'app.agapay.myagapay',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}

export function appleAppSiteAssociation(request, env) {
  const teamId = String(env.APPLE_DEVELOPER_TEAM_ID || '')
    .trim()
    .toUpperCase();
  const bundleId = String(env.APPLE_APP_BUNDLE_ID || 'app.agapay.myagapay').trim();
  const details = /^[A-Z0-9]{10}$/.test(teamId)
    ? [
        {
          appIDs: [`${teamId}.${bundleId}`],
          components: [
            { '/': '/myagapay/*', comment: 'Open My AGAPAY routes in the app.' },
            { '/': '/account-deletion', comment: 'Open account privacy controls in the app.' },
            { '/': '/learn/pricing*', exclude: true, comment: 'Keep Learn purchases on the public website.' },
          ],
        },
      ]
    : [];
  return storeAssociationResponse(request, { applinks: { details } });
}
