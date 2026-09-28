# 代码重构 / 规整建议（bilibili-blacklist 2.0.0）

> 审阅范围：`src/` 全部 14 个模块、`build.js`、`scripts/dev.js`、`test/` 加载器、
> `build.config.json`、`package.json`、`.gitignore`、`README.md`、已入库的
> `dist/bilibili-blacklist.user.js`。
>
> 方法说明：本次为**静态审阅**。本机 PowerShell 在此工作区被沙箱拒绝
> （`SetNamedSecurityInfoW / grantWrite` 失败），因此**没有实际执行** `npm run build`、
> `npm run dev` 或任何测试；涉及“产物是否与源码同步”的判断来自源码与已入库 `dist/` 的逐项对照。
> 落地每一步后请自行跑一次 `npm run build` + `node --check dist/*.user.js` 复核。

---

## 0. 进展（已落地 / 未做）

已落地（每项都经过构建 + `npm run check` 验证）：

- ✅ **P0-1** 队列异常兜底：`processVideoCardQueue` 用 `.catch/.finally` 收口，异常不再让队列永久停摆，
  正在判定的卡片按放行收尾（`src/core/video-data.js`）。
- ✅ **P0-2** dev 产物分离：`dist/bilibili-blacklist.dev.user.js`（不入库、`@name` 带 ` -Dev`、不写更新地址）；
  已实测「跑 dev 构建不改变发布产物字节」。
- ✅ **P0-3** 配置约束单一真源：`src/data/settings.js` 的 `SETTING_CONSTRAINTS`/`SETTING_ENUMS`
  同时驱动加载校验与面板控件，越界值不再能存进存储。
- ✅ **P0-4** 判定规则单一真源：`src/domain/matchers.js`（卡片 / 自动连播 / 网络拦截三处共用）。
- ✅ **P1-2** 屏蔽类型注册表：`src/domain/block-types.js`（原 7 处副本）。
- ✅ **P1-3** 统计字段派生：`src/core/stats.js` 的 `BLOCK_STATS_EXTRA_SOURCES` + 类型注册表，
  dev 自检不再写死“18 行/标签串”。
- ✅ **P1-4** 抓取骨架单一出口：`requestBiliApiJson`（限速 / 超时 / 计数只写一次），
  自动连播的裸 fetch 也收编（顺带修掉它没有超时与限速的问题）。
- ✅ **P1-6** 判定分支与重试骨架去重：`evaluateTagAndShape` / `requeueForRetry`。
- ✅ **P1-1** `ui.js` 拆分：1 个 2248 行文件 → 8 个模块（styles / icons / card-buttons / overlay /
  header-button / stats-display / panel / settings-panel）。
- ✅ **P2-2** 构建时校验 `src/` 下每个 `.js` 都已登记（负向测试：未登记文件会让构建以退出码 1 失败）。
- ➕ 新增 `scripts/check-bundle.js`（`npm run check`）：零依赖的**产物冒烟检查**，
  用最小 DOM 桩装载真实产物并跑到面板建成为止 —— 这是 P2-4 第 4 项的落地形态（无 jsdom 依赖）。

未做（有意留在后续）：

- ⬜ **P1-5 页面画像 `PAGE_PROFILES`**：涉及 core/ui/observer/pages 四处的选择器与归一逻辑，
  属于行为面最大的搬运，建议在有了更多页面级回归手段后再做。
- ⬜ **P2-1** 手写去注释词法器替换为 esbuild/terser；**P2-4 其余**（`jsconfig`+`@ts-check`、eslint、vitest）；
  **P2-5~P2-9**（命名统一、注释漂移、定时器登记等）。

> 拆分 `ui.js` 时使用的等价性验证手法（供后续搬运复用）：
> 1. 备份拆分前的构建产物作为基线；
> 2. 拆分后比对「第一个 `GM_addStyle` 载荷是否逐字节一致」（覆盖 600 行 CSS 的搬运：本次 13348 字符完全一致）；
> 3. 比对「基线产物的每个非空格行是否都仍出现在新产物中、且出现次数不少于基线」
>    —— 重排模块不会改变任何一行代码，因此该检查能抓住任何被搬丢/改坏的行（本次 3302 种行全部保留）；
> 4. 逐函数比对：拆分前的 `ui.js`（取 git 索引里的版本）中**每个顶层函数**都必须在新文件里逐字节一致
>    （含注释；本次 38 个函数全部一致，0 缺失 0 改体）。
> 长期留在仓库里的是第 3 项的日常版本：`npm run check` 的「顶层声明无重复」+「初始化路径可跑通」两项；
> 第 2/4 项适合在大规模搬运时临时执行。


