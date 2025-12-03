/**
 * Bilibili-BlackList - 广告屏蔽模块
 * 处理广告识别和屏蔽功能
 */

/**
 * 广告屏蔽类
 */
export class AdBlocker {
  /**
   * 构造函数
   * @param {StorageManager} storageManager - 存储管理器实例
   * @param {CoreBlocker} blocker - 核心屏蔽器实例
   */
  constructor(storageManager, blocker) {
    this.storageManager = storageManager;
    this.blocker = blocker;
  }

  /**
   * 屏蔽主页上的广告
   */
  blockMainPageAds() {
    const config = this.storageManager.getGlobalConfig();
    if (!config.flagAD) return; // 如果广告屏蔽未启用，则直接返回
    
    const adSelectors = [
      ".floor-single-card", // 分区推荐
      ".bili-live-card", // 直播推广
      ".btn-ad", // 广告按钮
    ];
    adSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        this.blocker.hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }

  /**
   * 屏蔽视频播放页上的广告
   */
  blockVideoPageAds() {
    const config = this.storageManager.getGlobalConfig();
    if (!config.flagAD) return; // 如果广告屏蔽未启用，则直接返回
    
    const adSelectors = [
      ".video-card-ad-small", // 右上角推广
      ".slide-ad-exp", // 大推广
      ".video-page-game-card-small", // 游戏推广
      ".activity-m-v1", // 活动推广
      ".video-page-special-card-small", // 特殊卡片推广
      ".ad-floor-exp", // 广告地板
      ".btn-ad", // 广告按钮
    ];

    adSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        this.blocker.hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }

  /**
   * 检查链接是否为cm.bilibili.com广告链接
   * @param {string} link - 链接地址
   * @returns {boolean} 如果是广告链接则返回true
   */
  checkLinkCM(link) {
    const config = this.storageManager.getGlobalConfig();
    if (!link) return false;
    // 如果是cm.bilibili.com的链接，且启用了CM广告屏蔽，则隐藏卡片
    if (link.match(/cm.bilibili.com/) && config.flagCM) {
      return true;
    }
    return false;
  }
}