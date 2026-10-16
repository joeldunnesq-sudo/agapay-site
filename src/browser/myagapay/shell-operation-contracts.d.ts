interface ShellParishCapabilities {
  sacramentsEnabled?: boolean;
  libraryEnabled?: boolean;
  directoryEnabled?: boolean;
  bookstoreEnabled?: boolean;
  communicationsEnabled?: boolean;
  signupsEnabled?: boolean;
  exchangeEnabled?: boolean;
  prayerRequestsEnabled?: boolean;
  parishLifeLabel?: string;
  parishLifeAvailable?: boolean;
}
interface ShellNavigationMarker {
  startedAt: number;
  fromPath: string;
  destinationPath: string;
}

interface ShellProduct {
  id: string;
  href: string;
  label: string;
  mobileLabel?: string;
  short: string;
  icon: string;
  deferUntilCapabilitiesLoaded?: boolean;
  parishFeature?: keyof ShellParishCapabilities;
  mobileFallbackFor?: keyof ShellParishCapabilities;
  desktopHidden?: boolean;
}
