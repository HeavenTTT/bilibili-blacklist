/**
 * Bilibili-BlackList - 工具函数模块
 * 提供通用的辅助函数
 */

/**
 * 异步等待函数
 * @param {number} ms - 等待的毫秒数
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 检查页面可见性
 * @returns {boolean} 页面是否可见
 */
export function isPageVisible() {
  return !document.hidden;
}

/**
 * 获取视频卡片的真实父元素（用于不同页面的兼容）
 * @param {HTMLElement} cardElement - 视频卡片元素
 * @returns {HTMLElement} 应用显示更改的实际元素
 */
export function getRealVideoCardElement(cardElement) {
  // 搜索页面的视频卡片父元素是上一级
  if (isCurrentPageSearch()) {
    return cardElement.parentElement;
  }
  // 主页视频卡片可能有多层父元素
  if (isCurrentPageMain()) {
    if (cardElement.parentElement?.classList.contains("bili-feed-card")) {
      cardElement = cardElement.parentElement;
      if (cardElement.parentElement?.classList.contains("feed-card")) {
        cardElement = cardElement.parentElement;
      }
    }
  }
  return cardElement;
}

/**
 * 检查当前页面是否为Bilibili主页
 * @returns {boolean} 如果是主页则返回true，否则返回false
 */
export function isCurrentPageMain() {
  return location.pathname === "/";
}

/**
 * 检查当前页面是否为Bilibili搜索结果页
 * @returns {boolean} 如果是搜索页则返回true，否则返回false
 */
export function isCurrentPageSearch() {
  return location.hostname === "search.bilibili.com";
}

/**
 * 检查当前页面是否为Bilibili视频播放页
 * @returns {boolean} 如果是视频播放页则返回true，否则返回false
 */
export function isCurrentPageVideo() {
  return location.pathname.startsWith("/video/");
}

/**
 * 检查当前页面是否为Bilibili分类页
 * @returns {boolean} 如果是分类页则返回true，否则返回false
 */
export function isCurrentPageCategory() {
  return location.pathname.startsWith("/c/");
}

/**
 * 检查当前页面是否为Bilibili用户空间页
 * @returns {boolean} 如果是用户空间页则返回true，否则返回false
 */
export function isCurrentUserSpace() {
  return location.hostname === "space.bilibili.com";
}

/**
 * 根据当前页面选择所有视频卡片
 * @returns {NodeListOf<HTMLElement> | null} 视频卡片元素的NodeList，如果不是识别的页面则返回null
 */
export function queryAllVideoCards() {
  if (isCurrentPageMain()) {
    return document.querySelectorAll(".bili-video-card");
  } else if (isCurrentPageVideo()) {
    return document.querySelectorAll(".video-page-card-small");
  } else if (isCurrentPageCategory()) {
    return document.querySelectorAll(".feed-card");
  } else if (isCurrentPageSearch()) {
    return document.querySelectorAll(".bili-video-card");
  }
  return null;
}

/**
 * 获取视频卡片的链接
 * @param {HTMLElement} cardElement - 视频卡片元素
 * @returns {string|null} 视频链接，如果未找到则返回null
 */
export function getCardHrefLink(cardElement) {
  const hrefLink = cardElement.querySelector("a");
  if (hrefLink) {
    return hrefLink.getAttribute("href");
  }
  return null;
}

/**
 * 从视频卡片的链接中提取BV ID
 * @param {string} link - 视频链接
 * @returns {string|null} BV ID，如果未找到则返回null
 */
export function getLinkBvId(link) {
  try {
    if (!link) {
      return null;
    } else {
      const bv = link.match(/BV\w+/);
      return bv ? bv[0] : null;
    }
  } catch (e) {
    return null;
  }
}

/**
 * 检查链接是否为cm.bilibili.com广告链接
 * @param {string} link - 链接地址
 * @param {Object} config - 全局配置
 * @returns {boolean} 如果是广告链接则返回true
 */
export function checkLinkCM(link, config) {
  if (!link) return false;
  // 如果是cm.bilibili.com的链接，且启用了CM广告屏蔽，则隐藏卡片
  if (link.match(/cm.bilibili.com/) && config.flagCM) {
    return true;
  }
  return false;
}