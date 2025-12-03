/**
 * Bilibili-BlackList - 页面观察器模块
 * 处理不同页面的初始化和变动观察
 */

import { isCurrentPageMain, isCurrentPageSearch, isCurrentPageVideo, isCurrentPageCategory, isCurrentUserSpace } from '../utils/helpers.js';

/**
 * 页面观察器类
 */
export class PageObserver {
  /**
   * 构造函数
   * @param {CoreBlocker} blocker - 核心屏蔽器实例
   * @param {UIManager} uiManager - UI管理器实例
   * @param {StorageManager} storageManager - 存储管理器实例
   */
  constructor(blocker, uiManager, storageManager) {
    this.blocker = blocker;
    this.uiManager = uiManager;
    this.storageManager = storageManager;
    
    this.observerRetryCount = 0;
    this.contentObserver = null;
  }

  /**
   * 初始化页面观察器
   */
  initializeObserver() {
    // 根据当前页面URL判断并初始化
    if (isCurrentPageMain()) {
      this.initializeMainPage();
      this.blockMainPageAds();
    } else if (isCurrentPageSearch()) {
      this.initializeSearchPage();
      this.blockMainPageAds(); // 搜索页也进行主页广告屏蔽
    } else if (isCurrentPageVideo()) {
      this.initializeVideoPage();
    } else if (isCurrentPageCategory()) {
      this.initializeCategoryPage();
    } else if (isCurrentUserSpace()) {
      this.initializeUserSpace();
    } else {
      return; // 不支持的页面不进行初始化
    }
    
    this.uiManager.createBlacklistPanel(); // 创建管理面板
    console.log("[bilibili-blacklist] 脚本已加载🥔");
  }

  /**
   * 初始化主页特有的功能
   */
  initializeMainPage() {
    this._setupContentObserver("feedchannel-main"); // 观察主页内容区域
    console.log("[bilibili-blacklist] 主页已加载🍓");
  }

  /**
   * 初始化搜索页特有的功能
   */
  initializeSearchPage() {
    this._setupContentObserver("i_cecream"); // 观察搜索结果内容区域
    console.log("[bilibili-blacklist] 搜索页已加载🍉");
  }

  /**
   * 初始化视频播放页特有的功能
   */
  initializeVideoPage() {
    // 延迟 5 秒启动屏蔽功能
    console.log("[bilibili-blacklist] 播放页已加载，将延迟 5 秒启动功能。🍇");

    // 延迟 5 秒执行核心功能
    setTimeout(() => {
      this._setupContentObserver("right-container"); // 观察视频播放页右侧推荐区域

      // 首次手动扫描和广告屏蔽
      this.blocker.scanAndBlockVideoCards();
      this.blockVideoPageAds();

      console.log("[bilibili-blacklist] 视频播放页屏蔽功能已启动。");
    }, 5000); // 5000 毫秒 = 5 秒
  }

  /**
   * 初始化分类页特有的功能
   */
  initializeCategoryPage() {
    this._setupContentObserver("app"); // 观察整个app容器
    console.log("[bilibili-blacklist] 分类页已加载🍊");
  }

  /**
   * 初始化用户空间页特有的功能
   */
  initializeUserSpace() {
    console.log("[bilibili-blacklist] 用户空间已加载🍎");
    const upNameSelector = "#h-name, .nickname"; // UP主名称的选择器
    // 创建一个MutationObserver来等待UP主名称元素加载
    const observerForUpName = new MutationObserver((mutations, observer) => {
      const upNameElement = document.querySelector(upNameSelector);
      if (upNameElement) {
        observer.disconnect(); // 找到元素后停止观察
        this.addBlockButtonToUserSpace(upNameElement);
      }
    });

    observerForUpName.observe(document.body, {
      childList: true,
      subtree: true,
    });
    // 立即检查一次，如果元素已经存在则直接处理
    const initialUpNameElement = document.querySelector(upNameSelector);
    if (initialUpNameElement) {
      observerForUpName.disconnect();
      this.addBlockButtonToUserSpace(initialUpNameElement);
    }
  }

