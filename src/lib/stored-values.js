// Generated from src/lib/stored-values.ts by npm run build:server. Do not edit.
function storedField(value, key) {
  if (value === null || value === void 0) return void 0;
  return Reflect.get(Object(value), key, value);
}
function storedObject(value) {
  return Object(value);
}
function storedDateMilliseconds(value) {
  const date = Reflect.construct(Date, [value]);
  return date.getTime();
}
export { storedDateMilliseconds, storedField, storedObject };
