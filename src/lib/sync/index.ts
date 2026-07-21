import { Card } from "@/lib/types";
import { SyncResult } from "./types";
import { getAdapter } from "./registry";
import { getSyncConfig, saveSyncConfig } from "./storage";

export * from "./types";
export * from "./storage";
export * from "./registry";
export { notionAdapter, searchDatabases } from "./notion";
export { webdavAdapter } from "./webdav";

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

  try {
    const result = await adapter.sync(cards, saved.config);

    // Persist a discovered Notion database id back into the config so future
    // syncs don't need to search for it again.
    const nextConfig: typeof saved.config =
      saved.provider === "notion" && result.databaseId
        ? { ...(saved.config as { token: string; databaseId?: string }), databaseId: result.databaseId }
        : saved.config;

    await saveSyncConfig({
      ...saved,
      config: nextConfig,
      providerConfigs: { ...saved.providerConfigs, [saved.provider]: nextConfig },
      lastSyncAt: result.ok ? Date.now() : saved.lastSyncAt,
      lastError: result.ok ? undefined : result.error,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveSyncConfig({
      ...saved,
      lastError: message,
    });
    return { ok: false, error: message };
  }
}
