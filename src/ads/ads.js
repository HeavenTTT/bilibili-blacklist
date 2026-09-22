/*
 * 广告屏蔽模块
 * -----------------------------------------------------------
 * 主页与播放页的广告 / 推广 / 软广屏蔽。
 *
 * 播放页采用与视频卡片一致的三段式节奏（P0 覆盖 → P1 等初始化 → P2 判定）：
 *   P0 预覆盖：脚本求值瞬间给 <html> 加 AD_PENDING_CLASS，由纯 CSS 规则把广告位罩住。
 *              不插入任何 DOM、不改结构，因此不会与 B 站 header 的 Vue 渲染竞争；
 *              且“等待期内才被插入的广告位”一出现就命中规则，天然被罩住（这是 CSS
 *              方案相对逐元素 JS 遮盖的关键优势）。
 *   P1 等初始化：不单独等待，完全复用卡片那一套（pages.js 里 5s + .right-entry 就绪）。
 *   P2 判定提交：resolveVideoPageAds() 按 flagAD + displayModeAD/blockDisplayMode 决定
 *              遮蔽形态（hide / blur / kirby），全部判定完成后才解除 pending class，
 *              同帧提交，未命中的不会闪现、命中的也不会先亮一下再被遮。
 *
 * 切视频（页面内 SPA 跳转）：
 *   - BV 变化时 onVideoSwitchedAds() 立刻重新加上 pending class，新广告一插入即被罩住；
 *   - observer 观察到新卡片或新广告元素（双触发）时调度一次 resolveVideoPageAds()；
 *   - 已判定过的广告带 AD_DONE_ATTR，被 CSS 的 :not([...]) 排除，不会被二次覆盖糊住遮罩。
 */

// ===== 选择器（单一真源：CSS 预覆盖 / observer 增量识别 / 判定遍历 三处共用）=====

/** 主页与搜索页广告选择器。 */
const MAIN_AD_SELECTORS = [
  ".floor-single-card", // 分区推荐
  ".bili-live-card", // 直播推广
  ".btn-ad", // 广告按钮
];
const MAIN_AD_SELECTOR_TEXT = MAIN_AD_SELECTORS.join(", ");

/** 视频播放页广告选择器。 */
const VIDEO_AD_SELECTORS = [
  ".video-card-ad-small", // 右上角推广
  ".slide-ad-exp", // 大推广
  ".video-page-game-card-small", // 游戏推广
  ".activity-m-v1", // 活动推广
  ".video-page-special-card-small", // 特殊卡片推广
  ".ad-floor-exp", // 广告地板
  ".btn-ad", // 广告按钮
  ".video-page-operator-card-small", // 运营推广
  ".ad-report", // 广告
  ".slide_ad", // 广告
];
const VIDEO_AD_SELECTOR_TEXT = VIDEO_AD_SELECTORS.join(", ");

// 已判定标记：用 DOM 属性而不是 WeakSet，既能被 CSS 的 :not() 选择器直接排除，
// 也便于需要时整体清除。
const AD_DONE_ATTR = "data-bl-ad-done";
// 预覆盖 class，加在 <html> 上，一次性罩住/解除所有广告位。
const AD_PENDING_CLASS = "bilibili-blacklist-ad-pending";
// 切视频后预覆盖的最长保留时间：新页面可能根本没有广告位插入，
// 需要兜底解除，避免 class 长期挂着。
const VIDEO_AD_PENDING_MAX_MS = 1500;

let videoAdProcessScheduled = false; // 播放页广告处理的合并调度标志
let mainAdProcessScheduled = false; // 主页/搜索页广告处理的合并调度标志
let videoAdPendingReleaseTimer = null; // 切视频后预覆盖的兜底解除定时器

// ===== P0：预覆盖样式（求值期立即注入并生效）=====
// filter 参数取自 core.js 的 PENDING_FILTER_STYLE，与卡片的“未处理”遮盖完全一致。
GM_addStyle(`
  ${VIDEO_AD_SELECTORS.map(
    (selector) => `html.${AD_PENDING_CLASS} ${selector}:not([${AD_DONE_ATTR}])`
  ).join(",\n  ")} {
    filter: ${PENDING_FILTER_STYLE} !important;
    pointer-events: none !important;
  }
`);

/**
 * 为播放页广告元素创建屏蔽信息容器（独立于视频卡片的实现）。
 *
 * 与卡片用的 getBlockContainerHost() 的区别：
 *   - 不去找 .card-box / .bili-video-card 之类的卡片专用结构（广告位没有）；
 *   - 只在广告元素自身 position 为 static 时才补 relative，并打上 data-bl-ad-pos 标记，
 *     便于排查“是脚本改了定位”还是 B 站自身样式；已有定位上下文的广告位一律不动，
 *     避免破坏其浮动/绝对定位布局；
 *   - 仍然复用 bilibili-blacklist-block-container-host 这个 class，
 *     这样 ui.js 里“悬停显示容器”的既有 CSS 规则继续生效，屏蔽原因标签正常展示。
 * @param {HTMLElement} adElement - 广告元素。
 * @returns {HTMLElement|null} 容器元素。
 */
function ensureAdBlockContainer(adElement) {
  if (!adElement || adElement.nodeType !== 1) return null;
  const existing = adElement.querySelector(
    ".bilibili-blacklist-block-container"
  );
  if (existing) return existing;

  const hostStyle = getComputedStyle(adElement);
  if (hostStyle.position === "static" || !hostStyle.position) {
    adElement.style.position = "relative";
    adElement.setAttribute("data-bl-ad-pos", "1");
  }
  adElement.classList.add("bilibili-blacklist-block-container-host");

  const container = document.createElement("div");
  container.classList.add("bilibili-blacklist-block-container");
  adElement.appendChild(container);
  return container;
}

