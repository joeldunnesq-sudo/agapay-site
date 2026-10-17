// Generated from src/learn/stored-record-validation.ts by npm run build:server. Do not edit.
function isJsonRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function optionalStrings(record, fields) {
  return fields.every((field) => record[field] === void 0 || typeof record[field] === 'string');
}
function isResourceFlag(value) {
  return (
    isJsonRecord(value) &&
    typeof value.email === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.createdAt === 'string'
  );
}
function isCommunityResource(value) {
  return (
    isJsonRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    optionalStrings(value, [
      'source',
      'title',
      'url',
      'description',
      'subtitle',
      'status',
      'sharedBy',
      'submittedBy',
      'householdId',
      'createdAt',
      'updatedAt',
      'curatedBy',
    ]) &&
    (value.vetted === void 0 || typeof value.vetted === 'boolean') &&
    (value.pinned === void 0 || typeof value.pinned === 'boolean') &&
    (value.flags === void 0 || (Array.isArray(value.flags) && value.flags.every(isResourceFlag)))
  );
}
function isFeedbackNotification(value) {
  return (
    isJsonRecord(value) &&
    typeof value.status === 'string' &&
    optionalStrings(value, ['error', 'body', 'sentAt']) &&
    (value.httpStatus === void 0 || typeof value.httpStatus === 'string' || typeof value.httpStatus === 'number')
  );
}
function isLearnFeedback(value) {
  return (
    isJsonRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.status === 'string' &&
    optionalStrings(value, [
      'subject',
      'submittedBy',
      'createdAt',
      'updatedAt',
      'seenAt',
      'consideredAt',
      'consideredBy',
    ]) &&
    (value.userNotification === void 0 ||
      value.userNotification === null ||
      isFeedbackNotification(value.userNotification))
  );
}
export { isCommunityResource, isJsonRecord, isLearnFeedback };