---

## 1. 总体评价

先说结论：**这套代码的问题不是“写得乱”，而是“同类知识存在多份副本 + 缺自动化护栏”。**

做得好的地方（重构时应当保留）：

- 模块按职责切分清晰，`build.config.json` 驱动合并顺序，产物可预测。
- 注释质量罕见地高：大量解释“**为什么**这么写”（时序竞争、限流、节点复用、TDZ 等），
  并且对“有意设计、勿改”的部分做了显式标注。这是本项目最有价值的资产，重构时**不要顺手删**。
- 工程细节到位：10 分钟接口缓存、50ms 全局最小请求间隔、5s 请求超时、两阶段判定（零网络优先）、
  差值落盘统计、页面后台暂停判定、观察根失效重连，都是踩过坑才有的设计。

真正需要规整的，是快速迭代（1.x → 2.0.0 重写合并）之后积累的三类结构债：

| 类别 | 表现 | 后果 |
| --- | --- | --- |
| 知识重复 | 屏蔽类型 / 配置项 / 统计字段 / 页面选择器各有 3~7 份副本 | 新增一项要改 7 处，漏一处就静默不一致 |
| 单文件过大 | `ui.js` 2222 行（含 ~600 行 CSS）、`core.js` 1037 行 | 定位慢、diff 噪音大、无法单测 |
| 无护栏 | 无测试 / 无 lint / 无 CI，`devDependencies` 为空 | 上一条只能靠人眼维持，注释里已记录多起“曾因此丢配置项”的事故 |

---

## 2. 关键发现（按优先级）

### P0 — 正确性与发布安全（建议先修）

#### P0-1 `processVideoCardQueue` 没有 `try/finally`，一次异常会让屏蔽功能永久停摆

- 位置：`src/core/video-data.js:490-764`，出口复位 `isVideoCardQueueProcessing = false` 在 `:760`。
- 调用点都是**不 await** 的调用：`src/core/core.js:660`、`src/observer/observer.js:125`。
- 风险：`while` 体内任何一处抛错（DOM 操作、`attachTNameGroupToCard`、第三方 API 返回值变化）
  → 返回的 Promise 变成未捕获 rejection，而标志位永远停在 `true`：
  之后**所有**卡片都停在“未处理”的模糊遮盖态且不再判定，`refreshBlockCountDisplay` 也不再刷新。
  现象是“插件突然什么都不做了”，但控制台只有一条容易忽略的 rejection。
- 建议：整个 `while` 包 `try { ... } finally { isVideoCardQueueProcessing = false; refreshBlockCountDisplay(); updateTNameListFromFeed(); }`；
  并在每次迭代内部单独 `try/catch`（单张坏卡片只跳过它，不打断整条队列）。
- 风险：低。纯兜底，不改变正常路径行为。

#### P0-2 dev 构建会覆盖正式产物，而 `dist/` 是有意入库的

- `build.js:247-264`：`--dev` 与 release 使用同一个 `outputFile`（`build.config.json:28-29`），
  两者都写 `dist/bilibili-blacklist.user.js`。
- `.gitignore:10-12` 明确 `dist/` 入库，GreasyFork `downloadURL` 指向它（`build.config.json:24`）。
- 风险：跑一次 `npm run build:dev`（或 `npm run dev`，`scripts/dev.js` 会先做一次 dev 构建）
  就会把带 `window.__blacklistExpose` / `window.__blacklistInterceptors` 的调试版写进 `dist/`，
  极易随提交进入正式发布渠道——调试入口直接暴露给普通用户。
