// Generated from src/lib/directory-invitation-next.ts by npm run build:server. Do not edit.
function directoryInvitationNext(value) {
  return typeof value === 'string' && /^\/myagapay\/directory\?invite=[a-f0-9]{64}$/.test(value) ? value : '';
}
export { directoryInvitationNext };
