function loadCoreModule() {
  // UI元素（稍后初始化）
  let tempUnblockButton;
  let managerPanel;
  let exactMatchListElement;
  let regexMatchListElement;
  let tagNameListElement;
  let configListElement;
  let blockCountTitleElement;
  let blockCountDisplayElement = null;

  // 内部状态变量
  let isShowAllVideos = false; // 是否显示全部视频卡片
  let isBlockingOperationInProgress = false; // 是否正在执行BlockCard扫描操作
  let lastBlockScanExecutionTime = 0; // 上次执行BlockCard扫描的时间戳
  let blockedVideoCards = new Set(); // 存储已屏蔽的视频卡片元素
  let processedVideoCards = new WeakSet(); // 记录已处理过的卡片(避免重复处理，包括 UP主/标题检查和 tname 获取)
  let videoCardProcessQueue = new Set(); // 存储待处理的卡片，用于统一的队列处理
  let isVideoCardQueueProcessing = false; // 是否正在处理队列
  let isPageCurrentlyActive = true; // 页面是否可见
  let observerRetryCount = 0; // 观察器重试计数
  let countBlockInfo = 0; // 已屏蔽视频计数
  let countBlockAD = 0; // 已屏蔽广告计数
  let countBlockTName = 0; // 已屏蔽标签名计数
  let countBlockCM = 0; // 已屏蔽cm.bilibili.com软广计数

  // 用于不同页面UP主名称选择器
  const UP_NAME_SELECTORS = [
    ".bili-video-card__info--author", // 主页
    ".bili-video-card__author", // 分类页面 -> span title
    ".name", // 视频播放页
  ];

  // 用于不同页面视频标题选择器
  const VIDEO_TITLE_SELECTORS = [
    ".bili-video-card__info--tit", // 主页
    ".bili-video-card__title", // 分类页面 -> span title
    ".title", // 视频播放页
  ];

  /**
   * 为视频卡片添加屏蔽按钮容器。
   * @param {string} upName - UP主名称。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {HTMLElement} 创建的容器元素。
   */
  function addBlockContainerToCard(upName, cardElement) {
    if (!cardElement.querySelector(".bilibili-blacklist-block-container")) {
      const container = document.createElement("div");
      container.classList.add("bilibili-blacklist-block-container");

      if (!cardElement.querySelector(".bilibili-blacklist-block-btn")) {
        const blockButton = createBlockUpButton(upName, cardElement);
        if (isCurrentPageVideo()) {
          // 视频播放页面的视频卡片结构特殊，需要调整位置
          cardElement.querySelector(".card-box").style.position = "relative";
          cardElement.querySelector(".card-box").appendChild(container);
        } else if (isCurrentPageCategory()) {
          // 分类页面的视频卡片结构特殊，需要调整位置
          cardElement.querySelector(".bili-video-card").appendChild(container);
        } else {
          cardElement.appendChild(container);
        }
        container.appendChild(blockButton);
      }
      return cardElement.querySelector(".bilibili-blacklist-block-container");
    }
    return cardElement.querySelector(".bilibili-blacklist-block-container");
  }

  /**
   * 隐藏给定的视频卡片。
   * @param {HTMLElement} cardElement - 要隐藏的视频卡片元素。
   * @param {string} type - 隐藏类型，默认为"info"。
   * @returns {void}
   *
   */
  function hideVideoCard(cardElement, type = "none") {
    const realCardToBlock = getRealVideoCardElement(cardElement);
    if (!blockedVideoCards.has(realCardToBlock)) {
      blockedVideoCards.add(realCardToBlock);
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
      countBlockInfo++;
    }
    if (type === "ad") {
      countBlockAD++;
    }
    if (type === "tname") {
      countBlockTName++;
    }
    if (type === "cm") {
      countBlockCM++;
    }
    if (type === "vertical") {
      countBlockTName++;
    }
    //console.log(type);

    if (globalPluginConfig.flagKirby) {
      addKirbyOverlayToCard(cardElement);
    } else {
      realCardToBlock.style.display = "none";
    }
  }

  /**
   * 获取应该被屏蔽的卡片的真正父元素。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {HTMLElement} 应用显示更改的实际元素。
   */
  function getRealVideoCardElement(cardElement) {
    // 搜索页面的视频卡片父元素是上一级
    if (isCurrentPageSearch()) {
      return cardElement.parentElement;
    }
    // 主页视频卡片可能有多层父元素
    if (isCurrentPageMain()) {
      if (cardElement.parentElement.classList.contains("bili-feed-card")) {
        cardElement = cardElement.parentElement;
        if (cardElement.parentElement.classList.contains("feed-card")) {
          cardElement = cardElement.parentElement;
        }
      }
    }
    return cardElement;
  }

  /**
   * 根据当前页面选择所有视频卡片。
   * @returns {NodeListOf<HTMLElement> | null} 视频卡片元素的NodeList，如果不是识别的页面则返回null。
   */
  function queryAllVideoCards() {
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
   * 扫描并处理视频卡片进行屏蔽。
   */
  function scanAndBlockVideoCards() {
    const now = Date.now();
    // 限制扫描频率，防止性能问题
    if (
      isBlockingOperationInProgress ||
      now - lastBlockScanExecutionTime < globalPluginConfig.blockScanInterval
    ) {
      return;
    }

    isBlockingOperationInProgress = true;
    lastBlockScanExecutionTime = now;

    try {
      const videoCards = queryAllVideoCards();
      if (!videoCards) return;

      videoCards.forEach((card) => {
        // 如果卡片已经处理过，则跳过
        if (processedVideoCards.has(card)) {
          return;
        }
        const { upName, videoTitle } = getVideoCardInfo(card);
        // 如果获取到UP主名称和视频标题，则添加屏蔽按钮
        if (upName && videoTitle) {
          addBlockContainerToCard(upName, card);

          // --- 根据 flagHideOnLoad 开关决定是否立即隐藏卡片 ---
          const realCard = getRealVideoCardElement(card);
          if (globalPluginConfig.flagHideOnLoad && !isShowAllVideos) {
            // 只有在"显示全部"模式关闭时才执行
            if (globalPluginConfig.flagKirby) {
              addKirbyOverlayToCard(card); // 卡比模式下添加遮罩
              realCard.style.display = "block"; // 确保卡片本身是显示的
            } else {
              realCard.style.display = "none"; // 非卡比模式下直接隐藏
            }
          }
        }
        // --- 立即隐藏卡片的逻辑结束 ---

        // 将卡片添加到处理队列
        videoCardProcessQueue.add(card);
      });

      // 如果队列中有待处理的卡片且当前未在处理中，则开始处理队列
      if (videoCardProcessQueue.size > 0 && !isVideoCardQueueProcessing) {
        processVideoCardQueue();
      }

      // 刷新屏蔽计数显示
      refreshBlockCountDisplay();
      // 修正主页布局
      fixMainPageLayout();
    } finally {
      isBlockingOperationInProgress = false;
    }
  }

  /**
   * 修正主页在屏蔽后的布局。
   */
  function fixMainPageLayout() {
    if (!isCurrentPageMain()) return;
    const container = document.querySelector(
      ".recommended-container_floor-aside .container"
    );

    if (container) {
      const children = container.children;
      let visibleIndex = 0;
      // 调整可见卡片的边距，使布局更紧凑
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.style.display !== "none") {
          if (visibleIndex <= 6) {
            child.style.marginTop = "0px";
          } else if (visibleIndex < 12) {
            child.style.marginTop = "24px";
          } else {
            break;
          }
          visibleIndex++;
        }
      }
    }
  }

  /**
   * 切换所有被屏蔽视频卡片的显示。
   */
  function toggleShowAllBlockedVideos() {
    isShowAllVideos = !isShowAllVideos;
    blockedVideoCards.forEach((card) => {
      if (globalPluginConfig.flagKirby) {
        const kirbyOverlay = card.querySelector("#bilibili-blacklist-kirby");
        if (kirbyOverlay) {
          kirbyOverlay.style.display = isShowAllVideos ? "none" : "block";
        }
        card.style.display = "block";
      } else {
        card.style.display = isShowAllVideos ? "block" : "none";
      }
    });
    tempUnblockButton.textContent = isShowAllVideos ? "恢复屏蔽" : "取消屏蔽";
    tempUnblockButton.style.background = isShowAllVideos
      ? "#dddddd"
      : "#fb7299";
  }

  /**
   * 从视频卡片中检索UP主名称和视频标题。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {{upName: string, videoTitle: string}} 包含UP主名称和视频标题的对象。
   */
  function getVideoCardInfo(cardElement) {
    let upName = "";
    let videoTitle = "";

    const upNameElements = cardElement.querySelectorAll(
      UP_NAME_SELECTORS.join(", ")
    );
    if (upNameElements.length > 0) {
      upName = upNameElements[0].textContent.trim();
      if (isCurrentPageCategory()) {
        // 分类页面的UP主名称可能包含其他信息，需要进一步处理
        upName = upName.split(" · ")[0].trim();
      }
    }

    const titleElements = cardElement.querySelectorAll(
      VIDEO_TITLE_SELECTORS.join(", ")
    );
    if (titleElements.length > 0) {
      videoTitle = titleElements[0].textContent.trim();
    }
    return { upName, videoTitle };
  }

  /**
   * 检查UP主名称或标题是否在黑名单中。
   * @param {string} upName - 要检查的UP主名称。
   * @param {string} title - 要检查的视频标题。
   * @returns {boolean} 如果在黑名单中则返回true，否则返回false。
   */
  function isBlacklisted(upName, title) {
    const lowerCaseUpName = upName.toLowerCase();
    // 检查精确匹配黑名单
    if (
      exactMatchBlacklist.some((item) => item.toLowerCase() === lowerCaseUpName)
    ) {
      return true;
    }

    // 检查正则匹配黑名单
    if (
      regexMatchBlacklist.some((regex) => new RegExp(regex, "i").test(upName))
    ) {
      return true;
    }
    if (
      regexMatchBlacklist.some((regex) => new RegExp(regex, "i").test(title))
    ) {
      return true;
    }
    return false;
  }

  /**
   * 将UP主名称添加到精确匹配黑名单并刷新。
   * @param {string} upName - 要添加的UP主名称。
   * @param {HTMLElement} [cardElement=null] - 添加后要隐藏的视频卡片元素。
   */
  function addToExactBlacklist(upName, cardElement = null) {
    try {
      if (!upName) return;
      if (!exactMatchBlacklist.includes(upName)) {
        exactMatchBlacklist.push(upName);
        saveBlacklistsToStorage();
        refreshAllPanelTabs();
        if (cardElement) {
          hideVideoCard(cardElement);
        }
        hideAllCardsByUpName(upName);
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 添加黑名单出错:", e);
    }
  }

  /**
   * 从精确匹配黑名单中移除UP主名称。
   * @param {string} upName - 要移除的UP主名称。
   */
  function removeFromExactBlacklist(upName) {
    try {
      if (exactMatchBlacklist.includes(upName)) {
        const index = exactMatchBlacklist.indexOf(upName);
        exactMatchBlacklist.splice(index, 1);
        saveBlacklistsToStorage();
        refreshExactMatchList();
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 移除黑名单出错:", e);
    }
  }

  /**
   * 将标签名添加到黑名单并刷新。
   * @param {string} tagName - 要添加的标签名。
   * @param {HTMLElement} [cardElement=null] - 添加后要隐藏的视频卡片元素。
   */
  function addToTagNameBlacklist(tagName, cardElement = null) {
    try {
      if (!tagName) {
        return;
      }
      if (!tagNameBlacklist.includes(tagName)) {
        tagNameBlacklist.push(tagName);
        saveBlacklistsToStorage();
        refreshAllPanelTabs();
        if (cardElement) {
          hideVideoCard(cardElement);
        }
        hideAllCardsByTagName(tagName);
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 添加标签黑名单出错:", e);
    }
  }

  /**
   * 从黑名单中移除标签名。
   * @param {string} tagName - 要移除的标签名。
   */
  function removeFromTagNameBlacklist(tagName) {
    try {
      if (tagNameBlacklist.includes(tagName)) {
        const index = tagNameBlacklist.indexOf(tagName);
        tagNameBlacklist.splice(index, 1);
        saveBlacklistsToStorage();
        refreshTagNameList();
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 移除标签黑名单出错:", e);
    }
  }

  /**
   * 隐藏所有匹配指定UP主名称的视频卡片。
   * @param {string} upName - 要匹配的UP主名称。
   */
  function hideAllCardsByUpName(upName) {
    const videoCards = queryAllVideoCards();
    if (!videoCards) return;
    videoCards.forEach(card => {
      const { upName: cardUpName, videoTitle } = getVideoCardInfo(card);
      if (cardUpName && isBlacklisted(cardUpName, videoTitle)) {
        hideVideoCard(card, "info");
      }
    });
  }

  /**
   * 隐藏所有匹配指定标签名的视频卡片。
   * @param {string} tagName - 要匹配的标签名。
   */
  function hideAllCardsByTagName(tagName) {
    const videoCards = queryAllVideoCards();
    if (!videoCards) return;
    videoCards.forEach(card => {
      if (isCardBlacklistedByTagName(card)) {
        hideVideoCard(card, "tname");
      }
    });
  }
}