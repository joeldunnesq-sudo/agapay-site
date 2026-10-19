// Preserve JavaScript's property-access and spread semantics for legacy values
// while keeping the values unknown at storage boundaries.
export function storedField(value: unknown, key: string): unknown {
  if (value === null || value === undefined) return undefined;
  return Reflect.get(Object(value), key, value);
}

export function storedObject(value: unknown): object {
  return Object(value);
}

export function storedDateMilliseconds(value: unknown): number {
  // Preserve the Date constructor's native coercions (including invalid dates).
  const date: Date = Reflect.construct(Date, [value]);
  return date.getTime();
}
