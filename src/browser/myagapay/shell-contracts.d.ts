// Shared contract for the existing classic-script shell; no runtime module is emitted.
interface Window {
  MyAgapayShell?: {
    authHeaders(extra?: Record<string, string>): Record<string, string>;
    handleUnauthorized(response: Response): boolean;
  };
}
