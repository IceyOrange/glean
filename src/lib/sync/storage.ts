import { SavedSyncConfig, SyncProvider, ProviderConfig, NotionConfig, WebDAVConfig, GistConfig, isNotionConfig, isWebDAVConfig, isGistConfig } from "./types";
import { getProviderMeta, SYNC_PROVIDERS, isWebDAVProvider } from "./registry";
import { setSecret, getSecret, removeSecret } from "@/lib/secrets";

const SYNC_CONFIG_KEY = "glean_sync_config";

// Secret storage keys — one per provider credential field.
const SECRET_KEY_NOTION_TOKEN = "glean_sync_secret_notion_token";
const SECRET_KEY_GIST_TOKEN = "glean_sync_secret_gist_token";
const SECRET_KEY_WEBDAV_PASSWORD = (provider: SyncProvider) =>
  `glean_sync_secret_${provider}_password`;

/**
 * Extract secret fields from a ProviderConfig, returning:
 * - `safe`: the config with secrets replaced by empty strings (safe for plaintext storage)
 * - `secrets`: map of secret-key → secret-value
 */
function extractSecrets(config: ProviderConfig): {
  safe: ProviderConfig;
  secrets: Map<string, string>;
} {
  const secrets = new Map<string, string>();

  if (isNotionConfig(config)) {
    secrets.set(SECRET_KEY_NOTION_TOKEN, config.token);
    const safe: NotionConfig = { ...config, token: "" };
    return { safe, secrets };
  }

  if (isWebDAVConfig(config)) {
    secrets.set(SECRET_KEY_WEBDAV_PASSWORD(config.provider), config.password);
    const safe: WebDAVConfig = { ...config, password: "" };
    return { safe, secrets };
  }

  if (isGistConfig(config)) {
    secrets.set(SECRET_KEY_GIST_TOKEN, config.token);
    const safe: GistConfig = { ...config, token: "" };
    return { safe, secrets };
  }

  // Exhaustive check — should never reach here.
  const _exhaustive: never = config;
  return { safe: _exhaustive, secrets };
}

/**
 * Merge decrypted secrets back into a safe config.
 * If a secret is not found (decryption failed / never encrypted),
 * the field stays empty — the caller handles migration separately.
 */
function mergeSecrets(safe: ProviderConfig, secrets: Map<string, string>): ProviderConfig {
  if (isNotionConfig(safe)) {
    const token = secrets.get(SECRET_KEY_NOTION_TOKEN) ?? safe.token;
    return { ...safe, token };
  }

  if (isWebDAVConfig(safe)) {
    const password = secrets.get(SECRET_KEY_WEBDAV_PASSWORD(safe.provider)) ?? safe.password;
    return { ...safe, password };
  }

  if (isGistConfig(safe)) {
    const token = secrets.get(SECRET_KEY_GIST_TOKEN) ?? safe.token;
    return { ...safe, token };
  }

  const _exhaustive: never = safe;
  return _exhaustive;
}

/**
 * Check whether a ProviderConfig still has plaintext credentials (pre-migration).
 * Returns the secrets map if plaintext values are found.
 */
function detectPlaintextSecrets(config: ProviderConfig): Map<string, string> | null {
  const secrets = new Map<string, string>();
  let found = false;

  if (isNotionConfig(config) && config.token) {
    secrets.set(SECRET_KEY_NOTION_TOKEN, config.token);
    found = true;
  }

  if (isWebDAVConfig(config) && config.password) {
    secrets.set(SECRET_KEY_WEBDAV_PASSWORD(config.provider), config.password);
    found = true;
  }

  if (isGistConfig(config) && config.token) {
    secrets.set(SECRET_KEY_GIST_TOKEN, config.token);
    found = true;
  }

  return found ? secrets : null;
}

