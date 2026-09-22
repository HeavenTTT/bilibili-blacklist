# Bilibili-BlackList

> Bilibili UP 主视频屏蔽插件 —— 支持精确匹配 / 正则匹配 / 分类标签 / 视频标签 / 竖屏 / 软广，
> 覆盖主页、播放页、分类页、搜索页、排行榜、动态页与用户空间。
> 插件大部分代码由 AI 生成，持续的 bug 反馈都很欢迎。

[![Version](https://img.shields.io/badge/version-2.0.0-fb7299)](./CHANGELOG.md)

---

## ⚠️ 免责声明（Disclaimer）

- **本项目大部分代码由人工智能（AI）编写**：自 `2.0.0` 起，功能主体来自
  **DeepSeek Harness（AI）** 自动生成与维护的重写版（原 `bilibili-blacklist-remake`），
  并非由人类逐行手工开发。详见 [CHANGELOG.md](./CHANGELOG.md) 的 2.0.0 条目。
- 使用本插件会造成**第三方页面内容被隐藏/改写**，可能与本插件预期不符；请在**充分理解其行为**后再安装使用。
- 第三方站点（B 站）页面结构、接口与政策可能变化，本插件可能**失效、误伤或引发异常**。
  作者/生成者**不保证**其持续可用，也不承担因此产生的任何损失。
- 建议仅用于**个人学习、研究和受控测试**；使用前请自行评估风险。
- 插件管理面板「插件配置」标签页底部也会展示该免责声明与作者信息。

**作者**：HeavenTTT
**功能实现（AI）**：DeepSeek Harness (AI)
**重写版来源**：`bilibili-blacklist-remake`（已冻结为只读归档，见 [`../bilibili-blacklist-remake/ARCHIVED.md`](../bilibili-blacklist-remake/ARCHIVED.md)）

---

## 🚀 安装方式

### 1️⃣ 安装 Tampermonkey

👉 [https://tampermonkey.net/](https://tampermonkey.net/)

### 2️⃣ 安装脚本

👉 [GreasyFork 脚本地址](https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.user.js)
👉 或直接在 [GitHub Releases](https://github.com/HeavenTTT/bilibili-blacklist/releases) 下载 `.user.js` 手动安装
👉 或直接用本仓库的 [`dist/bilibili-blacklist.user.js`](./dist/bilibili-blacklist.user.js)

### 3️⃣ 打开 Bilibili 网站，右上角将出现插件入口，开始使用。

---

## ⬆️ 从 1.x 升级到 2.0.0

- **脚本身份没变**（`@name Bilibili-BlackList`），Tampermonkey 会自动升级；
  旧的黑名单与配置**原样保留**，GM 存储 key 未改动。
- 旧的「遮挡被屏蔽视频」布尔开关会自动迁移到新的 `blockDisplayMode`（开启 → 模糊遮盖加卡比，关闭 → 隐藏卡片）。
- **网络拦截新增但默认关闭**：它会在 Fetch 层改写 B 站推荐/相关接口的响应，属于实验性能力，
  需要时在「插件配置 → 网络与性能」开启。
- `@grant` 新增 `unsafeWindow`（1.x 代码其实一直在用却未声明）与 `GM_registerMenuCommand`，首次升级可能需要重新确认权限。
- **若你装过 `Bilibili-BlackList Remake` 脚本，请卸载它** —— 它与 2.0.0 功能重复。

---

## ✨ 功能一览

- **黑名单**：精确匹配 UP 主名 + 正则匹配（UP 名 / 标题）+ 分类标签 + 视频标签，全部 GM 持久化。
- **卡片屏蔽**：命中黑名单 → 按遮挡模式处理（模糊遮盖 / 模糊遮盖加卡比 / 隐藏卡片），
  也可按屏蔽类型单独覆盖显示方式；卡片悬停显示「屏蔽」按钮。
- **屏蔽原因可视化 + 一键放行**：被屏蔽的卡片显示具体原因
  （`屏蔽原因: UP: xxx` / `标签: xxx` / `视频标签: xxx` / 软广 / 竖屏 / 广告 /
  `正则匹配(无法定位具体规则,…)`）；UP 名精确匹配与分类/视频标签命中的原因可点击，
  删除该条规则并只重判这张卡片。
- **广告屏蔽**：主页 / 搜索页 / 排行榜的推广、直播、分区推送；播放页广告与视频卡片同节奏
  （CSS 预覆盖 → 等 header 就绪 → 按所选模式提交），页面内切视频时重新覆盖再判定。
- **视频标签屏蔽**：调 `/x/tag/archive/tags` 取 `data[].tag_name`；音乐标签与话题标签不展示、不参与匹配。
- **分类标签屏蔽**：调 `view` 接口按分类标签名屏蔽，卡片上带标签按钮可一键加黑名单。
- **cm 软广**：屏蔽 `cm.bilibili.com` 链接。
- **竖屏屏蔽**：按 API 分辨率判断（阈值可调）。
- **悬停临时显示**：遮挡的卡片悬停指定秒数后临时显示，移开重新遮挡（0.1–5 秒）。
- **自动连播处理**：播放页连播遇到被屏蔽视频 → 切换为未屏蔽视频 / 停止播放 / 不处理；支持多 P 感知。
- **用户空间页**：UP 名旁「屏蔽 / 已屏蔽」按钮 + 删除线 + 页面灰度。
- **网络拦截（可选，默认关闭）**：在 Fetch 层过滤首页推荐、相关推荐等接口响应，
  命中黑名单的条目直接不下发；判定只复用卡片判定的缓存，**不额外发请求**。
- **管理面板**（5 个标签页）：精确匹配(Up名字) / 正则匹配(Up/标题) / 屏蔽分类 / 屏蔽标签 / 插件配置，
  含列表模糊搜索、「取消屏蔽 / 恢复屏蔽」、已屏蔽计数。
- **头部统计明细**（默认收起，点右上角箭头展开）：除「已屏蔽视频 N」外分三组列出 ——
  屏蔽原因明细（UP/标题名、广告、CM 软广、分类标签、视频标签、竖屏）、
  网络与请求（网络拦截、其中广告、拦截响应、已判定卡片、view 请求、标签请求）、
  累计与趋势（今日/近 7 天/累计屏蔽、今日/近 7 天拦截、累计判定 + **7 日趋势柱**）。
  统计按天差值落盘（保留 30 天 + all-time 汇总），刷新页面后依然保留，可在配置页清除。
- **队列判定分两阶段**：先做零网络判定（软广链接 > UP 主名精确 > 正则），命中即提交、不发请求也不限速；
  未命中的才请求 `view` / `/x/tag/archive/tags` 接口，带 10 分钟缓存、全局 50ms 最小间隔与 5 秒超时。
- **判定中视觉反馈**：新卡片先用 CSS `filter` 轻微模糊（不插 DOM、不改结构），判定完成后统一提交，
  避免「先显示后被屏蔽」的卡片重排闪烁。
- **切到后台暂停判定（有意设计，勿"优化"）**：页面不可见时队列停在原地、卡片保持模糊遮盖，切回前台继续。
  原因：多开 B 站页面并发请求接口显著提高触发限流概率，后台暂停等于把并发压回单页。
  代价（刻意接受）：后台页面里的卡片会一直糊着，这是设计好的视觉状态，不是 bug。
- **保留的优化**：播放页延迟 5 秒启用（先静默再等顶栏就绪）、标签名列表 12 小时缓存、
  分区表 feed 增量更新、主页屏蔽后布局修正。

控制台前缀统一为 `[🫥BlackList]`。

### 页面支持

| 页面类型 | 是否支持 |
| -------- | -------- |
| B 站主页 `/`、`/index.html` | ✅ |
| 播放页 `/video/` | ✅ |
| 分类页 `/c/` | ✅ |
| 搜索页 `search.bilibili.com` | ✅ |
| 排行榜 / 热门 `/v/popular/rank…`、`/v/popular`、`/ranking…` | ✅ |
| 动态页 `t.bilibili.com` | ✅（以整条动态为屏蔽单位） |
| 用户空间页 `space.bilibili.com` | ✅ |

---

## ⚙️ 插件配置（面板内「插件配置」标签页）

| 分组 | 配置项 |
| ---- | ---- |
| 屏蔽类型开关 | `flagInfo` 标题/UP主名、`flagTName` 分类标签、`flagVideoTag` 视频标签、`flagVertical` 竖屏、`flagAD` 主页推荐(广告)、`flagCM` 主页视频软广 |
| 分类数据与缓存 | `flagAlwaysFetchTName` 始终获取分类标签、分类标签缓存清除、累计统计清除、`flagSkipBlockedAutoplay` 自动连播处理 |
| 显示方式 | `blockDisplayMode` 全局遮挡模式 + `displayModeInfo/AD/TName/VideoTag/CM/Vertical` 六项按类型覆盖、`flagHideOnLoad` 加载时立即隐藏（CSS filter 遮盖） |
| 交互 | `flagHoverReveal` 悬停后显示被遮挡视频、`hoverRevealDelaySeconds` 悬停延迟 |
| 网络与性能 | `logLevel` 插件日志（完全关闭/关键信息/全部，**默认完全关闭**）、`flagNetworkIntercept` 网络拦截（默认关闭）、`blockScanInterval` 卡片扫描间隔、`processQueueInterval` 接口请求间隔、`verticalScaleThreshold` 竖屏比例阈值 |

`flagAlwaysFetchTName`（默认开启）控制「已被 UP 主名/正则/软广命中的卡片是否仍请求接口以显示分类标签按钮」：
开启时这些请求排在低优先级的补标签队列，分类与视频标签始终可见且不拖慢其它卡片；关闭则队列更快
（搜索页翻页尤其明显），代价是这些卡片上看不到分类标签。

### 插件日志

插件往控制台输出的普通日志由「插件配置 → 网络与性能 → **插件日志**」控制，三档：

| 选项 | 输出内容 |
| ---- | -------- |
| 完全关闭（默认） | 除错误与告警外，不输出任何日志 |
| 关键信息 | 分页初始化、脚本装载、自动连播跳转/停止等你能感知的动作 |
| 全部 | 再加上缓存刷新、观察器重连、每次网络拦截的过滤结果等过程性细节 |

- **错误与告警永远输出**，不受这个开关影响 —— 出问题时不会因为日志关了而看不到线索。
- 改完**立即生效**，不需要刷新页面。
- 选「全部」时详细日志走 `console.debug`，DevTools 默认的 Info 级别看不到，
  需要把 Console 的级别切到 **Verbose**。
- 排查问题时建议先开到「关键信息」；报 bug 时请附上该档位的控制台输出。

### 正则表达式（正则匹配标签页）

- 支持**纯 pattern**：`小小.*Official`（默认忽略大小写）
- 支持**显式 flags**：`/小小.*Official/i`、`/吃鸡|pubg/gi`
- 常用示例：`^米哈游`（开头）、`官方$`（结尾）、`华为|荣耀`（或）、`\d+`（数字）、`/.*(混剪|解说).*/i`（标题）
- 无效正则会**自动跳过**并在控制台警告，不影响其它卡片。
- 参考：[MDN 正则表达式指南](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Regular_Expressions)、
  [MDN RegExp 对象](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/RegExp)

---

## 🗂️ 目录结构

```
bilibili-blacklist/
├── build.js                     # 构建脚本（合并模块 -> 单个 .user.js，支持 --dev）
├── build.config.json            # 构建配置（userscript 元数据 + 模块顺序 + 输出文件 + devModules）
├── package.json                 # npm 脚本（build / build:dev / dev）
├── README.md / CHANGELOG.md
├── dist/
│   └── bilibili-blacklist.user.js   # 发布产物（入库，GreasyFork 链接指向它）
├── src/
│   ├── storage/storage.js       # 黑名单 + 配置 + 正则编译缓存（GM 存储）
│   ├── utils/utils.js           # 分区表缓存 / feed 增量更新
│   ├── core/core.js             # 卡片查找 / 屏蔽 / 黑名单增删 / 显示模式
│   ├── core/stats.js            # 按天持久化统计
│   ├── core/video-data.js       # 队列判定 + view / 视频标签接口
│   ├── ui/ui.js                 # 顶栏入口 + 管理面板 + 遮挡层
│   ├── observer/observer.js     # 增量 MutationObserver（含观察根重连）
│   ├── pages/pages.js           # 分页初始化 + SPA 变化监听
│   ├── ads/ads.js               # 广告屏蔽（预覆盖 / 判定三段式）
│   ├── autoplay/autoplay.js     # 自动连播处理
│   ├── network/interceptor.js   # Fetch 响应改写（默认不安装）
│   ├── debug/dev-test.js        # 调试/测试入口（仅 dev 构建注入）
│   └── main.js                  # 主入口：兼容晚注入的立即初始化
├── scripts/
│   └── dev.js                   # 一键开发脚本（以 dev 构建启动）
└── test/
    ├── bilibili-blacklist.dev.user.js  # 油猴加载器（装一次）
    └── s.bat                    # Windows 双击启动开发环境
```

---

## 🔨 构建

```bash
npm run build        # 发布构建
npm run build:dev    # 开发构建（含调试入口）
node build.js        # 等价于 npm run build
```

构建产物：`dist/bilibili-blacklist.user.js`

> **注意**：发布构建**不会包含**调试/测试方法（`window.__blacklistExpose`、`window.__blacklistInterceptors`、
> `window.__blockTestRun` 等）；只有 `--dev` 构建会附加 `src/debug/dev-test.js`。

---

## 🛠️ 开发工作流（推荐）

一条命令完成「构建 + 监听 + 本地服务器」，改完代码**刷新页面**立即生效。

```bash
npm run dev          # 或 node scripts/dev.js，或双击 test\s.bat
```

#### 涉及文件

| 文件 | 作用 |
| ---- | ---- |
| `scripts/dev.js` | 一键开发脚本：dev 构建 → 监听 `src/` 变化自动重建（防抖 150ms）→ 本地静态服务器（no-cache + CORS，双栈监听） |
| `test/bilibili-blacklist.dev.user.js` | 油猴加载器，**只需安装一次**；双 URL 交替（`127.0.0.1` / `localhost`）+ 最多 6 次重试 + 页面角标诊断 |
| `test/s.bat` | Windows 下双击即可启动开发环境 |

#### 1️⃣ 一次性安装加载器

打开 `test/bilibili-blacklist.dev.user.js`，按油猴提示安装；
或先启动服务器后访问 `http://localhost:5173/test/bilibili-blacklist.dev.user.js` 安装。

安装后请**禁用已安装的正式版 `Bilibili-BlackList` 脚本**，避免重复运行。

#### 2️⃣ 启动开发环境

```bash
npm run dev
```

#### 3️⃣ 开始开发

修改 `src/` 下的代码并保存 → 终端提示「构建完成」→ **刷新 B 站页面**即可看到最新效果。
页面左下角出现 `[BlackList Dev] OK: 已加载 (try N)` 说明加载器确实拉到了最新构建。

#### 常见问题排查

- **控制台报「无法连接本地 dev server」**：dev server 未启动或端口被占用，请先运行 `npm run dev`。
- **控制台报「拉取构建产物失败，HTTP 404」**：确认 dev server 工作目录为项目根目录（存在 `dist/`）。
- **改代码后刷新没有变化**：确认终端已出现「构建完成」提示；没有则说明 `src/` 未被监听。
- **页面出现两个卡比图标 / 功能执行两遍**：正式版脚本未禁用，或旧版本脚本未卸载。
- **首次安装后有跨域提示**：油猴弹出允许请求 `localhost` 时选择「始终允许」（加载器已声明 `@connect`）。

---

## 🧪 开发/测试入口（仅 dev 构建）

- `window.__blacklistConfig`：当前全局配置对象引用
- `window.__blacklistInterceptors`：网络拦截安装 / 配置入口
- `window.__blacklistExpose`：`stats()` / `blockStats.*` / `panel.open|close|toggle` /
  `testBlock100(n)` / `probeInterceptFields(on)` / `interceptUrlPatterns()`
- URL 钩子：`#bl-open-panel`（自动开面板并打印自检）、`#bl-probe-fields`（勘查接口字段）、
  `#bl-probe-dom`（勘查当前页面卡片 DOM）

---

## 📒 更新记录

详见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📜 开源许可

MIT License.

---

## 🤝 致谢

- **HeavenTTT** —— 原版 Bilibili-BlackList 的思路与基础实现
- **DeepSeek Harness (AI)** —— 2.0.0 功能主体的重写实现
- **afk666jpg** —— 主页 `index.html` 识别与悬停显示被遮挡视频（PR #12）
- ChatGPT / Gemini / DeepSeek —— 早期版本的 AI 辅助代码生成
- Tampermonkey 油猴脚本平台

---

**Enjoy a clean and personalized Bilibili! 🚀**
