import { Card } from "@/lib/types";

export type SyncProvider = "notion" | "nutstore" | "webdav" | "koofr" | "pcloud" | "infini";

export interface SyncResult {
  ok: boolean;
  syncedAt?: number;
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
  lastSyncAt?: number;
  lastError?: string;
}

export interface SyncAdapter<C extends ProviderConfig = ProviderConfig> {
  name: string;
  validate(config: C): string | null;
  sync(cards: Card[], config: C): Promise<SyncResult>;
}

export interface SyncProviderMeta {
  id: SyncProvider;
  labelKey: string;
  descriptionKey: string;
  defaultConfig: ProviderConfig;
}
