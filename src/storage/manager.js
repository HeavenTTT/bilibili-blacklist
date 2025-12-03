/**
 * Bilibili-BlackList - 存储管理模块
 * 管理黑名单数据和配置项的存储
 */

/**
 * 存储管理类
 */
export class StorageManager {
  constructor() {
    // 默认精确匹配黑名单（区分大小写）
    this.defaultExactBlacklist = [
      "绝区零",
      "崩坏星穹铁道",
      "崩坏3",
      "原神",
      "米哈游miHoYo",
    ];
    
    // 默认正则匹配黑名单（不区分大小写）
    this.defaultRegexBlacklist = [
      "王者荣耀",
      "和平精英",
      "PUBG",
      "绝地求生",
      "吃鸡",
    ];
    
    // 默认标签名黑名单
    this.defaultTagNameBlacklist = ["手机游戏"];
    
    // 默认全局配置
    this.defaultGlobalConfig = {
      flagInfo: true, // 启用/禁用按UP主名/标题屏蔽
      flagAD: true, // 启用/禁用屏蔽一般广告
      flagTName: true, // 启用/禁用按标签名屏蔽（需要API调用）
      flagCM: true, // 启用/禁用屏蔽cm.bilibili.com软广
      flagKirby: true, // 启用/禁用被屏蔽视频的卡比覆盖模式
      processQueueInterval: 200, // 处理队列中单个卡片的延迟时间（毫秒）
      blockScanInterval: 200, // BlockCard扫描新卡片的间隔时间（毫秒）
      flagHideOnLoad: true, // 启用/禁用页面加载时自动隐藏
      flagVertical: true, // 启用/禁用屏蔽竖屏视频
      verticalScaleThreshold: 0.7, // 竖屏视频的宽高比阈值（0-1）
    };
  }

  /**
   * 从存储中获取精确匹配黑名单
   * @returns {Array<string>} 精确匹配黑名单
   */
  getExactBlacklist() {
    return GM_getValue("exactBlacklist", this.defaultExactBlacklist);
  }

  /**
   * 从存储中获取正则匹配黑名单
   * @returns {Array<string>} 正则匹配黑名单
   */
  getRegexBlacklist() {
    return GM_getValue("regexBlacklist", this.defaultRegexBlacklist);
  }

  /**
   * 从存储中获取标签名黑名单
   * @returns {Array<string>} 标签名黑名单
   */
  getTagNameBlacklist() {
    return GM_getValue("tNameBlacklist", this.defaultTagNameBlacklist);
  }

  /**
   * 从存储中获取全局配置
   * @returns {Object} 全局配置对象
   */
  getGlobalConfig() {
    return GM_getValue("globalConfig", this.defaultGlobalConfig);
  }

  /**
   * 将黑名单保存到存储中
   * @param {Array<string>} exactBlacklist - 精确匹配黑名单
   * @param {Array<string>} regexBlacklist - 正则匹配黑名单
   * @param {Array<string>} tagNameBlacklist - 标签名黑名单
   */
  saveBlacklists(exactBlacklist, regexBlacklist, tagNameBlacklist) {
    GM_setValue("exactBlacklist", exactBlacklist);
    GM_setValue("regexBlacklist", regexBlacklist);
    GM_setValue("tNameBlacklist", tagNameBlacklist);
  }

  /**
   * 将全局配置保存到存储中
   * @param {Object} config - 全局配置对象
   */
  saveGlobalConfig(config) {
    GM_setValue("globalConfig", config);
  }

  /**
   * 重置所有存储数据到默认值
   */
  resetToDefaults() {
    this.saveBlacklists(
      this.defaultExactBlacklist,
      this.defaultRegexBlacklist,
      this.defaultTagNameBlacklist
    );
    this.saveGlobalConfig(this.defaultGlobalConfig);
  }
}