- 建议：给 dev 单独产物名（`bilibili-blacklist.dev.user.js`）或单独目录（`dist/dev/`），
  并在元数据头加 `-Dev` 标识（`build.js:32-46` 目前两种构建的头完全一致，装机后无法分辨）。
- 连带改动（必须同步，否则开发流断掉）：
  `test/bilibili-blacklist.dev.user.js:26-27`（加载器 URL）、
  `scripts/dev.js:37-41`（`BUILD_URL` / 打印信息）。

#### P0-3 面板的数值校验与存储的 clamp 不是同一套规则

| 配置项 | 面板约束（`src/ui/ui.js:1006-1027`） | 存储 clamp（`src/storage/storage.js:102-119`） |
| --- | --- | --- |
| `blockScanInterval` | 未传 constraints → min=0、无 max | 10 ~ 5000 |
| `processQueueInterval` | 未传 constraints → min=0、无 max | 5 ~ 10000 |
| `verticalScaleThreshold` | 0 ~ 1 | 0.1 ~ 1 |

- 校验只在**保存时**做、clamp 只在**加载时**做 → 用户填 `0` 或 `100000` 能存进去并在本次会话内生效
  （扫描间隔 0 = 几乎每次 mutation 都全量扫描）。
- 建议：把“默认值 / 范围 / 标签 / 说明 / 控件类型”抽成一份 settings schema，
  由它同时驱动 `storage.js` 的校验和 `ui.js` 的面板生成（见 P1-2）。

#### P0-4 “是否命中分类标签 / 视频标签 / 竖屏”有三套独立实现

| 实现 | 位置 | 判定依据 |
| --- | --- | --- |
| 卡片判定 | `src/core/video-data.js:585-615`、`:624-673` | DOM 标签按钮 + 接口数据 |
| 自动连播 | `src/autoplay/autoplay.js:256-303` | 接口数据 |
| 网络拦截 | `src/network/interceptor.js:157-201` | 仅吃已过期内的缓存 |

- 三处各自维护 `tname / tname_v2 / tid_v2` 与宽高比逻辑，规则一变就要改三处，
  且**已经出现口径差异**：`autoplay.js:511-537` 的 `getFirstNonBlockedFromApi` 直接 `fetch`
  `archive/related`，既不限速也无超时，与 `video-data.js:82-91` 建立的“防限流”约定冲突
  （而同模块 `interceptor.js` 的注释明确写“绝不在这里新增请求”）。
- 建议：抽 `domain/matchers.js`，导出 `matchTName(data)` / `matchVertical(data, threshold)` /
  `matchVideoTag(tags, blacklist)`，三处共用；把 `getFirstNonBlockedFromApi` 并入统一抓取层（P1-4）。

### P1 — 结构规整（收益最大，建议排第二批）

#### P1-1 `ui.js` 一个文件承担 7 类职责（2222 行）

| 职责 | 位置 |
| --- | --- |
| 全局 CSS（~600 行模板字符串） | `src/ui/ui.js:1381-1987` |
| SVG 图标 | `:1993-2038` |
| 顶栏按钮 + 油猴菜单 | `:162-315` |
| 卡片按钮事件委托 | `:68-152` |
| 面板骨架 / 页签 | `:1070-1376` |
| 设置面板（手写 6 开关 + 8 下拉 + 3 输入） | `:611-1036` |
| 统计明细渲染 | `:324-432` |
| 遮盖层 / kirby / 悬停显示 | `:2044-2222` |

- 建议按上表拆成 7 个文件；**CSS 移到真正的 `.css` 文件**，由 `build.js` 在求值期内联
  （保留 `GM_addStyle` 调用点），这样能获得编辑器高亮/校验，也不再挤占 JS 的 diff。
- 拆分是纯搬运，可逐块进行，每块单独跑一次构建验证。

#### P1-2 “屏蔽类型”的元数据散落在 7 处

同一个 `info/ad/tname/videoTag/cm/vertical` 概念，被重复描述为：

