import { getCards } from "@/lib/storage";
import { syncCards } from "@/lib/sync";
import type { SyncResult } from "@/lib/sync";

let activeSync: Promise<SyncResult> | null = null;

function runSync(): Promise<SyncResult> {
  if (activeSync) return activeSync;
  activeSync = getCards()
    .then((cards) => syncCards(cards))
    .finally(() => {
      activeSync = null;
    });
  return activeSync;
}

export default defineBackground(() => {
  // Open a tab from content scripts (which can't call chrome.tabs directly).
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "openTab" && msg.url) {
      const url = msg.url as string;
      const journalBase = chrome.runtime.getURL("journal.html");
      void chrome.tabs.query({ url: `${journalBase}*` }).then((tabs) => {
        if (tabs.length > 0 && tabs[0].id !== undefined) {
          chrome.tabs.update(tabs[0].id, { active: true, url });
        } else {
          chrome.tabs.create({ url });
        }
      });
    }

    if (msg.type === "syncNow") {
      void runSync()
        .then(sendResponse)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          sendResponse({ ok: false, error: message } satisfies SyncResult);
        });
      return true;
    }
  });

  // Automatic cloud sync when the user has enabled it.
  // syncCards now performs pull-merge-push (bidirectional).
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "glean-sync") {
      void runSync().catch((err) => {
        console.error("Glean automatic sync failed:", err);
      });
    }
  });
});
