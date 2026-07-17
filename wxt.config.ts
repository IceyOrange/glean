import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDesc__",
    default_locale: "en",
    permissions: ["storage", "history"],
    browser_specific_settings: {
      gecko: {
        id: "glean@lovegood.dev",
        strict_min_version: "109.0",
      },
    },
    host_permissions: ["<all_urls>", "https://api.notion.com/*", "https://dav.jianguoyun.com/*"],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["main-world-isolation.js"],
        world: "MAIN",
      },
    ],
  },
});