| 用途 | 位置 |
| --- | --- |
| 原因文案 | `src/core/core.js:88-95`（`BLOCK_REASON_MAP`） |
| 按类型显示模式 | `src/core/core.js:225-237`（`perTypeMap`） |
| 计数 +1 | `src/core/core.js:259-276`（6 个 if） |
| 计数 -1 | `src/core/core.js:481-488`（`decrementBlockCounter`） |
| 类型 → 配置键 | `src/storage/storage.js:133-145`（`PER_TYPE_DISPLAY_KEYS`） |
| 面板明细标签 | `src/ui/ui.js:324-334` |
| 网络拦截原因文案 | `src/network/interceptor.js:144-150`（`STREAM_REASON_TEXT`） |

- 建议：建立单一注册表 `BLOCK_TYPES`，每项形如
  `{ type, label, flag, displayModeKey, counter, cancellable, text(reasonValue) }`；
  上述 7 处全部改为查表。新增一种屏蔽类型将从“改 7 处”变成“注册表加一行”，
  面板、统计、显示模式、计数、原因文案自动跟随。

#### P1-3 统计字段有 4 份副本 + 1 份硬编码断言

- `src/core/stats.js:18-29`（`BLOCK_STATS_KEYS`）、`:34-45`（snapshot 初值）、
  `:93-106`（`getCurrentBlockStatsValues`）、`src/ui/ui.js:324-383`（面板行定义），
  再加上 `src/debug/dev-test.js:141`（断言“统计明细 18 行”）与 `:186-191`（硬编码 18 个标签的确切拼接串）。
- 后果：加一个统计项要改 5 处，且 dev 自检必然失败（它对的是文案而不是数据源）。
- 建议：统计项也走注册表，`dev-test.js` 的期望值从注册表推导，不再写死字符串。

#### P1-4 两次几乎相同的接口抓取骨架

- `src/core/video-data.js:105-143`（view 接口）与 `:159-196`（tag 接口）：
  同样的「长度校验 → 查缓存 → 限速 → 计数 → AbortController 超时 → fetch/json → code 校验 → 写缓存 → catch → finally」。
- 建议：抽 `fetchJsonCached(url, { cache, ttl, timeout, throttle, count })`，
  两个接口各剩 5 行；顺带把 `autoplay.js:511-537` 的裸 `fetch` 收编进同一策略。
- 附带收益：`video-data.js:388-396` 那段“预测本轮是否会真的发请求”的说明可以简化成一次 API 调用。

#### P1-5 页面分支散落在 6 个文件

- 页面判定与初始化混在一起：`src/pages/pages.js:87-133`（主页/动态/搜索）、`:230-308`（播放页）、
  `:450-500`（分类/排行榜）、`:506-587`（用户空间）。
- 页面相关的选择器/归一逻辑分散在：
  `src/core/core.js:553-577`（真实卡片归一）、`:583-599`（卡片选择器）、`:738-798`（UP/标题提取，含 `:773-776` 的分类页特判）、
  `src/ui/ui.js:2198-2202`（遮罩宿主）、`src/observer/observer.js:82-90`（增量卡片/广告选择器）。
- 建议：定义 `PAGE_PROFILES`（`{ id, test(location), cardSelector, normalizeCard(el), upSelectors, titleSelectors, overlayHost(el), adSelector }`），
  新增页面从“改 6 处”变成“加一个 profile”。
- 注意：`isCurrentPageMain()` 双重校验 hostname + pathname 的教训（`:87-90`）应保留并在 profile 的 `test` 中体现。

#### P1-6 `processVideoCardQueue` 的两个分支几乎是复制粘贴

- `src/core/video-data.js:578-616`（已有标签组）与 `:618-690`（首次挂标签）内含同一段
  「tname → videoTag → vertical」判定与同一段 vertical 阈值计算（`:602-615` vs `:660-673`）。
- 建议：抽 `evaluateFacts(card, data)` 返回 `{ matchedTag, matchedVideoTag, isVertical }`，
  两个分支只保留各自的“重试策略”差异。

### P2 — 构建与工程护栏

#### P2-1 `build.js` 里的手写“去注释词法器”是长期隐患

- `build.js:71-229`（约 160 行、5 个状态布尔）自己扫描 `//`、`/*`、`'`、`"`、`` ` ``，
  但**不识别正则字面量**。当前源码中的正则恰好都安全（已逐一核对 11 处字面量），
  但下面任一写法都会让产物被静默改坏：
  - 正则里出现 `//`：`/https?:\/\//` → 尾部 `//` 被当成行注释，行尾代码被删；
  - 正则里出现引号：`/["']/` → 进入字符串状态并吞掉后续代码；
