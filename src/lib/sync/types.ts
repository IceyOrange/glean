import { Card } from "@/lib/types";

export type SyncProvider = "notion" | "nutstore" | "webdav";

export interface SyncResult {
  ok: boolean;
  syncedAt?: number;
  error?: string;
  databaseId?: string;
}

export interface PullResult {
  ok: boolean;
  cards?: Card[];
  error?: string;
  databaseId?: string;
}

export interface NotionConfig {
  token: string;
  databaseId?: string;
}

export interface WebDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string;
}

export type ProviderConfig = NotionConfig | WebDAVConfig;

export interface SavedSyncConfig {
  provider: SyncProvider;
  enabled: boolean;
  config: ProviderConfig;
  /** Per-provider saved configs so switching providers doesn't lose credentials. */
  providerConfigs: Partial<Record<SyncProvider, ProviderConfig>>;
  lastSyncAt?: number;
  lastError?: string;
}

export interface SyncAdapter<C extends ProviderConfig = ProviderConfig> {
  name: string;
  validate(config: C): string | null;
  sync(cards: Card[], config: C): Promise<SyncResult>;
  pull?(config: C): Promise<PullResult>;
}

export interface SyncProviderMeta {
  id: SyncProvider;
  labelKey: string;
  descriptionKey: string;
  defaultConfig: ProviderConfig;
}
