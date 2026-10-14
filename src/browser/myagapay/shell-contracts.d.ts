// Shared contract for the existing classic-script shell; no runtime module is emitted.
interface Window {
  AGAPAYDonorSession: {
    authHeaders(extra?: Record<string, string>): Record<string, string>;
    profile(): AppHeaderDonorProfile | null;
    setProfile(profile: AppHeaderDonorProfile): void;
    clearSession(): void;
  };
  MyAgapayShell?: {
    authHeaders(extra?: Record<string, string>): Record<string, string>;
    handleUnauthorized(response: Response): boolean;
    setFeedUnreadCount(count: number): void;
    icons: { menu: string };
    initializeMobileAppMenus(root?: Document | HTMLElement): void;
    openSupportDialog(): void;
  };
}
