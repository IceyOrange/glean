import { Card } from "@/lib/types";

export type SyncProvider = "notion" | "nutstore" | "webdav" | "gist";

export interface SyncResult {
  ok: boolean;
  syncedAt?: number;
  error?: string;
  databaseId?: string;
  gistId?: string;
  mergedCount?: number;
  /** Notion pages archived because they shared a Glean ID with another page. */
  dedupedCount?: number;
}

export interface PullResult {
  ok: boolean;
  cards?: Card[];
  error?: string;
  databaseId?: string;
}

/** Notion provider config — discriminated by `provider: "notion"`. */
export interface NotionConfig {
  provider: "notion";
  token: string;
  databaseId?: string;
}

/** WebDAV / Nutstore provider config — discriminated by `provider: "webdav" | "nutstore"`. */
export interface WebDAVConfig {
  provider: "webdav" | "nutstore";
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string;
}

/** GitHub Gist provider config — discriminated by `provider: "gist"`. */
export interface GistConfig {
  provider: "gist";
  token: string;
  gistId?: string;
  filename: string;
}

/** Discriminated union of all provider configs. Use type guards to narrow. */
export type ProviderConfig = NotionConfig | WebDAVConfig | GistConfig;

/** Type guard: narrows ProviderConfig to NotionConfig. */
export function isNotionConfig(config: ProviderConfig): config is NotionConfig {
  return config.provider === "notion";
}

/** Type guard: narrows ProviderConfig to WebDAVConfig. */
export function isWebDAVConfig(config: ProviderConfig): config is WebDAVConfig {
  return config.provider === "webdav" || config.provider === "nutstore";
}

/** Type guard: narrows ProviderConfig to GistConfig. */
export function isGistConfig(config: ProviderConfig): config is GistConfig {
  return config.provider === "gist";
}

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
