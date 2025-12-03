// 核心功能模块
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

window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.CoreFeatures = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;

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
  // 用于不同页面视频标题选择器

  // 为视频卡片添加屏蔽按钮容器
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

  // 隐藏给定的视频卡片
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
      countBlockTName++; // 修正这里应该是countBlockVertical，但原代码有误
    }
    //console.log(tpye);

    if (StorageManager.globalPluginConfig.flagKirby) {
      addKirbyOverlayToCard(cardElement);
    } else {
      realCardToBlock.style.display = "none";
    }
  }

  // 获取应该被屏蔽的卡片的真正父元素
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

  // 根据当前页面选择所有视频卡片
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

  // 扫描并处理视频卡片进行屏蔽
  function scanAndBlockVideoCards() {
    const now = Date.now();
    // 限制扫描频率，防止性能问题
    if (
      isBlockingOperationInProgress ||
      now - lastBlockScanExecutionTime < StorageManager.globalPluginConfig.blockScanInterval
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
          if (StorageManager.globalPluginConfig.flagHideOnLoad && !isShowAllVideos) {
            // 只有在"显示全部"模式关闭时才执行
            if (StorageManager.globalPluginConfig.flagKirby) {
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

  // 修正主页在屏蔽后的布局
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

  // 切换所有被屏蔽视频卡片的显示
  function toggleShowAllBlockedVideos() {
    isShowAllVideos = !isShowAllVideos;
    blockedVideoCards.forEach((card) => {
      if (StorageManager.globalPluginConfig.flagKirby) {
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

  // 从视频卡片中检索UP主名称和视频标题
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

  // 检查UP主名称或标题是否在黑名单中
  function isBlacklisted(upName, title) {
    const lowerCaseUpName = upName.toLowerCase();
    // 检查精确匹配黑名单
    if (
      StorageManager.exactMatchBlacklist.some((item) => item.toLowerCase() === lowerCaseUpName)
    ) {
      return true;
    }

    // 检查正则匹配黑名单
    if (
      StorageManager.regexMatchBlacklist.some((regex) => new RegExp(regex, "i").test(upName))
    ) {
      return true;
    }
    if (
      StorageManager.regexMatchBlacklist.some((regex) => new RegExp(regex, "i").test(title))
    ) {
      return true;
    }
    return false;
  }

  // 将UP主名称添加到精确匹配黑名单并刷新
  function addToExactBlacklist(upName, cardElement = null) {
    try {
      if (!upName) return;
      if (!StorageManager.exactMatchBlacklist.includes(upName)) {
        StorageManager.exactMatchBlacklist.push(upName);
        StorageManager.saveBlacklistsToStorage();
        refreshAllPanelTabs();
        if (cardElement) {
          hideVideoCard(cardElement);
        }
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 添加黑名单出错:", e);
    }
  }

  // 从精确匹配黑名单中移除UP主名称
  function removeFromExactBlacklist(upName) {
    try {
      if (StorageManager.exactMatchBlacklist.includes(upName)) {
        const index = StorageManager.exactMatchBlacklist.indexOf(upName);
        StorageManager.exactMatchBlacklist.splice(index, 1);
        StorageManager.saveBlacklistsToStorage();
        refreshExactMatchList();
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 移除黑名单出错:", e);
    }
  }

  // 将标签名添加到黑名单并刷新
  function addToTagNameBlacklist(tagName, cardElement = null) {
    try {
      if (!tagName) {
        return;
      }
      if (!StorageManager.tagNameBlacklist.includes(tagName)) {
        StorageManager.tagNameBlacklist.push(tagName);
        StorageManager.saveBlacklistsToStorage();
        refreshAllPanelTabs();
        if (cardElement) {
          hideVideoCard(cardElement);
        }
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 添加标签黑名单出错:", e);
    }
  }

  // 从黑名单中移除标签名
  function removeFromTagNameBlacklist(tagName) {
    try {
      if (StorageManager.tagNameBlacklist.includes(tagName)) {
        const index = StorageManager.tagNameBlacklist.indexOf(tagName);
        StorageManager.tagNameBlacklist.splice(index, 1);
        StorageManager.saveBlacklistsToStorage();
        refreshTagNameList();
      }
    } catch (e) {
      console.error("[bilibili-blacklist] 移除标签黑名单出错:", e);
    }
  }

  // 处理视频卡片队列进行屏蔽
  async function processVideoCardQueue() {
    if (isVideoCardQueueProcessing) return;
    isVideoCardQueueProcessing = true;

    while (videoCardProcessQueue.size > 0) {
      // 如果页面不可见，则暂停处理
      if (!isPageCurrentlyActive) {
        await sleep(1000);
        continue;
      }

      const iterator = videoCardProcessQueue.values();
      const card = iterator.next().value;
      videoCardProcessQueue.delete(card);

      if (!card || processedVideoCards.has(card)) {
        continue;
      }

      let shouldHide = false;
      let blockType = "none";
      // 如果启用了标签屏蔽且当前卡片未被隐藏
      const link = getCardHrefLink(card);
      if (checkLinkCM(link)) {
        shouldHide = true;
        blockType = "cm";
      }
      const { upName, videoTitle } = getVideoCardInfo(card);
      if (upName && videoTitle && !shouldHide) {
        // 如果UP主名称或标题在黑名单中，且启用了信息屏蔽
        if (isBlacklisted(upName, videoTitle) && StorageManager.globalPluginConfig.flagInfo) {
          shouldHide = true;
          blockType = "info";
        }
      } else {
        // 如果无法获取UP主名称和标题，但卡片已被隐藏或有Kirby覆盖，则也认为应该隐藏
        if (
          getRealVideoCardElement(card).style.display === "none" &&
          !StorageManager.globalPluginConfig.flagKirby
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
        (StorageManager.globalPluginConfig.flagTName || StorageManager.globalPluginConfig.flagVertical) &&
        !shouldHide
      ) {
        const bvId = getLinkBvId(link);
        // 如果存在BV ID且卡片尚未添加标签组
        if (bvId && !card.querySelector(".bilibili-blacklist-tname-group")) {
          const data = await getBilibiliVideoApiData(bvId);
          if (data) {
            const container = card.querySelector(
              ".bilibili-blacklist-block-container"
            );
            if (container) {
              const tnameGroup = document.createElement("div");
              tnameGroup.className = "bilibili-blacklist-tname-group";
              let hasTname = false;

              if (data.tname) {
                const btn = createTNameBlockButton(data.tname, card);
                tnameGroup.appendChild(btn);
                hasTname = true;
              }
              if (data.tname_v2) {
                const tnameElement = createTNameBlockButton(
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

            if (isCardBlacklistedByTagName(card)) {
              shouldHide = true;
              blockType = "tname";
            }
            // 如果启用了垂直视频屏蔽
            if (
              data.dimension.width &&
              data.dimension.height &&
              !shouldHide &&
              StorageManager.globalPluginConfig.flagVertical
            ) {
              const dimension = data.dimension.width / data.dimension.height;
              if (dimension < StorageManager.globalPluginConfig.verticalScaleThreshold) {
                shouldHide = true;
                blockType = "vertical";
              }
            }
          }
        }
      }

      if (shouldHide) {
        hideVideoCard(card, blockType);
      } else {
        const realCardToDisplay = getRealVideoCardElement(card);
        if (blockedVideoCards.has(realCardToDisplay)) {
          blockedVideoCards.delete(realCardToDisplay);
        }
        if (StorageManager.globalPluginConfig.flagKirby) {
          removeKirbyOverlay(card);
        }
        realCardToDisplay.style.display = "block";
      }

      processedVideoCards.add(card); // 标记卡片已处理

      await sleep(StorageManager.globalPluginConfig.processQueueInterval || 100);
    }
    isVideoCardQueueProcessing = false;
    refreshBlockCountDisplay();
  }

  // 异步等待函数
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 重置状态
  function resetState() {
    isBlockingOperationInProgress = false;
    lastBlockScanExecutionTime = 0;
    blockedVideoCards = new Set();
    videoCardProcessQueue = new Set();
    processedVideoCards = new WeakSet();
  }

  return {
    addBlockContainerToCard,
    hideVideoCard,
    getRealVideoCardElement,
    queryAllVideoCards,
    scanAndBlockVideoCards,
    fixMainPageLayout,
    toggleShowAllBlockedVideos,
    getVideoCardInfo,
    isBlacklisted,
    addToExactBlacklist,
    removeFromExactBlacklist,
    addToTagNameBlacklist,
    removeFromTagNameBlacklist,
    processVideoCardQueue,
    sleep,
    resetState,
    // 状态变量
    get isShowAllVideos() { return isShowAllVideos; },
    set isShowAllVideos(value) { isShowAllVideos = value; },
    get countBlockInfo() { return countBlockInfo; },
    get countBlockAD() { return countBlockAD; },
    get countBlockTName() { return countBlockTName; },
    get countBlockCM() { return countBlockCM; },
    get blockedVideoCards() { return blockedVideoCards; },
    get processedVideoCards() { return processedVideoCards; },
    get videoCardProcessQueue() { return videoCardProcessQueue; },
    get isVideoCardQueueProcessing() { return isVideoCardQueueProcessing; },
    set isVideoCardQueueProcessing(value) { isVideoCardQueueProcessing = value; },
    get isPageCurrentlyActive() { return isPageCurrentlyActive; },
    set isPageCurrentlyActive(value) { isPageCurrentlyActive = value; },
    get observerRetryCount() { return observerRetryCount; },
    set observerRetryCount(value) { observerRetryCount = value; }
  };
})();