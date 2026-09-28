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


// 从存储中获取全局配置，并为旧版本配置补齐新增字段 / 修复非法取值。
// 默认值（defaultGlobalPluginConfig）、取值约束（SETTING_CONSTRAINTS / SETTING_ENUMS）
// 与归一化（normalizeGlobalConfig）统一在 src/data/settings.js —— 面板输入框读的是同一份约束，
// 因此不再存在「面板能存进、运行期非法」的口子。
let globalPluginConfig = normalizeGlobalConfig(GM_getValue("globalConfig", {}));

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
