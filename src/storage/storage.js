/*
 * 存储模块
 * -----------------------------------------------------------
 * 黑名单与全局配置的加载 / 保存（基于 GM_getValue / GM_setValue）。
 */
// 从存储中获取黑名单
// 默认精确匹配黑名单（匹配时忽略大小写，见 core.js 的 getExactBlacklistMatch）
let exactMatchBlacklist = GM_getValue("exactBlacklist", [
  "绝区零",
  "崩坏星穹铁道",
  "崩坏3",
  "原神",
  "米哈游miHoYo",
]);
// 默认正则匹配黑名单（不区分大小写）
let regexMatchBlacklist = GM_getValue("regexBlacklist", [
  "王者荣耀",
  "和平精英",
  "PUBG",
  "绝地求生",
  "吃鸡",
]);
// 默认标签名黑名单
let tagNameBlacklist = GM_getValue("tNameBlacklist", []);
// 默认视频标签黑名单
let videoTagBlacklist = GM_getValue("videoTagBlacklist", []);


// 从存储中获取全局配置，并为旧版本配置补充新增字段
const defaultGlobalPluginConfig = {
  flagInfo: true, // 启用/禁用按UP主名/标题屏蔽
  flagAD: true, // 启用/禁用屏蔽一般广告
  flagTName: true, // 启用/禁用按标签名屏蔽（需要API调用）
  flagVideoTag: true, // 启用/禁用按视频标签屏蔽（需要详情API调用）
  // 始终获取分类标签：开启（默认）时，即使卡片已被 UP主名/正则/软广命中、判定上不再需要接口，
  // 仍会在低优先级补一次请求，保证分类标签按钮始终可见；关闭可显著减少请求数、加快队列处理。
  flagAlwaysFetchTName: true,
  flagCM: true, // 启用/禁用屏蔽cm.bilibili.com软广
  blockDisplayMode: "kirby", // 全局遮挡模式：blur=模糊遮盖 / kirby=模糊遮盖加卡比 / hide=隐藏卡片
  // 各屏蔽类型独立行为（inherit=继承全局）
  displayModeInfo: "inherit",
  displayModeAD: "inherit",
  displayModeTName: "inherit",
  displayModeVideoTag: "inherit",
  displayModeCM: "inherit",
  displayModeVertical: "inherit",
  flagHeaderButton: true, // 是否在顶栏显示管理按钮（油猴菜单可切换）
  // 是否启用网络拦截（改写推荐/相关接口响应）。
  // 2.0.0 起**默认关闭**：它会改写 B 站接口响应体（Fetch 层），属于实验性能力，
  // 保持旧版「只动 DOM、不动请求」的默认安全边界；需要时可在面板「网络与性能」里开启。
  flagNetworkIntercept: false,
  flagHoverReveal: false, // 启用/禁用悬停后临时显示被遮挡视频
  hoverRevealDelaySeconds: 1, // 悬停显示延迟（秒）
  processQueueInterval: 200, // 处理队列中单个卡片的延迟时间（毫秒）
  blockScanInterval: 200, // BlockCard扫描新卡片的间隔时间（毫秒）
  flagHideOnLoad: true, // 启用/禁用页面加载时自动隐藏
  flagVertical: true, // 启用/禁用屏蔽竖屏视频
  verticalScaleThreshold: 0.7, // 竖屏视频的宽高比阈值（0-1）
  // 自动连播遇到被屏蔽视频时的处理方式（三态）：
  //  "skip" = 切换到未屏蔽视频；"stop" = 停止播放；"off" = 不处理（B站默认行为，继续播放被屏蔽视频）
  flagSkipBlockedAutoplay: "off",
};
let globalPluginConfig = {
  ...defaultGlobalPluginConfig,
  ...(GM_getValue("globalConfig", {}) || {}),
};

// 防止旧配置或手动修改写入超出允许范围的悬停延迟
const storedHoverRevealDelay = Number(
  globalPluginConfig.hoverRevealDelaySeconds
);
globalPluginConfig.hoverRevealDelaySeconds = Number.isFinite(
  storedHoverRevealDelay
)
  ? Math.min(5, Math.max(0.1, storedHoverRevealDelay))
  : defaultGlobalPluginConfig.hoverRevealDelaySeconds;

// 校验/修复自动连播处理方式，只允许 "skip" / "stop" / "off"
const AUTOPLAY_SKIP_MODES = ["skip", "stop", "off"];
if (!AUTOPLAY_SKIP_MODES.includes(globalPluginConfig.flagSkipBlockedAutoplay)) {
  globalPluginConfig.flagSkipBlockedAutoplay =
    defaultGlobalPluginConfig.flagSkipBlockedAutoplay;
}

// 校验/修复数值型配置：防止历史配置或手改写入过小/过大的值
const clampNumber = (value, min, max, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
};
globalPluginConfig.blockScanInterval = clampNumber(
  globalPluginConfig.blockScanInterval,
  10,
  5000,
  defaultGlobalPluginConfig.blockScanInterval
);
globalPluginConfig.processQueueInterval = clampNumber(
  globalPluginConfig.processQueueInterval,
  5,
  10000,
  defaultGlobalPluginConfig.processQueueInterval
);
globalPluginConfig.verticalScaleThreshold = clampNumber(
  globalPluginConfig.verticalScaleThreshold,
  0.1,
  1,
  defaultGlobalPluginConfig.verticalScaleThreshold
);

