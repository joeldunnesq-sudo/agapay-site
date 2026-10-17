import type {
  CommunityResource,
  LearnFeedback,
  ResourceFlag,
  FeedbackNotification,
} from './community-store-contracts.js';

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalStrings(record: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => record[field] === undefined || typeof record[field] === 'string');
}

function isResourceFlag(value: unknown): value is ResourceFlag {
  return (
    isJsonRecord(value) &&
    typeof value.email === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.createdAt === 'string'
  );
}

export function isCommunityResource(value: unknown): value is CommunityResource {
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
    (value.vetted === undefined || typeof value.vetted === 'boolean') &&
    (value.pinned === undefined || typeof value.pinned === 'boolean') &&
    (value.flags === undefined || (Array.isArray(value.flags) && value.flags.every(isResourceFlag)))
  );
}

function isFeedbackNotification(value: unknown): value is FeedbackNotification {
  return (
    isJsonRecord(value) &&
    typeof value.status === 'string' &&
    optionalStrings(value, ['error', 'body', 'sentAt']) &&
    (value.httpStatus === undefined || typeof value.httpStatus === 'string' || typeof value.httpStatus === 'number')
  );
}

export function isLearnFeedback(value: unknown): value is LearnFeedback {
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
    (value.userNotification === undefined ||
      value.userNotification === null ||
      isFeedbackNotification(value.userNotification))
  );
}
