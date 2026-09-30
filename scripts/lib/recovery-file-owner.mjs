// An unchanged object may have lost its live reference while retaining its
// previously verified owner. A changed/unsettled object cannot reuse that proof.
export function fileOwnerEvidence(object, reference, registered) {
  const historical = registered?.state === 'stored' && registered.etag === object.etag ? registered.parish_id : '';
  const owners = new Set([object.metadataOwner, reference?.parishId, historical].filter(Boolean));
  const parishId = [...owners][0] || '';
  return {
    parishId,
    conflict: owners.size > 1 || Boolean(parishId && registered?.parish_id && registered.parish_id !== parishId),
    unsettled: Boolean(registered && !['stored', 'deleted'].includes(registered.state)),
    evidence: [
      ...new Set([
        ...(object.metadataOwner ? ['r2_custom_metadata'] : []),
        ...(reference ? [...reference.sources] : []),
        ...(historical ? ['verified_registry_etag'] : []),
      ]),
    ].sort(),
  };
}
