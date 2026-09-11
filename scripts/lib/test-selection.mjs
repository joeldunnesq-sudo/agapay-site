// Conservative impact groups for the local `test:changed` shortcut. CI still
// runs the full manifest; shared tooling and unmapped executable code do too.
export function changedGroups(files) {
  const paths = files.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));
  if (!paths.length) return ['core'];
  if (paths.some((file) => /^(?:package(?:-lock)?\.json|eslint\.config\.js|scripts\/|config\/|\.github\/)/.test(file)))
    return ['all'];
  const groups = new Set();
  for (const file of paths) {
    const matched = new Set();
    if (
      /^(?:src\/accounting\/|src\/handlers\/accounting|accounting-migrations\/|migrations\/.*accounting)/.test(file)
    ) {
      matched.add('accounting');
      matched.add('release-gates');
    }
    if (/directory/i.test(file)) matched.add('directory');
    if (/sacrament/i.test(file)) matched.add('sacraments');
    if (/^(?:public\/parish\/|src\/routes\/parish|src\/routes\/stewardship)/.test(file)) matched.add('parish-ui');
    if (
      /^public\/(?:donor\/|myagapay(?:\/|-)|scripts\/consumer-passkeys\.js|service-worker\.js|pwa-register\.js)/.test(
        file
      )
    ) {
      matched.add('donor-ui');
      matched.add('precheck');
      matched.add('core');
    }
    if (/^public\/scripts\/privileged-mfa\.js/.test(file)) matched.add('precheck');
    if (/^src\/(?:lib|handlers)\/(?:consumer-passkeys|mfa)/.test(file)) matched.add('precheck');
    if (/^(?:src\/(?:worker|routes\/|handlers\/|lib\/)|migrations\/|accounting-migrations\/|docs\/)/.test(file))
      matched.add('core');
    if (!matched.size) return ['all'];
    for (const group of matched) groups.add(group);
  }
  return groups.has('all') ? ['all'] : [...groups];
}
