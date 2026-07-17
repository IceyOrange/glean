# Glean

A quiet browser extension for clipping quotes and thoughts from the web.

Glean 是一款安静的浏览器扩展：选中网页上的文字，一键保存为卡片，并随时写下你的想法。支持 AI 洞察、Notion / 坚果云同步、暗色模式与多语言。

---

## Features

- **划词保存**：选中任意网页文字，点击浮现的引号图标即可保存。
- **即时批注**：保存后立刻写下想法，支持 Shift + Enter 换行。
- **AI 洞察**：接入 DeepSeek 等大模型，发现思维模式和灵感之间的联系。
- **历史管理**：在独立的 Journal 页面查看、搜索、编辑、批量删除或导出所有卡片。
- **云同步**：支持 Notion 数据库同步与坚果云 WebDAV 备份。
- **暗色模式**：跟随系统或手动切换浅色/深色主题。
- **多语言**：内置 中文 / English / Français。

## Tech Stack

- [WXT](https://wxt.dev/) — browser extension framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vitest](https://vitest.dev/) for testing

## Development

```bash
# Install dependencies
npm install

# Start development server (Chrome)
npm run dev

# Start for Firefox
npm run dev:firefox

# Run tests
npm test

# Type check
npm run compile

# Build production bundle
npm run build

# Build for Firefox
npm run build:firefox

# Package extension zip
npm run zip
```

## Project Structure

```
src/
  entrypoints/        # WXT entrypoints
    background.ts     # service worker
    content.ts        # content script (save popup on webpages)
    journal/          # full-page history UI
    popup/            # extension popup UI
  components/         # shared React components
  lib/                # storage, AI, sync, i18n, utilities
  styles/             # Tailwind entry + custom fonts
public/               # static assets, icons, locales
```

## Configuration

Open the popup → Settings:

- **Language / Theme**: interface language and light/dark mode.
- **AI Provider**: configure API Key and base URL (defaults to DeepSeek). A custom model name is supported.
- **Cloud Sync**: enable Notion or Nutstore (WebDAV) sync.

## Privacy

All cards are stored locally in `chrome.storage.local` by default. AI and cloud-sync credentials are also kept in local storage and are only used to call the services you configure.

## License

[MIT](./LICENSE)

---

Made with care by [IceyOrange](https://github.com/IceyOrange).
