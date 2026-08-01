import { Card } from "@/lib/types";
import { SyncAdapter, GistConfig } from "./types";

const GITHUB_API = "https://api.github.com";

async function gistFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.ok) {
    return (await res.json()) as T;
  }

  const body = await res.text();
  throw new Error(`GitHub ${res.status}: ${body}`);
}

interface GistResponse {
  id: string;
  description?: string;
  files?: Record<string, { filename: string; content?: string }>;
}

interface GistListResponse {
  id: string;
  description?: string;
  files?: Record<string, { filename: string }>;
}

export const gistAdapter: SyncAdapter<GistConfig> = {
  name: "GitHub Gist",

  validate(config) {
    if (!config.token.trim()) return "GitHub token is required";
    return null;
  },

  async sync(cards, config) {
    const content = JSON.stringify(cards);

    if (config.gistId) {
      // Update existing gist
      await gistFetch<GistResponse>(config.token, `/gists/${config.gistId}`, {
        method: "PATCH",
        body: JSON.stringify({
          files: { [config.filename]: { content } },
        }),
      });

      return { ok: true, syncedAt: Date.now() };
    }

    // Create a new gist
    const data = await gistFetch<GistResponse>(config.token, "/gists", {
      method: "POST",
      body: JSON.stringify({
        description: "Glean backup",
        public: false,
        files: { [config.filename]: { content } },
      }),
    });

    return { ok: true, syncedAt: Date.now(), gistId: data.id };
  },

  async pull(config) {
    if (!config.gistId) {
      return { ok: true, cards: [] };
    }

    try {
      const gist = await gistFetch<GistResponse>(
        config.token,
        `/gists/${config.gistId}`
      );

      const file = gist.files?.[config.filename];
      if (!file?.content) {
        return { ok: true, cards: [] };
      }

      const data = JSON.parse(file.content);
      if (!Array.isArray(data)) {
        return { ok: false, error: "Gist content is not a valid array" };
      }

      const cards = data.filter(
        (item: unknown): item is Card =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Card).id === "string" &&
          typeof (item as Card).content === "string" &&
          typeof (item as Card).source === "object" &&
          typeof (item as Card).createdAt === "number"
      );

      return { ok: true, cards };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to pull from Gist: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/** Search the authenticated user's gists. */
export async function searchGists(
  token: string
): Promise<Array<{ id: string; title: string }>> {
  const data = await gistFetch<GistListResponse[]>(
    token,
    "/gists?per_page=100"
  );

  return data.map((gist) => {
    const filenames = gist.files ? Object.keys(gist.files) : [];
    const firstFile = filenames[0] || "Untitled";
    const desc = gist.description?.trim();
    const title = desc || firstFile;
    return { id: gist.id, title };
  });
}
