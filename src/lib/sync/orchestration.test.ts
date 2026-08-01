import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncCards } from "./index";
import { saveAllCards } from "@/lib/storage";
import { getAdapter } from "./registry";
import { getSyncConfig, saveSyncConfig } from "./storage";
import { Card } from "@/lib/types";

vi.mock("./registry", () => ({ getAdapter: vi.fn() }));
vi.mock("./storage", () => ({
  getSyncConfig: vi.fn(),
  saveSyncConfig: vi.fn(async () => {}),
}));
vi.mock("@/lib/storage", () => ({
  getCards: vi.fn(async () => []),
  saveAllCards: vi.fn(async () => {}),
  pruneTombstones: vi.fn(async () => 0),
}));

// In-memory chrome.storage.local mock for the cross-context sync lock.
const chromeStore = new Map<string, unknown>();
(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: chromeStore.get(key) }),
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) chromeStore.set(k, v);
      },
      remove: async (key: string) => {
        chromeStore.delete(key);
      },
    },
  },
};

const localCard: Card = {
  id: "l1",
  content: "local quote",
  source: { url: "https://example.com/l", title: "Local" },
  createdAt: 1000,
  updatedAt: 1000,
};

const remoteCard: Card = {
  id: "r1",
  content: "remote quote",
  source: { url: "https://example.com/r", title: "Remote" },
  createdAt: 2000,
  updatedAt: 2000,
};

function setupAdapter(overrides: Partial<{
  pull: () => Promise<{ ok: boolean; cards?: Card[]; error?: string }>;
  pushedCards?: Card[][];
}> = {}) {
  const pushed: Card[][] = [];
  const adapter = {
    name: "Mock",
    validate: () => null,
    pull:
      overrides.pull ??
      (async () => ({ ok: true, cards: [remoteCard] })),
    sync: vi.fn(async (cards: Card[]) => {
      pushed.push(cards);
      return { ok: true, syncedAt: Date.now() };
    }),
  };
  vi.mocked(getAdapter).mockReturnValue(adapter as never);
  vi.mocked(getSyncConfig).mockResolvedValue({
    provider: "notion",
    enabled: true,
    config: { provider: "notion", token: "t", databaseId: "db" },
    providerConfigs: {},
  } as never);
  return { adapter, pushed };
}

describe("syncCards orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeStore.clear();
  });

  it("pulls, merges, and writes remote-only cards back to local storage", async () => {
    const { adapter, pushed } = setupAdapter();

    const result = await syncCards([localCard]);

    expect(result.ok).toBe(true);
    expect(result.mergedCount).toBe(1);

    // The merged list written to storage must contain BOTH sides.
    const written = vi.mocked(saveAllCards).mock.calls[0][0];
    expect(written.map((c) => c.id).sort()).toEqual(["l1", "r1"]);

    // And the push receives the merged list, not just the local input.
    expect(pushed[0].map((c) => c.id).sort()).toEqual(["l1", "r1"]);
    expect(adapter.sync).toHaveBeenCalledTimes(1);
  });

  it("applies a remote tombstone to the local copy", async () => {
    setupAdapter({
      pull: async () => ({
        ok: true,
        cards: [{ ...localCard, updatedAt: 5000, deletedAt: 5000 }],
      }),
    });

    const result = await syncCards([localCard]);

    expect(result.ok).toBe(true);
    const written = vi.mocked(saveAllCards).mock.calls[0][0];
    expect(written).toHaveLength(1);
    expect(written[0].deletedAt).toBe(5000);
  });

  it("still pushes when pull fails, and reports the pull error", async () => {
    const { adapter } = setupAdapter({
      pull: async () => ({ ok: false, error: "network down" }),
    });

    const result = await syncCards([localCard]);

    expect(result.error).toBe("network down");
    expect(adapter.sync).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveAllCards)).not.toHaveBeenCalled();
    expect(vi.mocked(saveSyncConfig)).toHaveBeenCalled();
  });

  it("skips when another context holds the sync lock (no duplicate sync)", async () => {
    const { adapter } = setupAdapter();
    // Simulate a sync already running elsewhere (e.g. the background alarm).
    chromeStore.set("glean_sync_lock", Date.now());

    const result = await syncCards([localCard]);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("sync_in_progress");
    expect(adapter.sync).not.toHaveBeenCalled();
    expect(vi.mocked(saveAllCards)).not.toHaveBeenCalled();
    // A skip is not a failure — it must not clobber lastError/lastSyncAt.
    expect(vi.mocked(saveSyncConfig)).not.toHaveBeenCalled();
  });

  it("releases the lock after completion so the next sync can run", async () => {
    setupAdapter();

    const first = await syncCards([localCard]);
    expect(first.ok).toBe(true);
    expect(chromeStore.has("glean_sync_lock")).toBe(false);

    const second = await syncCards([localCard]);
    expect(second.ok).toBe(true);
  });

  it("treats a stale lock (older than the TTL) as abandoned and syncs anyway", async () => {
    const { adapter } = setupAdapter();
    chromeStore.set("glean_sync_lock", Date.now() - 6 * 60 * 1000);

    const result = await syncCards([localCard]);

    expect(result.ok).toBe(true);
    expect(adapter.sync).toHaveBeenCalledTimes(1);
  });
});