- 这类事故本项目已经发生过一次（注释里记录了 `defaultGlobalPluginConfig` 配置项被整段删除，
  见 `build.js:177-181`）。而且“产物仍是合法 JS”使得 `node --check` 也拦不住。
- 建议（三选一，按成本排序）：
  1. 直接**去掉** `stripComments`——源码注释不进产物并不影响运行，用体积换确定性；
  2. 引入 `esbuild` / `terser` 做真正的压缩（同时解决注释、体积、sourcemap）；
  3. 保留现状，但补一个 **golden 测试**：构建后断言关键标识符/配置键齐全 + `node --check`。

#### P2-2 模块清单与磁盘文件无一致性校验

- `build.config.json:30-47` 手写 `modules`；新增 `src/**.js` 忘记登记 → 该文件**静默不参与打包**，
  而 `src/main.js:17` 这类“跨模块变量是否存在”的运行时探测会把症状伪装成正常。
- 建议：`build.js` 里 walk `src/**/*.js` 与 `modules`（+`devModules`）对比，未登记即报错退出。

#### P2-3 死配置

- `build.config.json:6-8` 的 `userscript.contributors` 从未被 `buildHeader()`（`build.js:32-46`）读取或输出。
- 建议：要么在 `buildHeader` 里支持 `@contributor`，要么删掉；并给 `build.config.json` 加未知键告警。

#### P2-4 仓库没有任何自动化护栏

`package.json:6-10` 只有 3 个 build 脚本，`:27` `devDependencies` 为空；无 `.github/`、无 eslint/prettier 配置、无测试。

在“多文件拼接成单个 IIFE、共享全局作用域”这种架构下，**最大的失效模式是拼错变量名/漏传参数**——
这类错误只有运行时才炸，而且位置往往离现场很远。建议最小护栏（见 §5 可直接照抄）：

1. `jsconfig.json` + 各文件顶部 `// @ts-check` + `types/globals.d.ts` 声明 `GM_*` / `unsafeWindow` / `__DSH_DEV__`。
   本仓库的文件都是无 `import/export` 的脚本，TS 会把它们视为同一全局作用域，
   **跨文件引用的变量/函数能被正确解析**——这正好治本项目的病，成本却极低。
2. ESLint flat config，先只开 `no-undef` / `no-unused-vars` / `no-redeclare`。
3. `vitest` + `jsdom`，先只测纯函数：`parseRegexEntry` / `compileRegex`（`storage.js:198-236`）、
   `clampNumber`（`:98-101`）、`getEffectiveDisplayMode`（`core.js:225-237`）、
   `buildBlockReasonText` / `isReasonCancellable`（`core.js:306-350`）、
   `normalizeVideoTagName` / `getEligibleVideoTags`（`video-data.js:203-234`）、
   `mergeTNameListItems`（`utils/utils.js:50-76`）、`flushBlockStats` 差值逻辑（`stats.js:133-155`）、
   `getSearchPageKey` / `isCurrentPageRanking`（`pages.js:161-174`、`:476-478`）。
4. 一个**产物冒烟测试**：stub `GM_*` → 在 jsdom 中 `eval` 构建产物 → 注入各页面 DOM fixture
   → 断言无异常且命中卡片被遮挡。这是唯一能拦住 P2-1 类事故的测试形态。
5. `npm run verify`：构建后与入库的 `dist/` 比对，防止产物漂移（`dist/` 入库是该项目的既定约束）。

#### P2-5 命名与风格不一致

- `isfirstLoad`（`src/pages/pages.js:71`）→ 应为 `isFirstLoad`。
- `src/network/interceptor.js` 全篇 `var` + `function`（`:17,37,50,55,65,209,245,295…`），
  与其余文件的 `const`/箭头函数风格不一致。
- `name_v2` 蛇形命名贯穿内部数据结构（`storage.js:161`、`utils/utils.js:31`）；
  建议仅在“接口原始字段”边界保留蛇形，内部对象统一 camelCase。