export async function getSyncConfig(): Promise<SavedSyncConfig | null> {
  try {
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
    const raw = result[SYNC_CONFIG_KEY] as SavedSyncConfig | undefined;
    if (!raw) return null;

    // Migration: add providerConfigs if missing (pre-existing configs)
    if (!raw.providerConfigs) {
      raw.providerConfigs = { [raw.provider]: raw.config };
    }

    // Migration: add provider discriminator if missing (pre-discriminated-union configs)
    if (!raw.config.provider) {
      raw.config = Object.assign({}, raw.config, { provider: raw.provider }) as ProviderConfig;
    }
    for (const [key, cfg] of Object.entries(raw.providerConfigs)) {
      if (cfg && !cfg.provider) {
        (raw.providerConfigs as Record<string, ProviderConfig>)[key] =
          Object.assign({}, cfg, { provider: key as SyncProvider }) as ProviderConfig;
      }
    }

    // Decrypt secrets for the active config
    const activeSecrets = new Map<string, string>();
    if (isNotionConfig(raw.config)) {
      const token = await getSecret<string>(SECRET_KEY_NOTION_TOKEN);
      if (token !== null) activeSecrets.set(SECRET_KEY_NOTION_TOKEN, token);
    } else if (isWebDAVConfig(raw.config)) {
      const password = await getSecret<string>(SECRET_KEY_WEBDAV_PASSWORD(raw.config.provider));
      if (password !== null) activeSecrets.set(SECRET_KEY_WEBDAV_PASSWORD(raw.config.provider), password);
    } else if (isGistConfig(raw.config)) {
      const token = await getSecret<string>(SECRET_KEY_GIST_TOKEN);
      if (token !== null) activeSecrets.set(SECRET_KEY_GIST_TOKEN, token);
    }
    raw.config = mergeSecrets(raw.config, activeSecrets);

    // Decrypt secrets for each provider in providerConfigs
    for (const [key, cfg] of Object.entries(raw.providerConfigs)) {
      if (!cfg) continue;
      const providerKey = key as SyncProvider;
      const pSecrets = new Map<string, string>();
      if (isNotionConfig(cfg)) {
        const token = await getSecret<string>(SECRET_KEY_NOTION_TOKEN);
        if (token !== null) pSecrets.set(SECRET_KEY_NOTION_TOKEN, token);
      } else if (isWebDAVConfig(cfg)) {
        const password = await getSecret<string>(SECRET_KEY_WEBDAV_PASSWORD(cfg.provider));
        if (password !== null) pSecrets.set(SECRET_KEY_WEBDAV_PASSWORD(cfg.provider), password);
      } else if (isGistConfig(cfg)) {
        const token = await getSecret<string>(SECRET_KEY_GIST_TOKEN);
        if (token !== null) pSecrets.set(SECRET_KEY_GIST_TOKEN, token);
      }
      (raw.providerConfigs as Record<string, ProviderConfig>)[key] = mergeSecrets(cfg, pSecrets);
    }

    // Migration: if decrypted secrets are empty but plaintext values exist, migrate them
    const needsMigration =
      detectPlaintextSecrets(raw.config) !== null ||
      Object.values(raw.providerConfigs).some(
        (cfg) => cfg && detectPlaintextSecrets(cfg) !== null
      );

    if (needsMigration) {
      // Re-save will encrypt the plaintext credentials
      await saveSyncConfig(raw);
    }

    return raw;
  } catch {
    return null;
  }
}

export async function saveSyncConfig(config: SavedSyncConfig): Promise<void> {
  // Extract and encrypt secrets from the active config
  const { safe: safeActive, secrets: activeSecrets } = extractSecrets(config.config);
  for (const [key, value] of activeSecrets) {
    if (value) {
      await setSecret(key, value);
    } else {
      await removeSecret(key);
    }
  }

  // Extract and encrypt secrets from each provider config
  const safeProviderConfigs: Partial<Record<SyncProvider, ProviderConfig>> = {};
  for (const [key, cfg] of Object.entries(config.providerConfigs)) {
    if (!cfg) continue;
    const { safe, secrets } = extractSecrets(cfg);
    for (const [sKey, value] of secrets) {
      if (value) {
        await setSecret(sKey, value);
      } else {
        await removeSecret(sKey);
      }
    }
    safeProviderConfigs[key as SyncProvider] = safe;
  }

  // Save the config with secrets stripped (empty strings) as plaintext
  const safeConfig: SavedSyncConfig = {
    ...config,
    config: safeActive,
    providerConfigs: safeProviderConfigs,
  };

  await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: safeConfig });
}

export async function clearSyncConfig(): Promise<void> {
  // Remove encrypted secrets for every known provider. Drives off
  // SYNC_PROVIDERS so a newly added provider is covered without touching this.
  await removeSecret(SECRET_KEY_NOTION_TOKEN);
  await removeSecret(SECRET_KEY_GIST_TOKEN);
  for (const meta of SYNC_PROVIDERS) {
    if (isWebDAVProvider(meta.id)) {
      await removeSecret(SECRET_KEY_WEBDAV_PASSWORD(meta.id));
    }
  }
  await chrome.storage.local.remove(SYNC_CONFIG_KEY);
}

export function makeDefaultConfig(provider: SyncProvider): ProviderConfig {
  return getProviderMeta(provider).defaultConfig;
}