/**
 * 给播放页广告位加上“未判定”预覆盖（加 class，由 CSS 统一罩住）。
 * 条件与卡片的 processCard 一致：开启广告屏蔽 + 开启加载时立即隐藏 + 未处于“取消屏蔽”状态。
 */
function markVideoPageAdsPending() {
  if (!isCurrentPageVideo()) return;
  if (!globalPluginConfig.flagAD) return;
  if (!globalPluginConfig.flagHideOnLoad) return;
  if (isShowAllVideos) return;
  document.documentElement.classList.add(AD_PENDING_CLASS);
}

/**
 * 解除播放页广告位的预覆盖。
 */
function clearVideoPageAdsPending() {
  if (videoAdPendingReleaseTimer) {
    clearTimeout(videoAdPendingReleaseTimer);
    videoAdPendingReleaseTimer = null;
  }
  document.documentElement.classList.remove(AD_PENDING_CLASS);
}

/**
 * 对单个播放页广告元素做判定与屏蔽。
 * @param {HTMLElement} adElement - 广告元素。
 * @returns {boolean} 本次是否新屏蔽了该元素。
 */
function resolveAdElement(adElement) {
  if (!adElement || adElement.nodeType !== 1) return false;
  // 广告屏蔽关闭时不打标记：用户在面板里打开后，下一次触发即可对存量广告生效。
  if (!globalPluginConfig.flagAD) return false;
  if (adElement.hasAttribute(AD_DONE_ATTR)) return false;
  adElement.setAttribute(AD_DONE_ATTR, "1");
  // 遮蔽形态由 getEffectiveDisplayMode("ad") 决定（displayModeAD → 继承 blockDisplayMode）
  hideVideoCard(adElement, "ad");
  return true;
}

/**
 * 播放页广告的“判定提交”：遍历全部广告位判定屏蔽，完成后解除预覆盖。
 * 由 AD_DONE_ATTR 去重，重复调用只是一次 querySelectorAll 的开销，可安全用作兜底。
 * @returns {number} 本次新屏蔽的广告数量。
 */
function resolveVideoPageAds() {
  if (!isCurrentPageVideo()) return 0;
  let blockedCount = 0;
  document.querySelectorAll(VIDEO_AD_SELECTOR_TEXT).forEach((adElement) => {
    if (resolveAdElement(adElement)) blockedCount++;
  });
  // 先判定后解除：同帧提交，避免“先露出再遮住”的闪烁
  clearVideoPageAdsPending();
  if (blockedCount > 0) {
    refreshBlockCountDisplay();
  }
  return blockedCount;
}

/**
 * 合并调度一次播放页广告处理（observer 双触发使用）。
 * 同一个 blockScanInterval 窗口内的多次触发只产生一个定时器，
 * 避免切视频时的 mutation 风暴排出大量重复 timer。
 */
function scheduleVideoAdProcessing() {
  if (!isCurrentPageVideo()) return;
  if (videoAdProcessScheduled) return;
  videoAdProcessScheduled = true;
  setTimeout(() => {
    videoAdProcessScheduled = false;
    // header 未就绪：预覆盖正生效，等 startVideoPageProcessing() 统一判定，
    // 保证广告与卡片“等待同样的初始化”。
    if (!videoHeaderReady) return;
    resolveVideoPageAds();
  }, globalPluginConfig.blockScanInterval);
}

/**
 * 合并调度一次主页/搜索页广告处理。
 */
function scheduleMainPageAdProcessing() {
  if (mainAdProcessScheduled) return;
  mainAdProcessScheduled = true;
  setTimeout(() => {
    mainAdProcessScheduled = false;
    blockMainPageAds();
  }, globalPluginConfig.blockScanInterval);
}

/**
 * 页面内切换视频时的广告处理：重新进入“覆盖 → 判定”小周期。
 *
 * 此时 header 早已正常，不存在渲染竞争，因此不需要再等 5 秒：
 * 立即重新覆盖，等 observer 报告到新元素后由 scheduleVideoAdProcessing() 判定并解除；
 * 若新页面没有任何新广告插入，则由 VIDEO_AD_PENDING_MAX_MS 兜底解除。
 *
 * 注意：这里刻意不清除已判定广告的 AD_DONE_ATTR。B 站切视频时广告位要么整个节点被重建
 * （新节点没有标记，会被正常处理），要么同一节点只换内部内容（它本来就已经是被屏蔽状态，
 * 仍然是广告位，保持屏蔽即正确）。清标记只会让已挂遮罩的广告被重新糊一层。
 */
function onVideoSwitchedAds() {
  if (!isCurrentPageVideo()) return;
  if (!globalPluginConfig.flagAD || isShowAllVideos) return;
  document.documentElement.classList.add(AD_PENDING_CLASS);
  if (videoAdPendingReleaseTimer) clearTimeout(videoAdPendingReleaseTimer);
  videoAdPendingReleaseTimer = setTimeout(() => {
    videoAdPendingReleaseTimer = null;
    resolveVideoPageAds();
  }, VIDEO_AD_PENDING_MAX_MS);
}

/**
 * 屏蔽主页上的广告。
 */
function blockMainPageAds() {
  if (!globalPluginConfig.flagAD) return; // 如果广告屏蔽未启用，则直接返回
  document.querySelectorAll(MAIN_AD_SELECTOR_TEXT).forEach((adCard) => {
    hideVideoCard(adCard, "ad"); // 隐藏广告卡片
  });
}

// 求值期立即预覆盖：比放进 initializeScript() 更早，少一段广告裸露窗口。
// 此时 storage.js / core.js / pages.js 均已求值，函数声明也已提升，调用安全。
markVideoPageAdsPending();