- `src/utils/utils.js` 名不副实（只做分区表缓存），建议改名 `src/data/tname-list.js`（记得同步 `build.config.json`）。

#### P2-6 注释与实现漂移（已核实）

- 真实值：`PENDING_FILTER_STYLE = "blur(8px) grayscale(0.5) opacity(0.4)"`（`core.js:61`）。
- 但 `core.js:177` 与 `:617-620` 的注释仍写“模糊 2px + 灰度 20%”。
- 建议：注释只描述语义（“未处理遮盖”），不复述参数值；或改用常量名引用。

#### P2-7 代码里引用了不在仓库的文档

- `src/pages/pages.js:276` 指向 `TEST_FLOW.md §7` 与 `videotest.md`，
  而这两个文件被 `.gitignore:16-17` 有意排除。
- 影响：新克隆的维护者（以及任何 AI 助手）**拿不到“为什么必须 5 秒静默”的论据**，
  只剩下“勿改”的结论——正是这类注释最容易被后来者推翻。
- 建议：把关键结论就地写进注释；或把这两份文档移入仓库（例如 `docs/`）。

#### P2-8 定时器/监听器没有集中登记

- `pages.js:149`、`:333` 的 `setInterval`，`observer.js:16`、`stats.js:242-246`、
  `autoplay.js:679-689` 各自 `addEventListener`，均无清理入口。
- 在 userscript 生命周期内无害，但排查“为什么还在跑”很困难，也挡住将来的 SPA 干净重入。
- 建议：加一个极薄的 `timers/listeners` 登记表 + `teardown()`（不必真的调用，登记本身就有价值）。

#### P2-9 `markAllVideoCardsPending` 漏了配置闸门

- `core.js:207-211` 无 `flagHideOnLoad` / `isShowAllVideos` 判断，被 `pages.js:263` 无条件调用；
  而正常入队路径 `core.js:621` 是有闸门的（广告侧的 `ads.js:108-114` 也有）。
- 后果：关闭“加载时立即隐藏卡片”或点了“取消屏蔽”时，进入播放页仍会先把卡片糊一遍。
- 建议：两条路径统一走同一个 `shouldApplyPendingFilter()` 判定。

---

## 3. 建议的目标结构

不要求一次到位；目录只体现**边界**，迁移可以逐个文件做，每步都能独立构建验证。

```
src/
  main.js                  # 入口：晚注入兜底（现状即如此）
  platform/
    page-detect.js         # isCurrentPage* + PAGE_PROFILES（唯一真源）
    url-change.js          # pushState/replaceState/popstate 统一监听（现 pages.js:411-442）
    timers.js              # 定时器/监听器登记 + teardown
  domain/
    block-types.js         # BLOCK_TYPES 注册表（唯一真源）
    matchers.js            # tname / videoTag / vertical / info 判定（DOM + 数据两种形态）
    blacklist.js           # 黑名单增删查 + 正则编译缓存（现 storage.js:189-241）
  data/
    settings.js            # defaults + schema + 校验/迁移（唯一真源）
    storage.js             # 仅 GM 读写
    stats.js               # 按天统计
    tname-list.js          # 分区表缓存（原 utils/utils.js）
    bili-api.js            # fetchJsonCached + view / tag / related
  blocking/
    card-queue.js          # 队列判定（含 try/finally）
    card-dom.js            # 卡片选择/归一/信息提取/容器
    overlay.js             # 遮盖层 / kirby / 悬停显示
    ads.js
    autoplay.js
    network-intercept.js
  ui/
    styles.css             # 真 CSS，构建时内联
    panel.js               # 面板骨架 + 页签
    settings-panel.js      # 由 settings schema 生成
    stats-panel.js         # 由 BLOCK_TYPES / 统计键生成
    header-button.js
    delegation.js
    icons.js
```

---

## 4. 分步实施计划

每一步都能单独构建、单独验证；建议**每步一次提交**，便于回滚。

