// Shared contract for the existing classic-script shell; no runtime module is emitted.
interface Window {
  AGAPAYDonorSession: {
    storageKeys: Readonly<{
      email: string;
      token: string;
      profile: string;
      learnPlan: string;
      parishCapabilities: string;
      navigationTransition: string;
    }>;
    session(): { email: string; token: string };
    saveSession(
      payload: { token?: string; donor?: AppHeaderDonorProfile } | null | undefined,
      fallbackEmail?: string
    ): void;
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
