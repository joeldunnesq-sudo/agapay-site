// Read boundary only; settings authorization and persistence remain in legacy JavaScript.
export function getDirectorySettings(
  env: Partial<Env>,
  parishId: string
): Promise<{
  parishId: string;
  directoryEnabled: boolean;
  ordinaryMemberAccessEnabled: boolean;
  persisted: boolean;
}>;
