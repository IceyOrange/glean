# 划词保存链路 · UX 契约

> 本文档记录核心交互链路（选中 → icon → 保存 → 高亮 → 灵感 → 提交）中**用户已确认的设计决策**。
> 修改这些行为前必须先读本文；改动与本文冲突时，先更新本文再改代码。
> 这些点已经在评审中反复出现过，不要再来回改。

## 1. 引文高亮生命周期（highlight-flash.ts）

高亮是 **toast 在页面上的锚点**，不是自定时的通知：

- 保存成功 → 染色 bloom 到峰值（α 0.36，220ms）→ 回落到静置态（α 0.24，650ms）。
- **toast 打开期间，高亮一直保持在静置态**——用户写灵感时它能锚定上下文。
- **只有 toast 消失后**（提交灵感 / 点击空白 / 滚动释放 / 被新保存顶替），高亮才开始缓慢渐隐（2400ms easeOutCubic）。
- 新保存立即接替旧高亮（代际 token，旧 release 对新 highlight 无效）。
- 安全网：60s 未收到 release 自动渐隐，防止页面被永久染色。
- `prefers-reduced-motion`：直接静置态，release 时立即移除。
- `::highlight` 规则必须注入页面级 `<style>`（不能在 shadow DOM）；CSP 严格站点静默失效，可接受。

**反面教材（不要再做）**：900ms 两档硬跳（v1）、固定 3s 时间轴（v2）——都被否了，
因为它们与 toast 生命周期脱钩，"只显示一小下"。

## 2. Trigger icon 定位（content.ts showTrigger）

- host 是 fixed 定位，**初始 left/top 必须是视口坐标**（doc − scroll），
  文档坐标只用于滚动监听校正。写成文档坐标会导致页面滚动后 icon 错位（已踩过）。
- icon 放在选区末尾 8px（Fitts 最优，评审结论，不要改）。
- 点击 icon → spinner → seal 色 ✓ 描绘（350ms）→ 淡出；toast 并行出现，不等待。

## 3. 灵感输入框自动展开（preferences.ts）

- **默认每次保存后自动展开**。用户明确要求旅程最短：点 icon → 输入框已在。
- 自适应学习只统计**显式关闭**（点空白、Esc）：
  - 滚动释放、Space/PageDown 释放 = "继续阅读"，中性，不计数。
  - 被新保存顶替 = 中性，不计数。
  - 撤销 = 删卡片，不计数。
- 连续 3 次显式留空关闭才自动转为 compact bar；写过一次想法即清零；
  手动重开开关清零。
- 存储 key `glean_auto_open_thought`（改名即重置错误学习成果，见代码注释）。

## 4. Toast 行为

- 文档锚定：toast 随被保存的文字一起滚动（clamp 后必须重新 anchor）。
- 退场动画统一走 `animateToastRemoval`（幂等，180ms，`.toast-out` 必须 `pointer-events:none`）；
  被顶替走 `animateToastReplacement`。
- 阅读意图即释放：空输入框时 Space/PageDown/PageUp 或页外滚动 → dismiss 并执行滚动；
  IME 组合中不触发；输入框有内容时滚动不 dismiss。
- 提交灵感后停留 1.8s 自动消失。

## 5. 测试协议（给所有开发者）

content script 改动后，**必须先在 chrome://extensions 刷新扩展，再刷新测试页面**，
否则看到的是旧代码——"改了没反应"几乎都是这个原因。
验证三连：`npm run compile` → `npx vitest run` → `npm run build`。

## 6. 动效通用原则

- 所有 JS 驱动的动效必须检查 `prefersReducedMotion()`，reduced 下直接到终态。
- 所有清理集中在 `removeToast` 单一路径（监听器、记账、高亮 release）。
- shadow DOM 内事件用 `e.composedPath()` 判断包含关系（e.target 会被重定向到 host）。
