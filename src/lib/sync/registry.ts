import { SyncAdapter, SyncProviderMeta, SyncProvider, ProviderConfig } from "./types";
import { notionAdapter } from "./notion";
import { nutstoreAdapter } from "./nutstore";

export const SYNC_PROVIDERS: SyncProviderMeta[] = [
  {
    id: "notion",
    labelKey: "syncNotion",
    descriptionKey: "syncNotionDesc",
    defaultConfig: { token: "" },
  },
  {
    id: "nutstore",
    labelKey: "syncNutstore",
    descriptionKey: "syncNutstoreDesc",
    defaultConfig: {
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "",
      password: "",
      remotePath: "/Glean/",
    },
  },
];

export function getAdapter(provider: SyncProvider): SyncAdapter<ProviderConfig> {
  switch (provider) {
    case "notion":
      return notionAdapter as SyncAdapter<ProviderConfig>;
    case "nutstore":
      return nutstoreAdapter as SyncAdapter<ProviderConfig>;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getProviderMeta(provider: SyncProvider): SyncProviderMeta {
  const meta = SYNC_PROVIDERS.find((p) => p.id === provider);
  if (!meta) throw new Error(`Unknown provider: ${provider}`);
  return meta;
}
