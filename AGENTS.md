# AGENTS.md — 给 AI/自动化协作者的工程约定

> 本文件是**工程内必须遵守的规则**，不是建议。任何 AI 助手（含 DeepSeek Harness）或其他自动化
> 工具在本仓库工作前都应先读完这一页。

## 0. 项目速览

- **Bilibili-BlackList**：Tampermonkey 油猴脚本（B 站 UP 主/标签/广告屏蔽）。
- 构建：`build.config.json` 的 `src.modules` 顺序即求值顺序，`build.js` 把 23 个模块拼进**同一个 IIFE**
  （共享全局作用域、无 import/export）。发布产物 `dist/bilibili-blacklist.user.js` **入库**，
  dev 产物 `dist/bilibili-blacklist.dev.user.js` 不入库。
- 当前开发环境：本地 dev server（`npm run dev`，`http://127.0.0.1:5173`）+ 浏览器里的
  `test/bilibili-blacklist.dev.user.js` 加载器（每次打开 B 站页面拉取最新 dev 构建）。

## 1. 浏览器测试规则（**强制**）

1. **必须静音**：测试任何可能播放音视频的页面（视频播放页、首页横幅、直播等）前/同时，必须把媒体静音。
   - 首选：在 URL 后加 `#bl-mute`（dev 构建提供，暂停并 mute 所有 `video/audio`，并持续兜底）。
   - 兜底：测试前请人在浏览器标签页上静音，或不要打开视频播放页。
   - **不允许**在未静音状态下打开视频播放页。
2. **只操作自己创建的标签页/窗口**，绝不触碰用户正在浏览的页面：不点击、不滚动、不导航用户的标签页。
3. **只在本地 dev 环境测试**（`npm run dev` + dev 加载器）；不要改动 release 产物的行为来“方便测试”。
4. **不要上传到 git**：不要 commit / push / 切分支 / 打 tag，除非用户明确要求。
   可以修改工作区文件、重建 `dist/`。
5. 测试需要“检查内部状态”时，优先用 dev 构建自带的 URL 调试钩子，而不是去改业务代码：
   - `#bl-flash-probe`：新卡片/广告未被及时遮盖会打印 `[FLASH][dev]`（瀑布流闪烁回归）。
   - `#bl-cover-audit`：3s/10s 打印页面类型、命中卡片数、是否被预覆盖、done 标记、队列状态
     （排查“卡片一直模糊”）。
   - `#bl-open-panel` / `#bl-probe-dom` / `#bl-probe-fields`：见 `src/debug/dev-test.js`。
   - 多个标记可组合，例如 `#bl-mute#bl-cover-audit`。

## 2. 构建与验证

```bash
npm run build          # 发布构建 → dist/bilibili-blacklist.user.js（入库产物）
npm run build:dev      # 开发构建 → dist/bilibili-blacklist.dev.user.js（含 debug 模块）
npm run check          # 产物冒烟检查（最小 DOM 桩，80 项断言）
npm run check:build    # 构建完整性：产物含源码全部顶层标识符与配置键、无调试入口泄漏
npm run verify         # build + check:build + node --check + dist 无漂移（提交前跑）
```

> 注意：本机 `dist/` 目录的 Windows 权限较特殊（禁用了权限继承），沙箱内进程可能写不进去；
> 若构建报 `EPERM: operation not permitted ... dist\...`，视为环境权限问题，不要怀疑代码。

## 3. 代码约定（务必遵守，否则会出现静默不一致）

- **单一真源**：屏蔽类型（`src/domain/block-types.js`）、配置默认值/约束（`src/data/settings.js`）、
  判定规则（`src/domain/matchers.js`）、统计字段（`src/core/stats.js`）都只有一份，
  其它模块一律派生，不要复制。
- **求值顺序**：`block-types → settings → storage` 必须靠前（求值期即被引用）；
  `styles.js` 在 ui 系列最前；`main.js` 最后。改顺序前先读 `build.js` 顶部说明。
- **“未处理”遮盖**有两层，改动时两层都要管：
  1) JS：`applyPendingFilter/clearPendingFilter`（内联 `filter`，`core.js` 的 `PENDING_FILTER_STYLE`）；
  2) CSS 预覆盖：`ui/styles.js` 的 `html.bilibili-blacklist-pending-cover ... :not([data-bl-card-done])`。
  提交判定时必须调用 `markCardPendingDone(card)` 同时给**卡片元素与归一后的真实元素**打标记，
  否则会出现“JS 已判定、CSS 还在罩着”的永久模糊。
- **主页/播放页广告**都有 CSS 预覆盖（`ads.js` 的 `AD_PENDING_CLASS` / `MAIN_AD_PENDING_CLASS`），
  判定提交走 `resolveAdElement`（先打 `data-bl-ad-done` 再遮蔽），不要在中间插入其它 DOM 操作。
- **不要给 `document.body` 加 `filter`**（空间页灰度已改为 `backdrop-filter` 遮罩层）：
  body 上的 filter 会波及管理面板，并让 `position: fixed` 失去视口基准。
- 注释里标了「有意设计，勿改」的时序（播放页 5s 静默、后台暂停判定、观察根重连等）不要“顺手优化”。

## 4. 已知限制

- 搜索页顶部「UP主精选」横排卡的作者链接在卡片节点之外，名称类规则对它不生效（已在
  `getVideoCardInfo` 注释说明，不要向上跨模块找作者，会取错人）。
- `build.js` 的 `stripComments` 不识别正则字面量：源码里避免出现含 `//` 或引号的正则字面量，
  或改用 `npm run check:build` 兜底。
