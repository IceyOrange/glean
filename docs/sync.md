# 同步架构契约（Notion / WebDAV / Gist）

> 本文档记录同步链路的关键设计决策。修改 `src/lib/sync/` 前必读。
> 2026-07-27 用户反馈"Notion 里的记录没有同步到 journal.html，没有双向同步"后确立。

## 总流程（src/lib/sync/index.ts）

每次同步 = **pull → merge → push**，由 `syncCards()` 统一编排：

1. `adapter.pull()` 拉远端卡片；
2. `mergeCards(local, remote)` 按 last-write-wins 合并，写回本地存储；
3. `adapter.sync(merged)` 把合并结果推回远端。

触发时机：设置页"立即同步"按钮 + `glean-sync` 闹钟（每 60 分钟，仅在开启同步时创建）。
journal 通过 `chrome.storage.onChanged` 监听，后台同步写入后 UI 自动刷新。

**并发互斥**：按钮（页面上下文）和闹钟（service worker）分属不同 JS 上下文，
可能重叠执行——两个 sync 都先查库再建页，会把同一张新卡 POST 两次，产生
共享同一 Glean ID 的重复页面。`syncCards` 入口用 `chrome.storage.local`
的 `glean_sync_lock`（5 分钟 TTL，防 SW 中途被杀死锁）做跨上下文互斥；
被跳过的一方返回 `sync_in_progress`（UI 翻译为提示，不写入 lastError）。

## Notion 双向同步的四条铁律（src/lib/sync/notion.ts）

1. **Notion 侧手动创建的页面必须能拉下来。** 这类页面没有 "Glean ID" 属性，
   用派生 id `notion_<pageId>`（page id 不可变，所以稳定）。内容的读取
   优先级：**Content 属性 → 页面正文（body blocks）→ 页面标题**——
   Notion 用户通常把引文粘进正文，只读属性会出现"只有灵感、没有引文"
   （标题被当成内容）甚至整条丢弃（标题也为空）。Content 为空的页面才
   拉正文（`/blocks/{id}/children`，上限 5000 字，并发 3），Glean 自己
   建的页面永远有 Content，不会多发请求。正文作为内容时，标题归入
   `source.title`（它更像文章名）。push 时按派生 id 匹配回原页面并
   **回填** Glean ID 与 Content，绝不 POST 出重复页面。

2. **冲突解决依赖 `last_edited_time`。** 拉取时写入 `card.updatedAt`，
   否则远端卡片时间戳永远是创建日期，本地永远赢，Notion 侧的编辑不仅
   拉不下来，还会被 push 覆盖掉。

3. **无变化不写。** push 前逐字段比对（Content / Thought / Source / Created），
   一致就跳过 PATCH。否则每次同步都会 bump 所有页面的 `last_edited_time`，
   制造"假更新"回声。更新 PATCH **不写 Name 属性**——Notion 侧的改名保留；
   Name 只在创建时写入。

4. **远端删除靠状态差分发现。** 数据库查询接口永远不返回已归档页面，
   所以把上次 pull 看到的页面 id 集合存进 `chrome.storage.local`
   （key `glean_notion_sync_state`，含 databaseId）。下次 pull 时
   "上次有、这次没有"的 id 生成一次性 tombstone 卡片（updatedAt=deletedAt=now）
   参与合并。每个删除只上报一次（新状态直接替换旧状态，不留痕迹）。
   切换数据库（databaseId 变化）时旧状态作废，重新播种，避免误删。

5. **同 Glean ID 的重复页面自动去重。** 重复来源：修复前版本的匹配缺陷、
   手动+闹钟并发同步（现已被 `glean_sync_lock` 堵死）、Notion 侧手动
   Duplicate 行（会复制 Glean ID 属性值）。重复存在时，更新会落在 map 碰巧
   保留的那份拷贝上——用户编辑灵感后看到"另一行变了/多了一行"（2026-07-27
   用户实例）。sync 时按 `created_time` 保留最早创建的页面（原件），其余
   归档（软删除，可在 Notion 恢复），数量经 `SyncResult.dedupedCount`
   显示为"已清理 N 条重复记录"。同一 id 仍有原件存活时归档副本不会触发
   删除差分（集合成员判定），不会产生误墓碑。

## mergeCards 的回声保护（src/lib/sync/merge.ts）

远端时间戳更新但**内容完全一致**（content / thought / source.url 相同）时，
保留本地副本——本地带着更全的来源元数据（siteName、heading 等），
而远端时间戳可能刚被我们自己的 push bump 过。
例外：任一侧是 tombstone 时不适用——比本地 tombstone 更新的活卡片必须复活。

## 已知边界（有意为之）

- **Notion 数据库的标题列可以被改名**（"Title"、"标题"……）。读写都必须按
  `type === "title"` 找属性，不能假设它叫 "Name"——否则该库的记录全部拉不到、
  创建也会 400。
- 同步结果 `ok: true` 但带 `error` 字段 = 部分条目失败（如超长引文 400），
  UI 必须以警告形式显示，不能吞掉。
- Notion rich_text 单块 2000 字上限：超长引文会被分块写入；单条失败不会中断批次。
- Notion 侧创建的页面与本地已有卡片内容相同时不会去重（id 不同即两条）。
- 首次开启同步前在 Notion 侧的删除无法感知（无历史状态），从首次 pull 开始播种。
- 删除会先进入 Journal 回收站，保留期内可恢复；恢复后会作为更新同步到远端。
- Created 日期按 UTC 存取（`toISOString().slice(0,10)`），极端时区下可能与本地
  日期差一天，写入一次后稳定。
