import { SyncAdapter, SyncProviderMeta, SyncProvider, ProviderConfig } from "./types";
import { notionAdapter } from "./notion";
import { webdavAdapter } from "./webdav";
import { gistAdapter } from "./gist";

export const SYNC_PROVIDERS: SyncProviderMeta[] = [
  {
    id: "notion",
    labelKey: "syncNotion",
    descriptionKey: "syncNotionDesc",
    defaultConfig: { provider: "notion", token: "" },
  },
  {
    id: "nutstore",
    labelKey: "syncNutstore",
    descriptionKey: "syncNutstoreDesc",
    defaultConfig: {
      provider: "nutstore",
      serverUrl: "https://dav.jianguoyun.com/dav/",
      username: "",
      password: "",
      remotePath: "/Glean/",
    },
  },
  {
    id: "webdav",
    labelKey: "syncWebdav",
    descriptionKey: "syncWebdavDesc",
    defaultConfig: {
      provider: "webdav",
      serverUrl: "",
      username: "",
      password: "",
      remotePath: "/Glean/",
    },
  },
  {
    id: "gist",
    labelKey: "syncGist",
    descriptionKey: "syncGistDesc",
    defaultConfig: { provider: "gist", token: "", filename: "glean-backup.json" },
  },
];

const WEBDAV_PROVIDERS: SyncProvider[] = ["nutstore", "webdav"];

export function isWebDAVProvider(provider: SyncProvider): boolean {
  return WEBDAV_PROVIDERS.includes(provider);
}

export function getAdapter(provider: SyncProvider): SyncAdapter<ProviderConfig> {
  switch (provider) {
    case "notion":
      return notionAdapter as SyncAdapter<ProviderConfig>;
    case "nutstore":
    case "webdav":
      return webdavAdapter as SyncAdapter<ProviderConfig>;
    case "gist":
      return gistAdapter as SyncAdapter<ProviderConfig>;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

export function getProviderMeta(provider: SyncProvider): SyncProviderMeta {
  const meta = SYNC_PROVIDERS.find((p) => p.id === provider);
  if (!meta) throw new Error(`Unknown provider: ${provider}`);
  return meta;
}