// 旧版 flagKirby(布尔) 迁移为 blockDisplayMode
if (
  globalPluginConfig.blockDisplayMode === undefined &&
  typeof globalPluginConfig.flagKirby === "boolean"
) {
  globalPluginConfig.blockDisplayMode = globalPluginConfig.flagKirby ? "kirby" : "hide";
}
// 校验遮挡模式取值
const DISPLAY_MODES = ["blur", "kirby", "hide"];
if (!DISPLAY_MODES.includes(globalPluginConfig.blockDisplayMode)) {
  globalPluginConfig.blockDisplayMode = defaultGlobalPluginConfig.blockDisplayMode;
}
const PER_TYPE_DISPLAY_KEYS = [
  "displayModeInfo",
  "displayModeAD",
  "displayModeTName",
  "displayModeVideoTag",
  "displayModeCM",
  "displayModeVertical",
];
for (const key of PER_TYPE_DISPLAY_KEYS) {
  if (!["inherit"].concat(DISPLAY_MODES).includes(globalPluginConfig[key])) {
    globalPluginConfig[key] = "inherit";
  }
}

// 将黑名单保存到存储中
function saveBlacklistsToStorage() {
  GM_setValue("exactBlacklist", exactMatchBlacklist);
  GM_setValue("regexBlacklist", regexMatchBlacklist);
  GM_setValue("tNameBlacklist", tagNameBlacklist);
  GM_setValue("videoTagBlacklist", videoTagBlacklist);
}

// 将全局配置保存到存储中
function saveGlobalConfigToStorage() {
  GM_setValue("globalConfig", globalPluginConfig);
}

// 标签名列表：存储ID到名称的映射
let tagNameList = GM_getValue("tagNameList", []); // 默认为空数组，每个条目为 { id, name , name_v2}
let tagListLastTime = GM_getValue("tLastTime", 0);
// feed（popular/ranking）增量更新分区表的独立 12h 节流时间戳，与 channelKv 更新分开。
let tagFeedLastTime = GM_getValue("tFeedLastTime", 0);
// 将标签名列表保存到存储中（同时刷新 channelKv 的 tLastTime 计时）
function saveTagNameListWithTimestamp() {
  GM_setValue("tagNameList", tagNameList);
  GM_setValue("tLastTime", Date.now());
}
// 仅保存标签名列表，不刷新 channelKv 的 tLastTime（供 feed 增量更新独立计时使用）
function saveTagNameListOnly() {
  GM_setValue("tagNameList", tagNameList);
}

// 根据ID查找标签名
function getTagNameById(id) {
  if (id === null || id === undefined) return null;
  // 支持字符串或数字ID
  const entry = tagNameList.find(entry => entry.id == id); // 使用宽松相等以匹配类型
  return entry ? { name: entry.name, name_v2: entry.name_v2 } : null;
}
// 根据name_v2查找标签名
function getTagNameByV2(name_v2) {
  if (name_v2 === null || name_v2 === undefined) return null;
  // 支持字符串或数字ID
  const entry = tagNameList.find(entry => entry.name_v2 == name_v2); // 使用宽松相等以匹配类型
  return entry ? entry.name: null;
}
// ============ 正则表达式工具（支持 /pattern/flags，默认 i） ============
const REGEX_FLAGS_ALLOWED = "dgimsuvy";
const regexCache = new Map();   // 原始串 -> RegExp | null（无效）

/**
 * 解析一条用户输入的正则：支持 /pattern/flags 与纯 pattern 两种写法。
 * @param {string} entry
 * @returns {{pattern: string, flags: string}|null}
 */
function parseRegexEntry(entry) {
  entry = String(entry == null ? "" : entry).trim();
  if (!entry) return null;
  // 形如 /pattern/flags
  if (entry.charAt(0) === "/") {
    const lastSlash = entry.lastIndexOf("/");
    if (lastSlash <= 0) return null;
    const pattern = entry.slice(1, lastSlash);
    let flags = entry.slice(lastSlash + 1).trim();
    if (flags.length === 0) flags = "i";
    for (let i = 0; i < flags.length; i++) {
      if (REGEX_FLAGS_ALLOWED.indexOf(flags.charAt(i)) === -1) return null;
    }
    return { pattern: pattern, flags: flags };
  }
  // 纯 pattern：默认忽略大小写
  return { pattern: entry, flags: "i" };
}

/**
 * 编译并缓存一条正则；无效返回 null（并给出警告）。
 * @param {string} entry
 * @returns {RegExp|null}
 */
function compileRegex(entry) {
  if (regexCache.has(entry)) return regexCache.get(entry);
  let re = null;
  const parsed = parseRegexEntry(entry);
  if (parsed) {
    try {
      re = new RegExp(parsed.pattern, parsed.flags);
    } catch (e) {
      console.warn("[🫥BlackList] 无效正则表达式，已跳过:", entry, e.message);
      re = null;
    }
  }
  regexCache.set(entry, re);
  return re;
}

/** 清空正则编译缓存（黑名单变化后调用） */
function invalidateRegexCache() {
  regexCache.clear();
}
