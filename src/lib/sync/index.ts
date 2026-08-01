import { Card } from "@/lib/types";
import { SyncResult, PullResult, ProviderConfig, isNotionConfig, isGistConfig } from "./types";
import { getAdapter } from "./registry";
import { getSyncConfig, saveSyncConfig } from "./storage";
import { saveAllCards, pruneTombstones } from "@/lib/storage";
import { mergeCards } from "./merge";

export * from "./types";
export * from "./storage";
export * from "./registry";
export { mergeCards } from "./merge";
export { notionAdapter, searchDatabases } from "./notion";
export { webdavAdapter } from "./webdav";
export { gistAdapter, searchGists } from "./gist";

/** The one remote origin needed by a configured provider. */
export function syncPermissionUrl(config: ProviderConfig): string {
  switch (config.provider) {
    case "notion":
      return "https://api.notion.com";
    case "gist":
      return "https://api.github.com";
    case "nutstore":
    case "webdav":
      return config.serverUrl;
  }
}

// `syncCards` remains the pure-ish worker used by tests. Production callers
// go through the background service worker (`requestSync`), which is the only
// context allowed to start a run and therefore serialises manual and alarm
// syncs. This storage lock is a best-effort safety net for older extension
// pages during an update; it is not relied on for correctness.
const SYNC_LOCK_KEY = "glean_sync_lock";
const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

async function acquireSyncLock(): Promise<boolean> {
  const now = Date.now();
  const stored = await chrome.storage.local.get(SYNC_LOCK_KEY);
  const ts = (stored[SYNC_LOCK_KEY] as number | undefined) ?? 0;
  if (now - ts < SYNC_LOCK_TTL_MS) return false;
  await chrome.storage.local.set({ [SYNC_LOCK_KEY]: now });
  return true;
}

export async function syncCards(cards: Card[]): Promise<SyncResult> {
  const saved = await getSyncConfig();
  if (!saved || !saved.enabled) {
    return { ok: false, error: "Sync is not configured or disabled" };
  }

  const adapter = getAdapter(saved.provider);
  const validationError = adapter.validate(saved.config);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  if (!(await acquireSyncLock())) {
    return { ok: false, error: "sync_in_progress" };
  }

  try {
    // ── Pull ──
    let remoteCards: Card[] = [];
    let pullDatabaseId: string | undefined;

    if (adapter.pull) {
      const pullResult: PullResult = await adapter.pull(saved.config);
      if (!pullResult.ok) {
        // Pull failed — still attempt push so local data isn't lost, but
        // report the pull error.
        const pushResult = await adapter.sync(cards, saved.config);
        let nextConfig = saved.config;
        if (isNotionConfig(saved.config) && pushResult.databaseId) {
          nextConfig = { ...saved.config, databaseId: pushResult.databaseId };
        }
        if (isGistConfig(saved.config) && pushResult.gistId) {
          nextConfig = { ...saved.config, gistId: pushResult.gistId };
        }
        await saveSyncConfig({
          ...saved,
          config: nextConfig,
          providerConfigs: { ...saved.providerConfigs, [saved.provider]: nextConfig },
          lastSyncAt: pushResult.ok ? Date.now() : saved.lastSyncAt,
          lastError: pullResult.error,
        });
        return { ...pushResult, error: pullResult.error };
      }
      remoteCards = pullResult.cards ?? [];
      pullDatabaseId = pullResult.databaseId;
    }

    // ── Merge ──
    const merged = mergeCards(cards, remoteCards);
    // A simpler metric: how many remote cards were new/updated vs local.
    const newFromRemote = remoteCards.filter(
      (rc) => !cards.some((lc) => lc.id === rc.id)
    ).length;
    const updatedFromRemote = remoteCards.filter((rc) => {
      const lc = cards.find((c) => c.id === rc.id);
      if (!lc) return false;
      const localTs = lc.updatedAt ?? lc.createdAt;
      const remoteTs = rc.updatedAt ?? rc.createdAt;
      return remoteTs > localTs;
    }).length;

    // Write merged result back to local storage.
    await saveAllCards(merged);

    // Prune expired tombstones (best-effort, don't block sync).
    void pruneTombstones().catch(() => {});

    // ── Push ──
    const result = await adapter.sync(merged, saved.config);

    // Persist a discovered Notion database id back into the config so future
    // syncs don't need to search for it again.
    let nextConfig = saved.config;
    const effectiveDatabaseId = result.databaseId ?? pullDatabaseId;
    if (isNotionConfig(saved.config) && effectiveDatabaseId) {
      nextConfig = { ...saved.config, databaseId: effectiveDatabaseId };
    }
    if (isGistConfig(saved.config) && result.gistId) {
      nextConfig = { ...saved.config, gistId: result.gistId };
    }

    await saveSyncConfig({
      ...saved,
      config: nextConfig,
      providerConfigs: { ...saved.providerConfigs, [saved.provider]: nextConfig },
      lastSyncAt: result.ok ? Date.now() : saved.lastSyncAt,
      lastError: result.ok ? undefined : result.error,
    });

    return {
      ...result,
      mergedCount: newFromRemote + updatedFromRemote,
      databaseId: effectiveDatabaseId ?? result.databaseId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSyncConfig({
      ...saved,
      lastError: message,
    });
    return { ok: false, error: message };
  } finally {
    // Best-effort release; the TTL covers contexts that die mid-sync.
    await chrome.storage.local.remove(SYNC_LOCK_KEY).catch(() => {});
  }
}

/** Request the single background-owned sync queue. */
export async function requestSync(): Promise<SyncResult> {
  return chrome.runtime.sendMessage({ type: "syncNow" }) as Promise<SyncResult>;
}
