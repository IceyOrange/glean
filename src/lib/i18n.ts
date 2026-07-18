export type Lang = "zh" | "en" | "fr";

const LANG_KEY = "glean_lang";

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    // Popup
    title: "Glean",
    history: "历史",
    total: "总计",
    thoughts: "感想",
    today: "今日",
    thoughtRate: "感想率",
    avgLenUnit: "字/条",
    recent: "最近",
    viewAll: "查看全部 {{count}} 条 →",
    emptyTitle1: "选中网页上的文字",
    emptyTitle2: "捕获你的第一条灵感",
    settings: "设置",
    aiProvider: "AI 服务",
    aiPresetLabel: "常用服务商",
    aiProviderDeepseek: "DeepSeek",
    aiProviderSiliconflow: "硅基流动",
    aiProviderOpenai: "ChatGPT",
    aiProviderKimi: "Kimi",
    aiProviderZhipu: "智谱",
    aiProviderAnthropic: "Anthropic",
    showMore: "更多",
    showLess: "收起",
    cloudSync: "云同步",
    comingSoon: "即将推出…",
    // History
    back: "返回",
    editThought: "编辑感想",
    delete: "删除",
    deleteConfirm: "确定删除这条引用？",
    search: "搜索引用、感想、来源…",
    cardCount: "{{count}} 条",
    noMatch: "没有匹配的卡片。",
    noCards: "还没有卡片。",
    emptyDesc: "在任意网页上选中文字，使用 Glean 扩展捕获引用和感想。",
    addThought: "添加感想",
    // Insight
    aiTooltip: "AI 洞察",
    insightLoading: "正在分析灵感…",
    insightRetry: "重试",
    insightReflect: "这条灵感反映了",
    insightConnect: "异曲同工之妙",
    insightPattern: "你的思维模式",
    insightSuggest: "延伸思考",
    insightCollapse: "收起",
    genFail: "生成失败",
    // Settings
    settingsTitle: "设置",
    settingsDesc: "自定义语言、主题和 AI 洞察选项。",
    apiKey: "API Key",
    apiUrl: "API 地址（可选）",
    modelLabel: "模型",
    cancel: "取消",
    save: "保存",
    saved: "已保存",
    configured: "已配置",
    connected: "已连接",
    connectFail: "连接失败",
    testConnection: "测试连接",
    langLabel: "语言",
    // Content script
    saveSelection: "保存选文",
    savedToast: "已保存",
    addThoughtTooltip: "添加感想",
    thoughtPlaceholder: "这让你想到了什么？",
    thoughtSaved: "感想已保存",
    failed: "保存失败",
    // Date groups
    groupToday: "今天",
    groupYesterday: "昨天",
    groupEarlier: "更早",
    // Undo delete
    deletedToast: "已删除",
    batchDeletedToast: "已删除 {{count}} 条",
    undo: "撤销",
    // Multi-select
    select: "选择",
    selectAll: "全选",
    deselectAll: "取消全选",
    selectedCount: "已选择 {{count}} 条",
    batchDelete: "批量删除",
    batchExport: "批量导出",
    cancelSelection: "取消选择",
    // Empty guide
    guideStep1: "在任意网页选中一段文字",
    guideStep2: "点击浮现的引号图标保存",
    guideStep3: "为它写下你的感想",
    // Export
    exportData: "导出",
    exportMarkdown: "导出 Markdown",
    exportJSON: "导出 JSON",
    // Cloud sync
    syncProvider: "云同步服务",
    syncNotion: "Notion",
    syncNutstore: "坚果云",
    syncNotionDesc: "在 Notion 中创建一个名为 Glean 的数据库，并分享给内部集成。",
    syncNutstoreDesc: "使用坚果云的 WebDAV 地址和第三方应用密码。",
    syncWebdav: "WebDAV",
    syncWebdavDesc: "兼容任意支持 WebDAV 的服务，如 Nextcloud、ownCloud、群晖等。",
    syncKoofr: "Koofr",
    syncKoofrDesc: "WebDAV 地址：https://app.koofr.net/dav/Koofr；用户名是注册邮箱，密码需生成应用专用密码。",
    syncPcloud: "pCloud",
    syncPcloudDesc: "默认使用欧盟节点 https://ewebdav.pcloud.com；若账号在美国节点，请改为 https://webdav.pcloud.com。",
    syncInfini: "InfiniCLOUD",
    syncInfiniDesc: "每个账号有独立节点地址，格式为 https://<你的子域名>.teracloud.jp/dav/，请从个人主页 > Apps Connection 获取。",
    syncToken: "Integration Token",
    syncDatabaseId: "数据库 ID（可选）",
    syncServerUrl: "WebDAV 地址",
    syncUsername: "用户名",
    syncPassword: "密码",
    syncRemotePath: "远程目录",
    syncEnable: "启用云同步",
    syncNow: "立即同步",
    syncLastSuccess: "上次同步：{{time}}",
    syncLastError: "同步失败：{{error}}",
    syncNever: "从未同步",
    syncConfigIncomplete: "请填写完整的同步配置",
    syncSuccess: "同步成功",
    // Insight
    insightRefresh: "重新生成",
    // Capture settings
    captureSection: "划词保存",
    // Appearance
    appearanceSection: "外观",
    themeLabel: "主题",
    themeAuto: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
    // AI prompt
    aiRole: "你是一个思维洞察助手。用户正在收集灵感和想法，你需要帮助他们发现思维模式和深层联系。",
    aiOutputLang: "请用中文回答，输出 JSON 格式：",
    aiReflectionDesc: "这条灵感反映了什么（2-3句话，深入浅出）",
    aiConnectionsDesc: "与之前哪些灵感有异曲同工之妙，具体说明",
    aiPatternDesc: "用户的思维模式是什么（观察用户的思考风格和偏好）",
    aiSuggestionsDesc: "基于这条灵感，可以进一步思考的方向",
    aiFirstNote: '如果这是第一条灵感，connections 可以为空数组，thinkingPattern 可以写"尚需更多灵感来分析思维模式"。',
    aiCurrentInspiration: "当前灵感",
    aiUserThought: "用户的想法",
    aiSource: "来源",
    aiContextHeader: "以下是用户之前的灵感记录（共{{count}}条，按时间倒序）：",
    aiFirstRecord: "（这是用户的第一条灵感记录）",
    aiThoughtLabel: "想法",
    aiSourceLabel: "来源",
  },

  en: {
    // Popup
    title: "Glean",
    history: "History",
    total: "Total",
    thoughts: "Thoughts",
    today: "Today",
    thoughtRate: "rate",
    avgLenUnit: "chars",
    recent: "Recent",
    viewAll: "View all {{count}} cards →",
    emptyTitle1: "Select text on any webpage",
    emptyTitle2: "to capture your first card",
    settings: "Settings",
    aiProvider: "AI Provider",
    aiPresetLabel: "Providers",
    aiProviderDeepseek: "DeepSeek",
    aiProviderSiliconflow: "SiliconFlow",
    aiProviderOpenai: "ChatGPT",
    aiProviderKimi: "Kimi",
    aiProviderZhipu: "Zhipu",
    aiProviderAnthropic: "Anthropic",
    showMore: "More",
    showLess: "Less",
    cloudSync: "Cloud Sync",
    comingSoon: "Coming soon…",
    // History
    back: "Back",
    editThought: "Edit thought",
    delete: "Delete",
    deleteConfirm: "Delete this quote?",
    search: "Search quotes, thoughts, sources…",
    cardCount: "{{count}} card(s)",
    noMatch: "No matching cards.",
    noCards: "No cards yet.",
    emptyDesc: "Select text on any webpage and use the Glean extension to capture quotes and thoughts.",
    addThought: "Add thought",
    // Insight
    aiTooltip: "AI Insight",
    insightLoading: "Analyzing inspiration…",
    insightRetry: "Retry",
    insightReflect: "This inspiration reflects",
    insightConnect: "Connections to previous thoughts",
    insightPattern: "Your thinking pattern",
    insightSuggest: "Further thinking",
    insightCollapse: "Collapse",
    genFail: "Generation failed",
    // Settings
    settingsTitle: "Settings",
    settingsDesc: "Customize language, theme, and AI insight options.",
    apiKey: "API Key",
    apiUrl: "API URL (optional)",
    modelLabel: "Model",
    cancel: "Cancel",
    save: "Save",
    saved: "Saved",
    configured: "Configured",
    connected: "Connected",
    connectFail: "Failed",
    testConnection: "Test",
    langLabel: "Language",
    // Content script
    saveSelection: "Save selection",
    savedToast: "Saved",
    addThoughtTooltip: "Add a thought",
    thoughtPlaceholder: "What does this remind you of?",
    thoughtSaved: "Thought saved",
    failed: "Failed",
    // Date groups
    groupToday: "Today",
    groupYesterday: "Yesterday",
    groupEarlier: "Earlier",
    // Undo delete
    deletedToast: "Deleted",
    batchDeletedToast: "{{count}} deleted",
    undo: "Undo",
    // Multi-select
    select: "Select",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    selectedCount: "{{count}} selected",
    batchDelete: "Delete selected",
    batchExport: "Export selected",
    cancelSelection: "Cancel",
    // Empty guide
    guideStep1: "Select any text on a webpage",
    guideStep2: "Click the quote icon to save it",
    guideStep3: "Write down your thought",
    // Export
    exportData: "Export",
    exportMarkdown: "Export Markdown",
    exportJSON: "Export JSON",
    // Cloud sync
    syncProvider: "Cloud sync",
    syncNotion: "Notion",
    syncNutstore: "Nutstore",
    syncNotionDesc: "Create a Notion database named Glean and share it with your internal integration.",
    syncNutstoreDesc: "Use Nutstore's WebDAV URL and app-specific password.",
    syncWebdav: "WebDAV",
    syncWebdavDesc: "Compatible with any WebDAV server such as Nextcloud, ownCloud, or Synology.",
    syncKoofr: "Koofr",
    syncKoofrDesc: "WebDAV URL: https://app.koofr.net/dav/Koofr. Use your account email and an app-specific password.",
    syncPcloud: "pCloud",
    syncPcloudDesc: "Defaults to the EU node https://ewebdav.pcloud.com. Switch to https://webdav.pcloud.com if your account is in the US region.",
    syncInfini: "InfiniCLOUD",
    syncInfiniDesc: "Each account has a unique node URL like https://<your-subdomain>.teracloud.jp/dav/. Find it under My Page > Apps Connection.",
    syncToken: "Integration Token",
    syncDatabaseId: "Database ID (optional)",
    syncServerUrl: "WebDAV URL",
    syncUsername: "Username",
    syncPassword: "Password",
    syncRemotePath: "Remote folder",
    syncEnable: "Enable cloud sync",
    syncNow: "Sync now",
    syncLastSuccess: "Last sync: {{time}}",
    syncLastError: "Sync failed: {{error}}",
    syncNever: "Never synced",
    syncConfigIncomplete: "Please complete the sync configuration",
    syncSuccess: "Sync successful",
    // Insight
    insightRefresh: "Regenerate",
    // Capture settings
    captureSection: "Capture",
    // Appearance
    appearanceSection: "Appearance",
    themeLabel: "Theme",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    // AI prompt
    aiRole: "You are a thinking insight assistant. The user is collecting inspirations and ideas. Help them discover thinking patterns and deeper connections.",
    aiOutputLang: "Respond in English. Output JSON format:",
    aiReflectionDesc: "What this inspiration reflects (2-3 sentences, insightful)",
    aiConnectionsDesc: "Which previous inspirations connect to this one, with specifics",
    aiPatternDesc: "What is the user's thinking pattern (observe their thinking style and preferences)",
    aiSuggestionsDesc: "Directions for further thinking based on this inspiration",
    aiFirstNote: "If this is the first inspiration, connections can be an empty array, and thinkingPattern can note that more inspirations are needed to analyze patterns.",
    aiCurrentInspiration: "Current inspiration",
    aiUserThought: "User's thought",
    aiSource: "Source",
    aiContextHeader: "Here are the user's previous inspiration records ({{count}} total, in reverse chronological order):",
    aiFirstRecord: "(This is the user's first inspiration record)",
    aiThoughtLabel: "Thought",
    aiSourceLabel: "Source",
  },

  fr: {
    // Popup
    title: "Glean",
    history: "Historique",
    total: "Total",
    thoughts: "Réflexions",
    today: "Aujourd'hui",
    thoughtRate: "taux",
    avgLenUnit: "car",
    recent: "Récents",
    viewAll: "Voir les {{count}} cartes →",
    emptyTitle1: "Sélectionnez du texte sur une page web",
    emptyTitle2: "pour capturer votre première carte",
    settings: "Paramètres",
    aiProvider: "Fournisseur IA",
    aiPresetLabel: "Fournisseurs",
    aiProviderDeepseek: "DeepSeek",
    aiProviderSiliconflow: "SiliconFlow",
    aiProviderOpenai: "ChatGPT",
    aiProviderKimi: "Kimi",
    aiProviderZhipu: "Zhipu",
    aiProviderAnthropic: "Anthropic",
    showMore: "Plus",
    showLess: "Moins",
    cloudSync: "Synchronisation cloud",
    comingSoon: "Bientôt disponible…",
    // History
    back: "Retour",
    editThought: "Modifier la réflexion",
    delete: "Supprimer",
    deleteConfirm: "Supprimer cette citation ?",
    search: "Rechercher citations, réflexions, sources…",
    cardCount: "{{count}} carte(s)",
    noMatch: "Aucune carte correspondante.",
    noCards: "Pas encore de carte.",
    emptyDesc: "Sélectionnez du texte sur une page web et utilisez l'extension Glean pour capturer des citations et réflexions.",
    addThought: "Ajouter une réflexion",
    // Insight
    aiTooltip: "Insight IA",
    insightLoading: "Analyse de l'inspiration…",
    insightRetry: "Réessayer",
    insightReflect: "Cette inspiration reflète",
    insightConnect: "Liens avec les réflexions précédentes",
    insightPattern: "Votre schéma de pensée",
    insightSuggest: "Réflexions approfondies",
    insightCollapse: "Réduire",
    genFail: "Échec de la génération",
    // Settings
    settingsTitle: "Paramètres",
    settingsDesc: "Personnalisez la langue, le thème et les options d'insight IA.",
    apiKey: "Clé API",
    apiUrl: "URL de l'API (optionnel)",
    modelLabel: "Modèle",
    cancel: "Annuler",
    save: "Enregistrer",
    saved: "Enregistré",
    configured: "Configuré",
    connected: "Connecté",
    connectFail: "Échec",
    testConnection: "Tester",
    langLabel: "Langue",
    // Content script
    saveSelection: "Enregistrer la sélection",
    savedToast: "Enregistré",
    addThoughtTooltip: "Ajouter une réflexion",
    thoughtPlaceholder: "À quoi cela vous fait-il penser ?",
    thoughtSaved: "Réflexion enregistrée",
    failed: "Échec",
    // Date groups
    groupToday: "Aujourd'hui",
    groupYesterday: "Hier",
    groupEarlier: "Plus tôt",
    // Undo delete
    deletedToast: "Supprimée",
    batchDeletedToast: "{{count}} supprimé(s)",
    undo: "Annuler",
    // Multi-select
    select: "Sélectionner",
    selectAll: "Tout sélectionner",
    deselectAll: "Tout désélectionner",
    selectedCount: "{{count}} sélectionné(s)",
    batchDelete: "Supprimer la sélection",
    batchExport: "Exporter la sélection",
    cancelSelection: "Annuler",
    // Empty guide
    guideStep1: "Sélectionnez du texte sur une page web",
    guideStep2: "Cliquez sur l'icône de citation pour l'enregistrer",
    guideStep3: "Notez votre réflexion",
    // Export
    exportData: "Exporter",
    exportMarkdown: "Exporter en Markdown",
    exportJSON: "Exporter en JSON",
    // Cloud sync
    syncProvider: "Synchronisation cloud",
    syncNotion: "Notion",
    syncNutstore: "Nutstore",
    syncNotionDesc: "Créez une base de données Notion nommée Glean et partagez-la avec votre intégration interne.",
    syncNutstoreDesc: "Utilisez l'URL WebDAV de Nutstore et le mot de passe d'application.",
    syncWebdav: "WebDAV",
    syncWebdavDesc: "Compatible avec tout serveur WebDAV tel que Nextcloud, ownCloud ou Synology.",
    syncKoofr: "Koofr",
    syncKoofrDesc: "URL WebDAV : https://app.koofr.net/dav/Koofr. Utilisez l'e-mail de votre compte et un mot de passe d'application.",
    syncPcloud: "pCloud",
    syncPcloudDesc: "Nœud UE par défaut https://ewebdav.pcloud.com. Utilisez https://webdav.pcloud.com si votre compte est en région US.",
    syncInfini: "InfiniCLOUD",
    syncInfiniDesc: "Chaque compte a une URL de nœud unique du type https://<sous-domaine>.teracloud.jp/dav/. Retrouvez-la dans My Page > Apps Connection.",
    syncToken: "Jeton d'intégration",
    syncDatabaseId: "ID de la base (optionnel)",
    syncServerUrl: "URL WebDAV",
    syncUsername: "Nom d'utilisateur",
    syncPassword: "Mot de passe",
    syncRemotePath: "Dossier distant",
    syncEnable: "Activer la synchronisation",
    syncNow: "Synchroniser",
    syncLastSuccess: "Dernière sync : {{time}}",
    syncLastError: "Échec : {{error}}",
    syncNever: "Jamais synchronisé",
    syncConfigIncomplete: "Veuillez compléter la configuration",
    syncSuccess: "Synchronisation réussie",
    // Insight
    insightRefresh: "Régénérer",
    // Capture settings
    captureSection: "Capture",
    // Appearance
    appearanceSection: "Apparence",
    themeLabel: "Thème",
    themeAuto: "Auto",
    themeLight: "Clair",
    themeDark: "Sombre",
    // AI prompt
    aiRole: "Vous êtes un assistant d'analyse de pensées. L'utilisateur collecte des inspirations et des idées. Aidez-le à découvrir des schémas de pensée et des connexions plus profondes.",
    aiOutputLang: "Répondez en français. Format JSON :",
    aiReflectionDesc: "Ce que cette inspiration reflète (2-3 phrases, perspicace)",
    aiConnectionsDesc: "Quelles inspirations précédentes sont liées à celle-ci, avec des détails",
    aiPatternDesc: "Quel est le schéma de pensée de l'utilisateur (observez son style et ses préférences de réflexion)",
    aiSuggestionsDesc: "Directions pour approfondir la réflexion à partir de cette inspiration",
    aiFirstNote: "S'il s'agit de la première inspiration, connections peut être un tableau vide, et thinkingPattern peut noter que plus d'inspirations sont nécessaires pour analyser les schémas.",
    aiCurrentInspiration: "Inspiration actuelle",
    aiUserThought: "Réflexion de l'utilisateur",
    aiSource: "Source",
    aiContextHeader: "Voici les enregistrements d'inspiration précédents de l'utilisateur ({{count}} au total, en ordre chronologique inverse) :",
    aiFirstRecord: "(C'est le premier enregistrement d'inspiration de l'utilisateur)",
    aiThoughtLabel: "Réflexion",
    aiSourceLabel: "Source",
  },
};

