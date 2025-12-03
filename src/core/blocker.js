/**
 * Bilibili-BlackList - 核心屏蔽逻辑模块
 * 处理视频卡片的屏蔽逻辑
 */

import { sleep, getRealVideoCardElement, getCardHrefLink, getLinkBvId, checkLinkCM } from '../utils/helpers.js';

/**
 * 核心屏蔽器类
 */
export class CoreBlocker {
  /**
   * 构造函数
   * @param {StorageManager} storageManager - 存储管理器实例
   * @param {Object} config - 全局配置
   */
  constructor(storageManager, config) {
    this.storageManager = storageManager;
    this.config = config;
    
    // 内部状态变量
    this.isShowAllVideos = false; // 是否显示全部视频卡片
    this.isBlockingOperationInProgress = false; // 是否正在执行BlockCard扫描操作
    this.lastBlockScanExecutionTime = 0; // 上次执行BlockCard扫描的时间戳
    this.blockedVideoCards = new Set(); // 存储已屏蔽的视频卡片元素
    this.processedVideoCards = new WeakSet(); // 记录已处理过的卡片
    this.videoCardProcessQueue = new Set(); // 存储待处理的卡片
    this.isVideoCardQueueProcessing = false; // 是否正在处理队列
    this.isPageCurrentlyActive = true; // 页面是否可见
    this.countBlockInfo = 0; // 已屏蔽视频计数
    this.countBlockAD = 0; // 已屏蔽广告计数
    this.countBlockTName = 0; // 已屏蔽标签名计数
    this.countBlockCM = 0; // 已屏蔽cm.bilibili.com软广计数
    
    // UP主名称和视频标题选择器
    this.UP_NAME_SELECTORS = [
      ".bili-video-card__info--author", // 主页
      ".bili-video-card__author", // 分类页面 -> span title
      ".name", // 视频播放页
    ];

    this.VIDEO_TITLE_SELECTORS = [
      ".bili-video-card__info--tit", // 主页
      ".bili-video-card__title", // 分类页面 -> span title
      ".title", // 视频播放页
    ];
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新的配置对象
   */
  updateConfig(newConfig) {
    this.config = newConfig;
  }

  /**
   * 从视频卡片中检索UP主名称和视频标题
   * @param {HTMLElement} cardElement - 视频卡片元素
   * @returns {{upName: string, videoTitle: string}} 包含UP主名称和视频标题的对象
   */
  getVideoCardInfo(cardElement) {
    let upName = "";
    let videoTitle = "";

    const upNameElements = cardElement.querySelectorAll(
      this.UP_NAME_SELECTORS.join(", ")
    );
    if (upNameElements.length > 0) {
      upName = upNameElements[0].textContent.trim();
      if (this.isCurrentPageCategory()) {
        // 分类页面的UP主名称可能包含其他信息，需要进一步处理
        upName = upName.split(" · ")[0].trim();
      }
    }

    const titleElements = cardElement.querySelectorAll(
      this.VIDEO_TITLE_SELECTORS.join(", ")
    );
    if (titleElements.length > 0) {
      videoTitle = titleElements[0].textContent.trim();
    }
    return { upName, videoTitle };
  }

  /**
   * 检查UP主名称或标题是否在黑名单中
   * @param {string} upName - 要检查的UP主名称
   * @param {string} title - 要检查的视频标题
   * @returns {boolean} 如果在黑名单中则返回true，否则返回false
   */
  isBlacklisted(upName, title) {
    const lowerCaseUpName = upName.toLowerCase();
    const exactBlacklist = this.storageManager.getExactBlacklist();
    const regexBlacklist = this.storageManager.getRegexBlacklist();

    // 检查精确匹配黑名单
    if (
      exactBlacklist.some((item) => item.toLowerCase() === lowerCaseUpName)
    ) {
      return true;
    }

    // 检查正则匹配黑名单
    if (
      regexBlacklist.some((regex) => new RegExp(regex, "i").test(upName))
    ) {
      return true;
    }
    if (
      regexBlacklist.some((regex) => new RegExp(regex, "i").test(title))
    ) {
      return true;
    }
    return false;
  }

  /**
   * 检查卡片是否包含任何黑名单标签
   * @param {HTMLElement} cardElement - 视频卡片元素
   * @returns {boolean} 如果有任何标签被列入黑名单，则返回true，否则返回false
   */
  isCardBlacklistedByTagName(cardElement) {
    const tagNameBlacklist = this.storageManager.getTagNameBlacklist();
    const tnameGroup = cardElement.querySelector(
      ".bilibili-blacklist-tname-group"
    );
    if (tnameGroup) {
      const tnameElements = tnameGroup.querySelectorAll(
        ".bilibili-blacklist-tname"
      );
      for (const tnameElement of tnameElements) {
        const tname = tnameElement.textContent.trim();
        if (tagNameBlacklist.includes(tname)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 隐藏给定的视频卡片
   * @param {HTMLElement} cardElement - 要隐藏的视频卡片元素
   * @param {string} type - 隐藏类型，默认为"info"
   * @returns {void}
   */
  hideVideoCard(cardElement, type = "none") {
    const realCardToBlock = getRealVideoCardElement(cardElement);
    if (!this.blockedVideoCards.has(realCardToBlock)) {
      this.blockedVideoCards.add(realCardToBlock);
    } else {
      return;
    }
    if (!realCardToBlock) {
      console.warn(
        "[bililili-blacklist] hideVideoCard: realCardToBlock is null"
      );
      return;
    }
    if (type === "info") {
      this.countBlockInfo++;
    }
    if (type === "ad") {
      this.countBlockAD++;
    }
    if (type === "tname") {
      this.countBlockTName++;
    }
    if (type === "cm") {
      this.countBlockCM++;
    }
    if (type === "vertical") {
      this.countBlockTName++; // 注意：这里原始代码可能有误，应该是vertical
    }

    if (this.config.flagKirby) {
      this.addKirbyOverlayToCard(cardElement);
    } else {
      realCardToBlock.style.display = "none";
    }
  }

  /**
   * 切换所有被屏蔽视频卡片的显示
   * @param {Function} onToggle - 切换状态回调函数
   */
  toggleShowAllBlockedVideos(onToggle) {
    this.isShowAllVideos = !this.isShowAllVideos;
    this.blockedVideoCards.forEach((card) => {
      if (this.config.flagKirby) {
        const kirbyOverlay = card.querySelector("#bilibili-blacklist-kirby");
        if (kirbyOverlay) {
          kirbyOverlay.style.display = this.isShowAllVideos ? "none" : "block";
        }
        card.style.display = "block";
      } else {
        card.style.display = this.isShowAllVideos ? "block" : "none";
      }
    });
    
    if (onToggle) {
      onToggle(this.isShowAllVideos);
    }
  }

  /**
   * 扫描并处理视频卡片进行屏蔽
   */
  scanAndBlockVideoCards() {
    const now = Date.now();
    // 限制扫描频率，防止性能问题
    if (
      this.isBlockingOperationInProgress ||
      now - this.lastBlockScanExecutionTime < this.config.blockScanInterval
    ) {
      return;
    }

    this.isBlockingOperationInProgress = true;
    this.lastBlockScanExecutionTime = now;

    try {
      const videoCards = queryAllVideoCards();
      if (!videoCards) return;

      videoCards.forEach((card) => {
        // 如果卡片已经处理过，则跳过
        if (this.processedVideoCards.has(card)) {
          return;
        }
        const { upName, videoTitle } = this.getVideoCardInfo(card);
        // 如果获取到UP主名称和视频标题，则添加屏蔽按钮
        if (upName && videoTitle) {
          // --- 根据 flagHideOnLoad 开关决定是否立即隐藏卡片 ---
          const realCard = getRealVideoCardElement(card);
          if (this.config.flagHideOnLoad && !this.isShowAllVideos) {
            // 只有在"显示全部"模式关闭时才执行
            if (this.config.flagKirby) {
              this.addKirbyOverlayToCard(card); // 卡比模式下添加遮罩
              realCard.style.display = "block"; // 确保卡片本身是显示的
            } else {
              realCard.style.display = "none"; // 非卡比模式下直接隐藏
            }
          }
        }
        // --- 立即隐藏卡片的逻辑结束 ---

        // 将卡片添加到处理队列
        this.videoCardProcessQueue.add(card);
      });

      // 如果队列中有待处理的卡片且当前未在处理中，则开始处理队列
      if (this.videoCardProcessQueue.size > 0 && !this.isVideoCardQueueProcessing) {
        this.processVideoCardQueue();
      }
    } finally {
      this.isBlockingOperationInProgress = false;
    }
  }

  /**
   * 处理视频卡片队列进行屏蔽
   */
  async processVideoCardQueue() {
    if (this.isVideoCardQueueProcessing) return;
    this.isVideoCardQueueProcessing = true;

    while (this.videoCardProcessQueue.size > 0) {
      // 如果页面不可见，则暂停处理
      if (!this.isPageCurrentlyActive) {
        await sleep(1000);
        continue;
      }

      const iterator = this.videoCardProcessQueue.values();
      const card = iterator.next().value;
      this.videoCardProcessQueue.delete(card);

      if (!card || this.processedVideoCards.has(card)) {
        continue;
      }

      let shouldHide = false;
      let blockType = "none";
      
      // 检查CM链接
      const link = getCardHrefLink(card);
      if (checkLinkCM(link, this.config)) {
        shouldHide = true;
        blockType = "cm";
      }
      
      const { upName, videoTitle } = this.getVideoCardInfo(card);
      if (upName && videoTitle && !shouldHide) {
        // 如果UP主名称或标题在黑名单中，且启用了信息屏蔽
        if (this.isBlacklisted(upName, videoTitle) && this.config.flagInfo) {
          shouldHide = true;
          blockType = "info";
        }
      } else {
        // 如果无法获取UP主名称和标题，但卡片已被隐藏或有Kirby覆盖，则也认为应该隐藏
        if (
          getRealVideoCardElement(card).style.display === "none" &&
          !this.config.flagKirby
        ) {
          shouldHide = true;
        } else if (
          getRealVideoCardElement(card).querySelector(
            "#bilibili-blacklist-kirby"
          )
        ) {
          shouldHide = true;
        }
      }

      if (
        (this.config.flagTName || this.config.flagVertical) && 
        !shouldHide
      ) {
        const bvId = getLinkBvId(link);
        // 如果存在BV ID且卡片尚未添加标签组
        if (bvId && !card.querySelector(".bilibili-blacklist-tname-group")) {
          const data = await this.getBilibiliVideoApiData(bvId);
          if (data) {
            const container = card.querySelector(
              ".bilibili-blacklist-block-container"
            );
            if (container) {
              const tnameGroup = document.createElement("div");
              tnameGroup.className = "bilibili-blacklist-tname-group";
              let hasTname = false;

              if (data.tname) {
                const btn = this.createTNameBlockButton(data.tname, card);
                tnameGroup.appendChild(btn);
                hasTname = true;
              }
              if (data.tname_v2) {
                const tnameElement = this.createTNameBlockButton(
                  data.tname_v2,
                  card
                );
                tnameGroup.appendChild(tnameElement);
                hasTname = true;
              }
              if (hasTname) {
                container.appendChild(tnameGroup);
              }
            }

            if (this.isCardBlacklistedByTagName(card)) {
              shouldHide = true;
              blockType = "tname";
            }
            // 如果启用了垂直视频屏蔽
            if (
              data.dimension.width &&
              data.dimension.height &&
              !shouldHide &&
              this.config.flagVertical
            ) {
              const dimension = data.dimension.width / data.dimension.height;
              if (dimension < this.config.verticalScaleThreshold) {
                shouldHide = true;
                blockType = "vertical";
              }
            }
          }
        }
      }

      if (shouldHide) {
        this.hideVideoCard(card, blockType);
      } else {
        const realCardToDisplay = getRealVideoCardElement(card);
        if (this.blockedVideoCards.has(realCardToDisplay)) {
          this.blockedVideoCards.delete(realCardToDisplay);
        }
        if (this.config.flagKirby) {
          this.removeKirbyOverlay(card);
        }
        realCardToDisplay.style.display = "block";
      }

      this.processedVideoCards.add(card); // 标记卡片已处理

      await sleep(this.config.processQueueInterval || 100);
    }
    this.isVideoCardQueueProcessing = false;
  }

  /**
   * 使用BV ID从Bilibili API获取视频信息
   * @param {string} bvid - 视频的BV ID
   * @returns {Promise<object|null>} 解析为视频数据或null的Promise
   */
  async getBilibiliVideoApiData(bvid) {
    if (!bvid || bvid.length >= 24) {
      return null;
    }
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.code === 0) {
        return json.data;
      } else {
        return null;
      }
    } catch (error) {
      console.error("[bilibili-blacklist] API 请求失败:", error);
    }
  }

  /**
   * 为标签名创建屏蔽按钮，显示在视频卡片上
   * @param {string} tagName - 标签名
   * @param {HTMLElement} cardElement - 视频卡片元素
   * @returns {HTMLSpanElement} 创建的按钮元素
   */
  createTNameBlockButton(tagName, cardElement) {
    const button = document.createElement("span");
    button.className = "bilibili-blacklist-tname";
    button.innerHTML = `${tagName}`;
    button.title = `屏蔽: ${tagName}`;

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      this.addToTagNameBlacklist(tagName, cardElement);
    });

    return button;
  }

  /**
   * 将标签名添加到黑名单并刷新
   * @param {string} tagName - 要添加的标签名
   * @param {HTMLElement} [cardElement=null] - 添加后要隐藏的视频卡片元素
   */
  addToTagNameBlacklist(tagName, cardElement = null) {
    try {
      if (!tagName) {
        return;
      }
      const tagNameBlacklist = this.storageManager.getTagNameBlacklist();
      if (!tagNameBlacklist.includes(tagName)) {
        tagNameBlacklist.push(tagName);
        this.storageManager.saveBlacklists(
          this.storageManager.getExactBlacklist(),
          this.storageManager.getRegexBlacklist(),
          tagNameBlacklist
        );
        if (cardElement) {
          this.hideVideoCard(cardElement);
        }
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 添加标签黑名单出错:", e);
    }
  }

  /**
   * 从黑名单中移除标签名
   * @param {string} tagName - 要移除的标签名
   */
  removeFromTagNameBlacklist(tagName) {
    try {
      const tagNameBlacklist = this.storageManager.getTagNameBlacklist();
      if (tagNameBlacklist.includes(tagName)) {
        const index = tagNameBlacklist.indexOf(tagName);
        tagNameBlacklist.splice(index, 1);
        this.storageManager.saveBlacklists(
          this.storageManager.getExactBlacklist(),
          this.storageManager.getRegexBlacklist(),
          tagNameBlacklist
        );
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 移除标签黑名单出错:", e);
    }
  }

  /**
   * 为视频卡片添加卡比主题的覆盖层
   * @param {HTMLElement} cardElement - 视频卡片元素
   */
  addKirbyOverlayToCard(cardElement) {
    const kirbyWrapper = document.createElement("div");
    // 如果已经有Kirby覆盖层，则不重复添加
    if (cardElement.querySelector("#bilibili-blacklist-kirby") != null) return;
    kirbyWrapper.innerHTML = this.getKirbySVG();
    kirbyWrapper.id = "bilibili-blacklist-kirby";

    const justifyContent = this.isCurrentPageVideo() ? "flex-start" : "center";
    const alignItems = this.isCurrentPageVideo() ? "flex-start" : "center";
    Object.assign(kirbyWrapper.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      display: "flex",
      justifyContent: `${justifyContent}`,
      alignItems: `${alignItems}`,
      zIndex: "10",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      backdropFilter: "blur(5px)",
      WebkitBackdropFilter: "blur(5px)", // 兼容性
      borderRadius: "inherit",
      border: "1px solid rgba(255, 255, 255, 0.5)",
    });

    const svg = kirbyWrapper.querySelector("svg");
    if (svg) {
      const cardRect = cardElement.getBoundingClientRect();
      const size = Math.min(cardRect.width, cardRect.height) * 1.0;
      svg.setAttribute("width", `${size}px`);
      svg.setAttribute("height", `${size}px`);
      svg.setAttribute("bottom", `${cardRect.height - size}px`);
      svg.style.opacity = "0.15";
      svg.style.filter = "none";
      if (this.isCurrentPageVideo()) {
        svg.style.marginTop = "-10px"; // 视频播放页的微调
      } else {
        svg.style.marginTop = "-40px"; // 其他页面的微调
      }
    }

    // 确保卡片有position属性以便子元素绝对定位
    const cardStyle = getComputedStyle(cardElement);
    if (cardStyle.position === "static" || !cardStyle.position) {
      cardElement.style.position = "relative";
    }

    cardElement.appendChild(kirbyWrapper);
  }

  /**
   * 从视频卡片中移除卡比覆盖层
   * @param {HTMLElement} cardElement - 视频卡片元素
   */
  removeKirbyOverlay(cardElement) {
    const kirbyWrapper = cardElement.querySelector("#bilibili-blacklist-kirby");
    if (kirbyWrapper) {
      kirbyWrapper.remove();
    }
  }

  /**
   * 返回卡比图标的SVG代码
   * @returns {string} SVG字符串
   */
  getKirbySVG() {
    return `
        <svg width="35" height="35" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"  >
            <ellipse cx="70" cy="160" rx="30" ry="15" fill="#cc3333" />
            <ellipse cx="130" cy="160" rx="30" ry="15" fill="#cc3333" />
            <ellipse cx="50" cy="120" rx="20" ry="20" fill="#ffb6c1" />
            <ellipse cx="150" cy="120" rx="20" ry="20" fill="#ffb6c1" />
            <circle cx="100" cy="110" r="60" fill="#ffb6c1" />
            <ellipse cx="80" cy="90" rx="10" ry="22" fill="blue" />
            <ellipse cx="80" cy="88" rx="10" ry="15" fill="black" />
            <ellipse cx="80" cy="82" rx="8" ry="12" fill="#ffffff" />
            <ellipse cx="80" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
            <ellipse cx="120" cy="90" rx="10" ry="22" fill="blue" />
            <ellipse cx="120" cy="88" rx="10" ry="15" fill="black" />
            <ellipse cx="120" cy="82" rx="8" ry="12" fill="#ffffff" />
            <ellipse cx="120" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
            <ellipse cx="60" cy="110" rx="8" ry="5" fill="#ff4466" />
            <ellipse cx="140" cy="110" rx="8" ry="5" fill="#ff4466" />
            <path d="M 90 118 Q 100 125, 110 118" stroke="black" strokeWidth="3" fill="transparent" />
        </svg>
    `;
  }

  // 以下方法用于兼容性，从utils模块导入
  isCurrentPageMain() {
    return location.pathname === "/";
  }

  isCurrentPageVideo() {
    return location.pathname.startsWith("/video/");
  }

  isCurrentPageCategory() {
    return location.pathname.startsWith("/c/");
  }

  isCurrentPageSearch() {
    return location.hostname === "search.bilibili.com";
  }
}