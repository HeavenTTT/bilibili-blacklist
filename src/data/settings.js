/*
 * 插件配置（单一真源）
 * -----------------------------------------------------------
 * 三件本来会各自漂移的知识统一到这里：
 *   1. 默认值        —— defaultGlobalPluginConfig
 *   2. 取值约束      —— SETTING_CONSTRAINTS / SETTING_ENUMS（加载归一化与面板输入共用）
 *   3. 归一化 / 迁移 —— normalizeGlobalConfig
 *
 * 为什么：面板（ui.js）原先自己写死 min/max，而这里只在**加载时** clamp，
 * 两边口径不一致 —— blockScanInterval 面板无上界、verticalScaleThreshold 面板允许 0，
 * 用户存进去的值在本次会话内直接生效。现在面板的 createSettingInput 读 SETTING_CONSTRAINTS，
 * UI 与存储不可能再漂移。
 *
 * 模块顺序：本文件必须在 storage.js 之前求值（storage 在求值期调用 normalizeGlobalConfig）。
 * 对 globalPluginConfig / BLOCK_TYPES 的读取都在函数调用期，不在求值期。
 */

/** 全局配置默认值；新增配置项只需加在这里，旧版本缺字段由 normalizeGlobalConfig 补齐。 */
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
  // 插件日志级别（见 src/utils/logger.js）：
  //   "off"     完全关闭（默认）—— 只保留错误与告警
  //   "info"    关键信息 —— 分页初始化、用户可感知的动作结果
  //   "verbose" 全部 —— 再加上缓存刷新 / 观察器重连 / 每次网络拦截等过程细节
  // 注意：**错误与告警不受本项影响**，永远输出。
  logLevel: "off",
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

/**
 * 数值型配置的允许范围。
 * 面板输入框（ui.js 的 createSettingInput）与加载校验（clampSetting）共用同一份 —— 
 * 这是修复「面板能存进运行期非法值」的关键：范围只在这里写一次。
 */
const SETTING_CONSTRAINTS = {
  hoverRevealDelaySeconds: { min: 0.1, max: 5, step: 0.1 },
  blockScanInterval: { min: 10, max: 5000, step: 10 },
  processQueueInterval: { min: 5, max: 10000, step: 5 },
  verticalScaleThreshold: { min: 0.1, max: 1, step: 0.05 },
};

/**
 * 枚举型配置的允许取值（顺序即面板下拉顺序）。
 * 校验与面板下拉共用；选项上的中文文案留在 ui.js（那是展示层的事）。
 */
const SETTING_ENUMS = {
  logLevel: ["off", "info", "verbose"],
  flagSkipBlockedAutoplay: ["skip", "stop", "off"],
  blockDisplayMode: ["blur", "kirby", "hide"],
};

/**
 * 把数值限定在 SETTING_CONSTRAINTS 的范围内；非数字回退默认值。
 * @param {*} value
 * @param {keyof typeof SETTING_CONSTRAINTS} key
 * @returns {number}
 */
function clampSetting(value, key) {
  const { min, max } = SETTING_CONSTRAINTS[key];
  const num = Number(value);
  return Number.isFinite(num)
    ? Math.min(max, Math.max(min, num))
    : defaultGlobalPluginConfig[key];
}

/** 遮挡模式的合法取值集合（含「继承全局」）。 */
function getDisplayModeDomain() {
  return ["inherit"].concat(SETTING_ENUMS.blockDisplayMode);
}

/**
 * 读取存储中的配置并归一化：补齐默认字段、clamp 数值、修复非法枚举、迁移旧字段。
 * @param {object|null|undefined} raw - GM_getValue("globalConfig", {}) 的结果。
 * @returns {object} 可直接使用的配置对象。
 */
function normalizeGlobalConfig(raw) {
  const config = { ...defaultGlobalPluginConfig, ...(raw || {}) };

  // 防止旧配置或手动修改写入超出允许范围的悬停延迟
  config.hoverRevealDelaySeconds = clampSetting(
    config.hoverRevealDelaySeconds,
    "hoverRevealDelaySeconds"
  );

  // 校验/修复自动连播处理方式，只允许 "skip" / "stop" / "off"
  if (!SETTING_ENUMS.flagSkipBlockedAutoplay.includes(config.flagSkipBlockedAutoplay)) {
    config.flagSkipBlockedAutoplay = defaultGlobalPluginConfig.flagSkipBlockedAutoplay;
  }

  // 校验/修复日志级别：只允许 "off" / "info" / "verbose"（取值表见 utils/logger.js）
  // 注意别用 LOG_LEVELS 在这里判断 —— logger.js 在 storage.js 之后求值，那时它还是 TDZ。
  if (!SETTING_ENUMS.logLevel.includes(config.logLevel)) {
    config.logLevel = defaultGlobalPluginConfig.logLevel;
  }

  // 校验/修复数值型配置：防止历史配置或手改写入过小/过大的值
  config.blockScanInterval = clampSetting(config.blockScanInterval, "blockScanInterval");
  config.processQueueInterval = clampSetting(
    config.processQueueInterval,
    "processQueueInterval"
  );
  config.verticalScaleThreshold = clampSetting(
    config.verticalScaleThreshold,
    "verticalScaleThreshold"
  );

  // 旧版 flagKirby(布尔) 迁移为 blockDisplayMode
  if (
    config.blockDisplayMode === undefined &&
    typeof config.flagKirby === "boolean"
  ) {
    config.blockDisplayMode = config.flagKirby ? "kirby" : "hide";
  }
  // 校验遮挡模式取值
  if (!SETTING_ENUMS.blockDisplayMode.includes(config.blockDisplayMode)) {
    config.blockDisplayMode = defaultGlobalPluginConfig.blockDisplayMode;
  }
  // 校验各屏蔽类型的独立显示方式（键来自 domain/block-types.js 的注册表）
  getPerTypeDisplayKeys().forEach((key) => {
    if (!getDisplayModeDomain().includes(config[key])) {
      config[key] = "inherit";
    }
  });

  return config;
}
