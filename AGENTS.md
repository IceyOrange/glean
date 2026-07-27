<claude-mem-context>
# Memory Context

# [Glean] recent context, 2026-07-27 6:34pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (10,241t read) | 5,484,895t work | 100% savings

### Jul 1, 2026
S4050 Quotation hover window has positioning, navigation, and content redundancy issues (Jul 1 at 6:09 PM)
S4024 Fix Glean extension quote popover: wrong position, broken page display after click, redundant text preview (Jul 1 at 6:09 PM)
### Jul 4, 2026
S4051 Fix quotation floating window position, post-click page rendering, and redundant original-text display (Jul 4 at 1:24 PM)
S4352 Project-wide animation optimization in progress (Jul 4 at 1:24 PM)
### Jul 27, 2026
S4355 SettingsPanel Switch toggle for auto-thought setting reported as visually unappealing (Jul 27 at 2:09 PM)
5104 4:32p 🔵 Browser Use URL policy blocks local 127.0.0.1:4173 navigation
5106 4:34p 🔵 Impeccable detected 5 UI anti-patterns on audit-human.html
5107 4:36p 🔵 Screenshot captured of Impeccable anti-pattern overlays on audit-human.html
5108 4:39p 🔵 Popup settings panel DOM structure mapped during UI audit
5109 " 🔴 Quantitative a11y audit found small touch targets and unlabeled controls
5111 4:42p 🔵 Quantitative a11y audit found small touch targets and unlabeled controls
5112 5:13p ⚖️ Glean extension optimization work split into four dependency-ordered phases
5113 " 🟣 Cross-context sync lock prevents duplicate remote pages
5114 " 🟣 AI configuration stored encrypted with plaintext migration fallback
5115 " 🟣 apiPath helper normalizes OpenAI-compatible URLs across providers
5116 " ✅ Journal page excluded from browser history
5117 " 🔵 Manifest declares storage, history, alarms and host permissions for sync and AI providers
5118 5:15p ✅ Extension switches to optional runtime host permissions
5119 " 🔄 Sync serialization moved from storage lock to background promise queue
5120 " 🟣 Storage layer adds trash, restore, permanent delete, and JSON import
5121 " ✅ Privacy policy and store listing updated for optional permissions and credential storage
5123 5:17p 🟣 Journal trash UI added with restore and permanent delete
5124 " 🟣 Journal JSON import UI wired into SearchHeader
5125 " ✅ i18n strings added for import and trash across zh/en/fr
5128 5:18p ✅ Popup stats dashboard reduced to a single card count line
5129 " ✅ SettingsPanel accessibility and default-open behavior adjusted
5130 " ✅ SearchHeader accessibility and more-actions menu simplified
5131 " 🟣 AI ask panel now supports card/related/library context scopes
5134 5:20p 🔴 TypeScript compile error in ai.ts fixed by restoring `records` variable name
5135 " ✅ Content-script toast animations switched from layout properties to compositor properties
5136 " ✅ Dark mode color contrast adjusted for ink-400 and seal tokens
5137 " 🔴 CardItem rendering optimized and keyboard accessibility improved
5138 " 🟣 Journal adds preset filters for all, without thoughts, and recent 7 days
5140 5:21p 🔴 Notion rich text fields split at Notion's 2000-character limit
5141 " ✅ Mindset analysis saved as compact inline text instead of markdown sections
5143 " ✅ SyncSettings inputs associated with labels via htmlFor/id pairs
5144 5:22p 🟣 AI call helper supports custom base URLs with baked-in version segments
5145 " ✅ Storage tests expanded to cover trash and JSON import
5147 " 🔵 Built manifest confirms minimal install-time permissions with optional host access
5149 " 🔄 Removed unused pulse state and ref from popup App.tsx
5151 5:26p 🔵 Remote main has diverged ahead of local working tree
5152 5:27p 🔵 Rebase blocked by unstaged AGENTS.md changes
5153 " ✅ AGENTS.md timestamp updated by memory context refresh
5155 5:28p ✅ Local commits pushed to origin/main after build hook
5156 " 🔵 Release workflow will skip next bump because head commit is a feature
5158 5:31p 🟣 Glean v0.2.20 released with Chrome and Firefox artifacts
5159 6:04p 🔴 Glean browser extension still shows old version after browser refresh
5160 6:17p 🔵 Glean extension has stale chrome-mv3-dev build alongside current production build
5163 6:19p 🔵 Remote main has no new commits beyond local 0.2.19
5165 6:21p 🔵 Local main lags behind GitHub remote main by unknown commits
5166 " 🔵 Local origin/main remote-tracking branch is stale
5167 6:22p 🔴 Local Glean extension rebuilt to version 0.2.20 after syncing remote main
5168 " ⚖️ Delivery rule added to AGENTS.md for extension release workflow
5170 6:28p 🟣 Recycle bin Notion sync inquiry
5171 6:32p 🟣 Notion sync refresh button requested for journal.html
S4381 Implement bidirectional trash/recycle-bin synchronization between Glean and Notion (Jul 27 at 6:33 PM)
**Investigated**: Current deletion and restore flow between Glean and Notion, including how archived pages propagate and what happens on restore.

**Learned**: Glean-to-Notion deletion already archives the Notion page. Notion-to-Glean deletion already moves the card to local trash. However, restoring a card in Glean currently creates a new Notion page instead of unarchiving the original because the Glean card ID ↔ Notion page ID mapping is lost after archival. Notion API does not expose reliable permanent page deletion, so "permanent delete" in Glean can only remove the local tombstone.

**Completed**: Analyzed the existing partial sync behavior and identified the missing mapping/persistence needed for true bidirectional restore.

**Next Steps**: Implement persistence of the Glean card ID ↔ Notion page ID mapping through deletion, and on Glean restore call Notion PATCH /pages/{id} with { "archived": false } to unarchive the same page; align permanent-delete semantics so Notion pages remain in Notion trash.


Access 5485k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

## Delivery rule

每次完成可交付改动时，必须依序完成：同步远端 `main`、执行本地生产构建、推送并确认线上发布成功、拉取发布工作流自动生成的版本提交、再次执行本地生产构建，并核对 `.output/chrome-mv3/manifest.json` 与 `package.json` 的版本一致。浏览器本地加载目录固定为 `.output/chrome-mv3`，不要使用过期的 `.output/chrome-mv3-dev`。
