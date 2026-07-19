import { getCards } from "@/lib/storage";
import { syncCards } from "@/lib/sync";

export default defineBackground(() => {
  console.log("Glean background started");

  // Open a tab from content scripts (which can't call chrome.tabs directly).
  chrome.runtime.onMessage.addListener((msg) => {
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
  });

  // Keep the extension's journal page out of the browser's history.
  // It is an app surface, not a visited website.
  const historyPageUrl = chrome.runtime.getURL("journal.html");
  chrome.history.onVisited.addListener((item) => {
    if (item.url && item.url.startsWith(historyPageUrl)) {
      void chrome.history.deleteUrl({ url: item.url });
    }
  });

  // Automatic cloud sync when the user has enabled it.
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "glean-sync") {
      void getCards().then(async (cards) => {
        try {
          await syncCards(cards);
        } catch (err) {
          console.error("Glean automatic sync failed:", err);
        }
      });
    }
  });
});
