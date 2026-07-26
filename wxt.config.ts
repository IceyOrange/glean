import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDesc__",
    default_locale: "en",
    permissions: ["storage", "history", "alarms"],
    browser_specific_settings: {
      gecko: {
        id: "glean@lovegood.dev",
        strict_min_version: "109.0",
      },
    },
    host_permissions: [
      "https://api.notion.com/*",
      "https://dav.jianguoyun.com/*",
      "https://api.deepseek.com/*",
      "https://api.siliconflow.cn/*",
      "https://api.openai.com/*",
      "https://api.moonshot.cn/*",
      "https://open.bigmodel.cn/*",
      "https://api.anthropic.com/*",
    ],
    // content_scripts: removed — main-world-isolation prototype patches no
    // longer needed; focus isolation handled inside shadow DOM (S3 fix).
  },
});