| 步骤 | 内容 | 预估 | 验证方式 |
| --- | --- | --- | --- |
| 0 | 护栏：`jsconfig`+`@ts-check`、eslint/prettier、vitest、build 模块清单校验、dev 产物分离（P0-2） | 0.5 天 | 首次 `ts-check`/lint 输出即为待修清单 |
| 1 | 单一真源：`BLOCK_TYPES` + settings schema + 统计键注册表（P1-2、P1-3、P0-3） | 1~2 天 | 纯函数单测 + `dev-test` 自检改为从注册表推导 |
| 2 | 判定收敛：`matchers.js` + `bili-api.js` + 合并 `processVideoCardQueue` 的重复分支 + 加 `try/finally`（P0-1、P0-4、P1-4、P1-6） | 1~2 天 | 冒烟测试覆盖各页面 fixture |
| 3 | `ui.js` 拆分（P1-1）：styles → icons → delegation → header-button → panels → overlay，逐块搬运 | 1 天 | 每块搬运后构建 + 面板自检 |
| 4 | 页面画像：`PAGE_PROFILES` + `page-detect.js`（P1-5） | 1 天 | 各页面冒烟 + 现有页面行为不变 |
| 5 | （可选，长期）迁移 ESM + `esbuild` 打包为单 IIFE，删掉手写 `stripComments` | 1~2 天 | 产物逐段 diff，仅允许预期差异 |

**顺序理由**：先有护栏再动结构，否则大范围搬运无法验证；先收敛“数据真源”再拆 UI，
因为面板生成依赖注册表；最后才动页面画像与打包方式，因为它们影响面最大。

---

## 5. 可直接照抄的护栏配置

`jsconfig.json`（关键点是文件保持无 `import/export`，从而共享同一全局作用域语义）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "allowJs": true,
    "maxNodeModuleJsDepth": 0
  },
  "include": ["src/**/*.js", "types/**/*.d.ts"]
}
```

`types/globals.d.ts`（示例，按需补齐）：

```ts
declare function GM_getValue<T>(key: string, def: T): T;
declare function GM_setValue(key: string, value: any): void;
declare function GM_addStyle(css: string): void;
declare function GM_registerMenuCommand(name: string, fn: () => void): void;
declare const unsafeWindow: any;
declare const __DSH_DEV__: boolean | undefined;
```

`package.json` scripts 建议补充：

```json
{
  "scripts": {
    "build": "node build.js",
    "build:dev": "node build.js --dev",
    "dev": "node scripts/dev.js",
    "check": "tsc -p jsconfig.json",
    "lint": "eslint src build.js scripts",
    "test": "vitest run",
    "verify": "node build.js && git diff --exit-code -- dist"
  }
}
```

`dev-test.js` 的自检断言建议改为从注册表推导（当前 `:141` 写死 18 行、`:186-191` 写死整串标签），
避免“加一个统计项就自检失败”的假警报。

---

## 6. 不建议做的

- **不要**为了“模块化”引入 webpack / 框架 / 状态库。单个 userscript 产物是最优形态，
  `esbuild` 已是上限；再往上加只会让构建链更脆。
- **不要**顺手改被注释标为“有意设计，勿改”的时序：播放页 5s 静默、后台暂停判定、
  进入页面先 filter 遮盖、`waitForContainer` 不合并静默期。
  重构时把它们**具名化**（提取常量/函数、保留原注释与论据）就是正确做法，行为必须保持不变。
- **不要**一次性搬完所有文件。扁平 IIFE 架构下，全局作用域是共享的，
  大范围移动会让“谁定义了 `videoHeaderReady`”这类问题在 diff 中不可见。

---

## 7. 验收与回归基线

1. 每步之后：`npm run build` + `node --check dist/bilibili-blacklist.user.js`。
2. 产物 diff 只允许出现预期变化；若出现无关的函数被删除，说明踩到了 P2-1 之外的拼接陷阱。
3. 用现有 dev 入口做功能基线（`README.md:241-249`）：
   `window.__blacklistExpose.stats()` 各项计数、`blockStats.summary()`、
   `#bl-open-panel` 触发的 `__panelSelfCheck()` 全 PASS。
4. 若引入 `verify`：`dist/` 入库 + 构建可复现，两者必须一致，否则发布物与源码会漂移。
