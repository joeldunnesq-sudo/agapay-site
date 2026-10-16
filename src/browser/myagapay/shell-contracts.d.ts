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
    activeProduct(pathname?: string): string;
    clearSession(): void;
    ensureParishLifeBackLink(pathname?: string): void;
    isMyAgapayMainPage(pathname?: string): boolean;
    isProtectedPath(pathname?: string): boolean;
    normalizeProductNavs(root?: Document | HTMLElement): void;
    productNav(active?: string, className?: string): string;
    setParishCapabilities(
      parish?: ShellParishCapabilities | null,
      options?: { persist?: boolean; authoritative?: boolean }
    ): void;
    redirectToLogin(reason?: string): void;
    session(): { email: string; token: string };
    syncAuthVisibility(root?: Document | HTMLElement): void;
    finishPageHydration(): void;
    viewport(): 'desktop' | 'mobile';
    authHeaders(extra?: Record<string, string>): Record<string, string>;
    handleUnauthorized(response: Response): boolean;
    setFeedUnreadCount(count: number): void;
    setGroupsUnreadCount(count: number): void;
    setTeachingUnreadCount(count: number): void;
    capabilitiesLoaded(): boolean;
    parishLifeExperience(parish?: ShellParishCapabilities | null): { communicationsEnabled: boolean; label: string };
    icons: { menu: string };
    initializeMobileAppMenus(root?: Document | HTMLElement): void;
    openSupportDialog(): void;
  };
}
