import * as core from './core.js';
import type { StorageEnvironment } from './storage.js';
export { hasProductionStore, missingProductionStoreResponse } from './core.js';
// Stored settings are opaque through this contract; the legacy core facade remains compatible.
export const d1GetSetting: (env: StorageEnvironment, key: string) => Promise<unknown> = core.d1GetSetting;
export const d1SetSetting: (env: StorageEnvironment, key: string, value: unknown) => Promise<void> = core.d1SetSetting;
