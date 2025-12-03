// 存储管理模块
// 默认精确匹配黑名单（区分大小写）
const DEFAULT_EXACT_MATCH_BLACKLIST = [
  "绝区零",
  "崩坏星穹铁道",
  "崩坏3",
  "原神",
  "米哈游miHoYo",
];

// 默认正则匹配黑名单（不区分大小写）
const DEFAULT_REGEX_MATCH_BLACKLIST = [
  "王者荣耀",
  "和平精英",
  "PUBG",
  "绝地求生",
  "吃鸡",
];

// 默认标签名黑名单
const DEFAULT_TAG_NAME_BLACKLIST = ["手机游戏"];

// 默认全局配置
const DEFAULT_GLOBAL_CONFIG = {
  flagInfo: true, // 启用/禁用按UP主名/标题屏蔽
  flagAD: true, // 启用/禁用屏蔽一般广告
  flagTName: true, // 启用/禁用按标签名屏蔽（需要API调用）
  flagCM: true, // 启用/禁用屏蔽cm.bilibili.com软广
  flagKirby: true, // 启用/禁用被屏蔽视频的卡比覆盖模式
  processQueueInterval: 200, // 处理队列中单个卡片的延迟时间（毫秒）
  blockScanInterval: 200, // BlockCard扫描新卡片的间隔时间（毫秒）
  flagHideOnLoad: true, // 启用/禁用页面加载时自动隐藏
  flagVertical: true, // 启用/禁用屏蔽竖屏视频
  verticalScaleThreshold: 0.7 || 0.7, // 竖屏视频的宽高比阈值（0-1）
};

window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.StorageManager = (function() {
  // 从存储中获取黑名单
  let exactMatchBlacklist = GM_getValue("exactBlacklist", DEFAULT_EXACT_MATCH_BLACKLIST);
  // 默认正则匹配黑名单（不区分大小写）
  let regexMatchBlacklist = GM_getValue("regexBlacklist", DEFAULT_REGEX_MATCH_BLACKLIST);
  // 默认标签名黑名单
  let tagNameBlacklist = GM_getValue("tNameBlacklist", DEFAULT_TAG_NAME_BLACKLIST);

  // 从存储中获取全局配置
  let globalPluginConfig = GM_getValue("globalConfig", DEFAULT_GLOBAL_CONFIG);

  // 将黑名单保存到存储中
  function saveBlacklistsToStorage() {
    GM_setValue("exactBlacklist", exactMatchBlacklist);
    GM_setValue("regexBlacklist", regexMatchBlacklist);
    GM_setValue("tNameBlacklist", tagNameBlacklist);
  }

  // 将全局配置保存到存储中
  function saveGlobalConfigToStorage() {
    GM_setValue("globalConfig", globalPluginConfig);
  }

  return {
    exactMatchBlacklist,
    regexMatchBlacklist,
    tagNameBlacklist,
    globalPluginConfig,
    saveBlacklistsToStorage,
    saveGlobalConfigToStorage
  };
})();