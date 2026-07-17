export default defineBackground(() => {
  console.log("Glean background started");

  // Keep the extension's journal page out of the browser's history.
  // It is an app surface, not a visited website.
  const historyPageUrl = chrome.runtime.getURL("journal.html");
  chrome.history.onVisited.addListener((item) => {
    if (item.url && item.url.startsWith(historyPageUrl)) {
      void chrome.history.deleteUrl({ url: item.url });
    }
  });
});