  /**
   * 在指定容器上初始化MutationObserver
   * @param {string} containerIdOrSelector - 要观察的容器的ID或CSS选择器
   * @returns {boolean} 如果观察器成功初始化则返回true，否则返回false
   */
  _setupContentObserver(containerIdOrSelector) {
    const rootNode =
      document.getElementById(containerIdOrSelector) ||
      document.querySelector(containerIdOrSelector) ||
      document.documentElement; // 默认观察整个文档

    if (rootNode) {
      // 创建或重新配置内容观察器
      if (this.contentObserver) {
        this.contentObserver.disconnect();
      }
      
      this.contentObserver = new MutationObserver((mutations) => {
        let shouldCheck = false;
        // 对视频播放页进行优化，只在实际添加了可见元素时触发扫描
        if (isCurrentPageVideo()) {
          mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
              shouldCheck = Array.from(mutation.addedNodes).some((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return false;
                // 检查节点是否有实际的尺寸，避免不必要的扫描
                const hasVisibleContent =
                  node.offsetWidth > 0 ||
                  node.offsetHeight > 0 ||
                  node.querySelector("[offsetWidth], [offsetHeight]");
                return hasVisibleContent;
              });
            }
          });
        } else {
          // 其他页面只要有节点添加就触发
          mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
              shouldCheck = true;
            }
          });
        }

        if (shouldCheck) {
          // 使用setTimeout延迟扫描，避免短时间内多次触发
          setTimeout(() => {
            this.blocker.scanAndBlockVideoCards();
            if (isCurrentPageMain()) {
              this.blockMainPageAds(); // 主页广告屏蔽
            }
            if (isCurrentPageVideo()) {
              this.blockVideoPageAds(); // 视频页广告屏蔽
            }
            if (!document.getElementById("bilibili-blacklist-manager-button")) {
              this.uiManager.addBlacklistManagerButton(); // 确保管理按钮存在
            }
          }, this.blocker.config.blockScanInterval);
        }
      });

      this.contentObserver.observe(rootNode, {
        childList: true,
        subtree: true,
      });
      return true;
    } else {
      // 如果未找到根节点，则进行重试
      setTimeout(() => this._setupContentObserver(containerIdOrSelector), 500);
      console.warn("[bilibili-blacklist] 未找到根节点，正在重试...");
      this.observerRetryCount++;

      if (this.observerRetryCount > 10) {
        console.error("[bilibili-blacklist] 重试次数过多，停止重试。");
        return false;
      }
    }
  }

  /**
   * 在用户空间页面上的UP主名称元素添加屏蔽/取消屏蔽按钮
   * @param {HTMLElement} upNameElement - 包含UP主名称的元素
   */
  addBlockButtonToUserSpace(upNameElement) {
    const upName = upNameElement.textContent.trim();
    // 避免重复添加按钮
    if (upNameElement.querySelector(".bilibili-blacklist-up-block-btn")) {
      return;
    }

    // 调整UP主名称元素的样式，以便容纳按钮
    upNameElement.style.display = "inline-flex";
    upNameElement.style.alignItems = "center";

    const button = document.createElement("button");
    button.className = "bilibili-blacklist-up-block-btn";
    button.textContent = "屏蔽";
    button.style.color = "#fff";
    button.style.width = "100px";
    button.style.height = "30px";
    button.style.marginLeft = "10px";
    button.style.borderRadius = "5px";
    button.style.border = "1px solid #fb7299";

    // 刷新按钮状态和页面灰度效果
    const refreshButtonStatus = () => {
      const exactBlacklist = this.storageManager.getExactBlacklist();
      const blocked = exactBlacklist.some(item => item.toLowerCase() === upName.toLowerCase());
      if (blocked) {
        button.textContent = "已屏蔽";
        button.style.backgroundColor = "#dddddd";
        button.style.border = "1px solid #ccc";
        upNameElement.style.textDecoration = "line-through"; // 添加删除线
        document.body.classList.add("bilibili-blacklist-grayscale"); // 添加灰度滤镜
      } else {
        button.textContent = "屏蔽";
        button.style.backgroundColor = "#fb7299";
        button.style.border = "1px solid #fb7299";
        upNameElement.style.textDecoration = "none"; // 移除删除线
        document.body.classList.remove("bilibili-blacklist-grayscale"); // 移除灰度滤镜
      }
    };

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const exactBlacklist = this.storageManager.getExactBlacklist();
      const blocked = exactBlacklist.some(item => item.toLowerCase() === upName.toLowerCase());
      if (blocked) {
        this.uiManager.removeFromExactBlacklist(upName);
      } else {
        this.uiManager.addToExactBlacklist(upName);
      }
      refreshButtonStatus(); // 更新按钮状态
    });

    refreshButtonStatus(); // 设置按钮初始状态

    upNameElement.appendChild(button);
  }

  /**
   * 监听页面可见性变化
   */
  setupPageVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      this.blocker.isPageCurrentlyActive = !document.hidden;
    });
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
}