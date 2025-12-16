function loadStorageModule() {
  // 从存储中获取黑名单
  // 默认精确匹配黑名单（区分大小写）
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

  // 从存储中获取全局配置
  let globalPluginConfig = GM_getValue("globalConfig", {
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
  });

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

  // 标签名列表：存储ID到名称的映射
  let tagNameList = GM_getValue("tagNameList", []); // 默认为空数组，每个条目为 { id, name , name_v2}
  let tagListLastTime = GM_getValue("tLastTime", 0);
  // 将标签名列表保存到存储中
  function saveTagNameListToStorage() {
    GM_setValue("tagNameList", tagNameList);
    GM_setValue("tLastTime", Date.now());
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
}