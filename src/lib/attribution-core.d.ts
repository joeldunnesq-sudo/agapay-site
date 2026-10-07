// Describe the existing shared browser/server JS sanitizer without publishing a new static asset.
// The path suffix identifies its existing imports; the implementation remains unmigrated.
declare module '*public/attribution-core.js' {
  export interface AttributionTouch {
    [field: string]: unknown;
    timestamp?: string;
  }
  export interface AttributionInput {
    firstTouch?: AttributionTouch | null;
    lastTouch?: AttributionTouch | null;
  }
  export function sanitizeAttribution(
    value: unknown,
    submittedAt?: string
  ): {
    version: number;
    firstTouch: AttributionTouch | null;
    lastTouch: AttributionTouch | null;
  } | null;
}
