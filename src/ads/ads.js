function loadAdsModule() {
  /**
   * 屏蔽主页上的广告。
   */
  function blockMainPageAds() {
    if (!globalPluginConfig.flagAD) return; // 如果广告屏蔽未启用，则直接返回
    const adSelectors = [
      ".floor-single-card", // 分区推荐
      ".bili-live-card", // 直播推广
      ".btn-ad", // 广告按钮
    ];
    adSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }

  /**
   * 屏蔽视频播放页上的广告。
   */
  function blockVideoPageAds() {
    if (!globalPluginConfig.flagAD) return; // 如果广告屏蔽未启用，则直接返回
    const adSelectors = [
      ".video-card-ad-small", // 右上角推广
      ".slide-ad-exp", // 大推广
      ".video-page-game-card-small", // 游戏推广
      ".activity-m-v1", // 活动推广
      ".video-page-special-card-small", // 特殊卡片推广
      ".ad-floor-exp", // 广告地板
      ".btn-ad", // 广告按钮
      ".video-page-operator-card-small", // 运营推广
    ];

    adSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((adCard) => {
        hideVideoCard(adCard, "ad"); // 隐藏广告卡片
      });
    });
  }
}