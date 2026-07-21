import { SavedSyncConfig, SyncProvider, ProviderConfig } from "./types";
import { getProviderMeta } from "./registry";

const SYNC_CONFIG_KEY = "glean_sync_config";

export async function getSyncConfig(): Promise<SavedSyncConfig | null> {
  try {
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
    const raw = result[SYNC_CONFIG_KEY] as SavedSyncConfig | undefined;
    if (!raw) return null;
    // Migration: add providerConfigs if missing (pre-existing configs)
    if (!raw.providerConfigs) {
      raw.providerConfigs = { [raw.provider]: raw.config };
    }
    return raw;
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
