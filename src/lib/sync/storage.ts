import { SavedSyncConfig, SyncProvider, ProviderConfig } from "./types";
import { getProviderMeta } from "./registry";

const SYNC_CONFIG_KEY = "glean_sync_config";

export async function getSyncConfig(): Promise<SavedSyncConfig | null> {
  try {
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
    return (result[SYNC_CONFIG_KEY] as SavedSyncConfig) ?? null;
  } catch {
    return null;
  }
}

export async function saveSyncConfig(config: SavedSyncConfig): Promise<void> {
  await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: config });
}

export async function clearSyncConfig(): Promise<void> {
  await chrome.storage.local.remove(SYNC_CONFIG_KEY);
}

export function makeDefaultConfig(provider: SyncProvider): ProviderConfig {
  return getProviderMeta(provider).defaultConfig;
}
