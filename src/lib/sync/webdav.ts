import { Card } from "@/lib/types";
import { SyncAdapter, SyncResult, PullResult, WebDAVConfig } from "./types";

function normalizeUrl(serverUrl: string, remotePath: string, filename: string): string {
  const base = serverUrl.replace(/\/$/, "");
  const path = remotePath.replace(/\/$/, "");
  return `${base}${path}/${filename}`;
}

function basicAuth(username: string, password: string): string {
  const credentials = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${credentials}`;
}

async function davRequest(
  url: string,
  method: string,
  config: WebDAVConfig,
  body?: BodyInit,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: basicAuth(config.username, config.password),
      ...extraHeaders,
    },
    body,
  });
  return res;
}

async function ensureDirectory(url: string, config: WebDAVConfig): Promise<void> {
  const res = await davRequest(url, "PROPFIND", config, undefined, {
    Depth: "0",
  });

  if (res.status === 404) {
    const mkcol = await davRequest(url, "MKCOL", config);
    if (!mkcol.ok && mkcol.status !== 405) {
      // 405 = Method Not Allowed, often means collection already exists.
      throw new Error(`Failed to create directory: ${mkcol.status} ${await mkcol.text()}`);
    }
  } else if (!res.ok && res.status !== 207) {
    throw new Error(`Failed to access directory: ${res.status} ${await res.text()}`);
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

const BACKUP_FILE_RE = /glean-backup-(\d{4}-\d{2}-\d{2})\.json/;
const BACKUP_RETENTION_COUNT = 30;

/** List dated backup files and delete anything older than the retention count. */
async function cleanupOldBackups(dirUrl: string, config: WebDAVConfig): Promise<void> {
  try {
    const res = await davRequest(dirUrl, "PROPFIND", config, undefined, {
      Depth: "1",
    });

    if (!res.ok) return;

    const text = await res.text();
    const names: string[] = [];
    const nameRe = /<(?:[^:>]+:)?displayname>([^<]+)<\/[^>]+>/gi;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(text)) !== null) {
      names.push(m[1]);
    }

    const dated = names
      .map((name) => {
        const match = BACKUP_FILE_RE.exec(name);
        return match ? { name, date: match[1] } : null;
      })
      .filter((item): item is { name: string; date: string } => item !== null)
      .sort((a, b) => b.date.localeCompare(a.date));

    const toDelete = dated.slice(BACKUP_RETENTION_COUNT);
    for (const item of toDelete) {
      const url = `${dirUrl}/${item.name}`;
      await davRequest(url, "DELETE", config);
    }
  } catch {
    // Retention cleanup is best-effort; don't fail the sync if listing fails.
  }
}

export const webdavAdapter: SyncAdapter<WebDAVConfig> = {
  name: "WebDAV",

  validate(config) {
    if (!config.serverUrl.trim()) return "Server URL is required";
    if (!config.username.trim()) return "Username is required";
    if (!config.password.trim()) return "Password is required";
    if (!config.remotePath.trim()) return "Remote path is required";
    return null;
  },

  async sync(cards, config) {
    const dirUrl = `${config.serverUrl.replace(/\/$/, "")}${config.remotePath.replace(/\/$/, "")}`;
    await ensureDirectory(dirUrl, config);

    const payload = JSON.stringify(cards, null, 2);
    const latestUrl = normalizeUrl(config.serverUrl, config.remotePath, "glean-backup-latest.json");
    const datedUrl = normalizeUrl(
      config.serverUrl,
      config.remotePath,
      `glean-backup-${formatDate(Date.now())}.json`
    );

    const putLatest = await davRequest(latestUrl, "PUT", config, payload, {
      "Content-Type": "application/json",
    });
    if (!putLatest.ok) {
      throw new Error(`Failed to upload latest backup: ${putLatest.status} ${await putLatest.text()}`);
    }

    const putDated = await davRequest(datedUrl, "PUT", config, payload, {
      "Content-Type": "application/json",
    });
    if (!putDated.ok) {
      throw new Error(`Failed to upload dated backup: ${putDated.status} ${await putDated.text()}`);
    }

    await cleanupOldBackups(dirUrl, config);

    return { ok: true, syncedAt: Date.now() };
  },

  async pull(config) {
    const latestUrl = normalizeUrl(config.serverUrl, config.remotePath, "glean-backup-latest.json");
    const res = await davRequest(latestUrl, "GET", config);

    if (res.status === 404) {
      return { ok: true, cards: [] };
    }
    if (!res.ok) {
      return { ok: false, error: `Failed to download backup: ${res.status} ${await res.text()}` };
    }

    try {
      const data = await res.json();
      if (!Array.isArray(data)) {
        return { ok: false, error: "Remote backup is not a valid array" };
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
      return { ok: false, error: `Failed to parse backup JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
