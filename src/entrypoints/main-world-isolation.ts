import { mainWorldIsolation } from "@/lib/main-world-isolation";

export default defineContentScript({
  matches: ["<all_urls>"],
  world: "MAIN",
  main() {
    mainWorldIsolation();
  },
});
