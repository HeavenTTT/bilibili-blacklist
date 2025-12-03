// 广告屏蔽模块
// 主页广告选择器
const MAIN_PAGE_AD_SELECTORS = [
  ".floor-single-card", // 分区推荐
  ".bili-live-card", // 直播推广
  ".btn-ad", // 广告按钮
];

// 视频播放页广告选择器
const VIDEO_PAGE_AD_SELECTORS = [
  ".video-card-ad-small", // 右上角推广
  ".slide-ad-exp", // 大推广
  ".video-page-game-card-small", // 游戏推广
  ".activity-m-v1", // 活动推广
  ".video-page-special-card-small", // 特殊卡片推广
  ".ad-floor-exp", // 广告地板
  ".btn-ad", // 广告按钮
  ".video-page-operator-card-small", // 运营推广
];

window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.AdBlocker = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;

  // 屏蔽主页上的广告
  function blockMainPageAds() {
    if (!StorageManager.globalPluginConfig.flagAD) return; // 如果广告屏蔽未启用，则直接返回
    MAIN_PAGE_AD_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        CoreFeatures.hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }

  // 屏蔽视频播放页上的广告
  function blockVideoPageAds() {
    if (!StorageManager.globalPluginConfig.flagAD) return; // 如果广告屏蔽未启用，则直接返回

    VIDEO_PAGE_AD_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        CoreFeatures.hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }

  return {
    blockMainPageAds,
    blockVideoPageAds
  };
})();