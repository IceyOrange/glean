import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDesc__",
    default_locale: "en",
    // Network origins are requested only when a person connects an AI or
    // sync provider.  This keeps the install-time prompt focused on the
    // extension's actual baseline needs.
    permissions: ["storage", "alarms"],
    browser_specific_settings: {
      gecko: {
        id: "glean@lovegood.dev",
        strict_min_version: "109.0",
      },
    },
    optional_host_permissions: ["https://*/*", "http://*/*"],
    // content_scripts: removed — main-world-isolation prototype patches no
    // longer needed; focus isolation handled inside shadow DOM (S3 fix).
  },
});
