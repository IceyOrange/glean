import { SyncAdapter, SyncProviderMeta, SyncProvider, ProviderConfig } from "./types";
import { notionAdapter } from "./notion";
import { webdavAdapter } from "./webdav";

const WEBDAV_DEFAULTS = {
  serverUrl: "",
  username: "",
  password: "",
  remotePath: "/Glean/",
};

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
  {
    id: "webdav",
    labelKey: "syncWebdav",
    descriptionKey: "syncWebdavDesc",
    defaultConfig: WEBDAV_DEFAULTS,
  },
  {
    id: "koofr",
    labelKey: "syncKoofr",
    descriptionKey: "syncKoofrDesc",
    defaultConfig: {
      ...WEBDAV_DEFAULTS,
      serverUrl: "https://app.koofr.net/dav/Koofr",
    },
  },
  {
    id: "pcloud",
    labelKey: "syncPcloud",
    descriptionKey: "syncPcloudDesc",
    defaultConfig: {
      ...WEBDAV_DEFAULTS,
      serverUrl: "https://ewebdav.pcloud.com",
    },
  },
  {
    id: "infini",
    labelKey: "syncInfini",
    descriptionKey: "syncInfiniDesc",
    defaultConfig: {
      ...WEBDAV_DEFAULTS,
      serverUrl: "",
    },
  },
];

const WEBDAV_PROVIDERS: SyncProvider[] = ["nutstore", "webdav", "koofr", "pcloud", "infini"];

export function isWebDAVProvider(provider: SyncProvider): boolean {
  return WEBDAV_PROVIDERS.includes(provider);
}

export function getAdapter(provider: SyncProvider): SyncAdapter<ProviderConfig> {
  switch (provider) {
    case "notion":
      return notionAdapter as SyncAdapter<ProviderConfig>;
    case "nutstore":
    case "webdav":
    case "koofr":
    case "pcloud":
    case "infini":
      return webdavAdapter as SyncAdapter<ProviderConfig>;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getProviderMeta(provider: SyncProvider): SyncProviderMeta {
  const meta = SYNC_PROVIDERS.find((p) => p.id === provider);
  if (!meta) throw new Error(`Unknown provider: ${provider}`);
  return meta;
}
