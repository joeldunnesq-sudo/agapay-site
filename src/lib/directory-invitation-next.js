// Only this exact local destination is carried through account creation. Do not
// store its raw invitation token in donor records, logs, or browser storage.
export function directoryInvitationNext(value) {
  return typeof value === 'string' && /^\/myagapay\/directory\?invite=[a-f0-9]{64}$/.test(value) ? value : '';
}
