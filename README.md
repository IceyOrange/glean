<p align="center">
  <img src="public/icon/128.png" alt="Glean Logo" width="80" />
</p>

<h1 align="center">Glean</h1>

<p align="center">
  <strong>A quiet browser extension for clipping quotes and capturing thoughts from the web.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#development">Development</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="#中文文档">简体中文</a>
</p>

---

## Features

- **One-Click Clipping** — Select any text on a webpage, click the floating quote icon, and it's saved as a card.
- **Instant Annotations** — Write your thoughts right after clipping. Press `Shift + Enter` for a new line.
- **AI Insights** — Connect to LLMs (DeepSeek, OpenAI-compatible, etc.) to discover patterns and connections across your clippings.
- **History Journal** — A dedicated full-page view to browse, search, edit, bulk-delete, or export all your cards.
- **Cloud Sync** — Sync to a Notion database or back up via Nutstore / WebDAV.
- **Dark Mode** — Follows your system preference, or toggle manually.
- **Multilingual** — Built-in support for English / 中文 / Français.

## Installation

Glean is not yet available on the Chrome Web Store or Firefox Add-ons. You can install it manually using one of the methods below.

### Option 1: Download Pre-built Release

> Best for users who just want to use the extension without setting up a dev environment.

1. Go to the [Releases page](https://github.com/IceyOrange/glean/releases). If a pre-built zip is available, download `glean-chrome.zip` (for Chrome/Edge) or `glean-firefox.zip` (for Firefox).
2. Unzip the file to a folder on your computer.
3. Follow the **Load the extension** steps below for your browser.

> If no release is available yet, use **Option 2: Build from Source** below.

### Option 2: Build from Source

> For developers or users who want the latest unreleased changes.

**Prerequisites:**

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9

```bash
# Clone the repository
git clone https://github.com/IceyOrange/glean.git
cd glean

# Install dependencies
npm install

# Build for Chrome (or Firefox)
npm run build          # Chrome / Edge
npm run build:firefox  # Firefox
```

The built extension will be in `.output/chrome-mv3/` (Chrome) or `.output/firefox-mv2/` (Firefox).

### Load the Extension

#### Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder containing the built (or unzipped) extension — e.g., `.output/chrome-mv3/`.
5. The Glean icon will appear in your toolbar. Pin it for easy access.

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select any file inside the built extension folder — e.g., `.output/firefox-mv2/manifest.json`.

> ⚠️ **Note:** Temporary add-ons are removed when Firefox closes. For persistent installation, you need to sign the extension via [Firefox Add-on Distribution](https://extensionworkshop.com/documentation/publish/).

## Development

```bash
# Install dependencies
npm install

# Start dev server with hot-reload (Chrome)
npm run dev

# Start dev server for Firefox
npm run dev:firefox

# Run tests
npm test

# Type check
npm run compile

# Build for production
npm run build

# Package as zip
npm run zip
```

### Project Structure

```
src/
  entrypoints/
    background.ts          # Service worker
    content.ts             # Content script (quote popup)
    main-world-isolation.ts # Main world isolation
    journal/               # Full-page history UI
    popup/                 # Extension popup UI
  lib/
    ai.ts                  # AI provider integration
    content/               # Content script helpers
    i18n.ts                # Internationalization
    preferences.ts         # User preferences
    storage.ts             # Local storage layer
    sync/                  # Notion & WebDAV sync
    types.ts               # Shared TypeScript types
    ui.tsx                 # Shared UI components
    utils.ts               # Utility functions
  components/              # Shared React components
  styles/                  # Tailwind entry + custom fonts
public/
  _locales/                # i18n message files (en, zh_CN, fr)
  fonts/                   # Custom fonts
  icon/                    # Extension icons
```

## Configuration

Open the extension popup → **Settings**:

| Setting | Description |
|---|---|
| **Language** | Interface language: English / 中文 / Français |
| **Theme** | Light, Dark, or System |
| **AI Provider** | API Key, base URL (defaults to DeepSeek), and optional custom model name |
| **Cloud Sync** | Enable Notion database sync or WebDAV backup |

## Privacy

All clippings are stored locally in `chrome.storage.local` by default. AI and cloud-sync credentials are also kept in local storage and are only used to call the services you explicitly configure. No data is sent anywhere without your action.

## Contributing

Issues and pull requests are welcome! Feel free to:

- [Report a bug](https://github.com/IceyOrange/glean/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/IceyOrange/glean/issues/new?template=feature_request.md)
- Submit a pull request

## License

[MIT](./LICENSE) © 2026 Lovegood

---

Made with care by [IceyOrange](https://github.com/IceyOrange).

---

<!--  ==========  中文文档  ==========  -->

<h2 id="中文文档">Glean</h2>

<p align="center">一款安静的浏览器扩展：选中网页文字，一键摘录，随时记下灵感。</p>

<p>
  <a href="#功能介绍">功能介绍</a> ·
  <a href="#安装">安装</a> ·
  <a href="#开发">开发</a> ·
  <a href="#配置">配置</a> ·
  <a href="#隐私">隐私</a> ·
  <a href="#许可证">许可证</a>
</p>

<p>
  <a href="#top">English</a>
</p>

---

## 功能介绍

- **划词摘录** — 选中任意网页文字，点击浮现的引号图标即可保存为卡片。
- **即时批注** — 摘录后立刻写下想法，支持 `Shift + Enter` 换行。
- **AI 洞察** — 接入大语言模型（DeepSeek、OpenAI 兼容接口等），发现摘录之间的思维模式和灵感联系。
- **灵感库** — 独立的 Journal 页面，可浏览、搜索、编辑、批量删除或导出所有卡片。
- **云同步** — 支持 Notion 数据库同步与坚果云 / WebDAV 备份。
- **暗色模式** — 跟随系统或手动切换浅色/深色主题。
- **多语言** — 内置中文、英文、法文界面。

## 安装

Glean 暂未上架 Chrome 网上应用店或 Firefox 附加组件商店，可通过以下方式手动安装。

### 方式一：下载预构建版本

> 适合只想使用插件、不需要开发环境的用户。

1. 前往 [Releases 页面](https://github.com/IceyOrange/glean/releases)，若有预构建 zip，下载 `glean-chrome.zip`（Chrome/Edge）或 `glean-firefox.zip`（Firefox）。
2. 将 zip 文件解压到本地文件夹。
3. 按照下方对应浏览器的**加载扩展**步骤操作。

> 若暂无 Release，请使用下方**方式二：从源码构建**。

### 方式二：从源码构建

> 适合开发者或想要最新未发布更改的用户。

**前置条件：**

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9

```bash
# 克隆仓库
git clone https://github.com/IceyOrange/glean.git
cd glean

# 安装依赖
npm install

# 构建 Chrome（或 Firefox）版本
npm run build          # Chrome / Edge
npm run build:firefox  # Firefox
```

构建产物位于 `.output/chrome-mv3/`（Chrome）或 `.output/firefox-mv2/`（Firefox）。

### 加载扩展

#### Chrome / Edge

1. 打开 `chrome://extensions`（或 `edge://extensions`）。
2. 开启右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**。
4. 选择包含扩展的文件夹，例如 `.output/chrome-mv3/`。
5. Glean 图标将出现在工具栏中，建议固定以便快速访问。

#### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击**临时载入附加组件…**。
3. 选择扩展文件夹中的任意文件，例如 `.output/firefox-mv2/manifest.json`。

> ⚠️ **注意：** 临时附加组件在 Firefox 关闭后会被移除。如需持久安装，需通过 [Firefox 附加组件分发](https://extensionworkshop.com/documentation/publish/)签名。

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（Chrome）
npm run dev

# 启动开发服务器（Firefox）
npm run dev:firefox

# 运行测试
npm test

# 类型检查
npm run compile

# 生产构建
npm run build

# 打包为 zip
npm run zip
```

### 项目结构

```
src/
  entrypoints/
    background.ts          # 后台服务
    content.ts             # 内容脚本（摘录弹窗）
    main-world-isolation.ts # 主世界隔离
    journal/               # 全屏灵感库页面
    popup/                 # 弹出面板
  lib/
    ai.ts                  # AI 提供者集成
    content/               # 内容脚本辅助
    i18n.ts                # 国际化
    preferences.ts         # 用户偏好
    storage.ts             # 本地存储层
    sync/                  # Notion 与 WebDAV 同步
    types.ts               # 共享类型定义
    ui.tsx                 # 共享 UI 组件
    utils.ts               # 工具函数
  components/              # 共享 React 组件
  styles/                  # Tailwind 入口与自定义字体
public/
  _locales/                # 多语言文件 (en, zh_CN, fr)
  fonts/                   # 自定义字体
  icon/                    # 扩展图标
```

## 配置

打开弹出面板 → **设置**：

| 设置 | 说明 |
|---|---|
| **语言** | 界面语言：中文 / English / Français |
| **主题** | 浅色、深色或跟随系统 |
| **AI 提供者** | API 密钥、基础 URL（默认 DeepSeek），支持自定义模型名称 |
| **云同步** | 启用 Notion 数据库同步或 WebDAV 备份 |

## 隐私

所有摘录默认存储在 `chrome.storage.local` 中。AI 和云同步的凭据同样保存在本地存储中，仅在您主动配置的服务调用时使用。未经您的操作，不会向任何地方发送数据。

## 许可证

[MIT](./LICENSE) © 2026 Lovegood

---

Made with care by [IceyOrange](https://github.com/IceyOrange).