let _cachedLang: Lang | null = null;

// Keep the in-memory cache in sync when the language is changed from another
// extension surface (popup / journal). Without this, the content script can
// hold a stale cached language and toasts will revert to the old value.
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.glean_lang) {
      _cachedLang = (changes.glean_lang.newValue as Lang) || detectLang();
    }
  });
}

/** Fall back to the browser UI language when the user has not chosen one. */
function detectLang(): Lang {
  try {
    const ui = (
      chrome.i18n?.getUILanguage?.() ||
      navigator.language ||
      "zh"
    ).toLowerCase();
    if (ui.startsWith("zh")) return "zh";
    if (ui.startsWith("fr")) return "fr";
    return "en";
  } catch {
    return "zh";
  }
}

export async function getLang(): Promise<Lang> {
  if (_cachedLang) return _cachedLang;
  try {
    const result = await chrome.storage.local.get(LANG_KEY);
    _cachedLang = (result[LANG_KEY] as Lang) || detectLang();
  } catch {
    _cachedLang = detectLang();
  }
  return _cachedLang;
}

export async function setLang(lang: Lang): Promise<void> {
  _cachedLang = lang;
  await chrome.storage.local.set({ [LANG_KEY]: lang });
}

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  let text = translations[lang]?.[key] || translations.zh[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{{${k}}}`, String(v));
    }
  }
  return text;
}

export function getTranslations(lang: Lang): Record<string, string> {
  return translations[lang] || translations.zh;
}
