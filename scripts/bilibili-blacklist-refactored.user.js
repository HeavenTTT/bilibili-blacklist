// 存储管理模块
// 默认精确匹配黑名单（区分大小写）
const DEFAULT_EXACT_MATCH_BLACKLIST = [
  "绝区零",
  "崩坏星穹铁道",
  "崩坏3",
  "原神",
  "米哈游miHoYo",
];

// 默认正则匹配黑名单（不区分大小写）
const DEFAULT_REGEX_MATCH_BLACKLIST = [
  "王者荣耀",
  "和平精英",
  "PUBG",
  "绝地求生",
  "吃鸡",
];

// 默认标签名黑名单
const DEFAULT_TAG_NAME_BLACKLIST = ["手机游戏"];

// 默认全局配置
const DEFAULT_GLOBAL_CONFIG = {
  flagInfo: true, // 启用/禁用按UP主名/标题屏蔽
  flagAD: true, // 启用/禁用屏蔽一般广告
  flagTName: true, // 启用/禁用按标签名屏蔽（需要API调用）
  flagCM: true, // 启用/禁用屏蔽cm.bilibili.com软广
  flagKirby: true, // 启用/禁用被屏蔽视频的卡比覆盖模式
  processQueueInterval: 200, // 处理队列中单个卡片的延迟时间（毫秒）
  blockScanInterval: 200, // BlockCard扫描新卡片的间隔时间（毫秒）
  flagHideOnLoad: true, // 启用/禁用页面加载时自动隐藏
  flagVertical: true, // 启用/禁用屏蔽竖屏视频
  verticalScaleThreshold: 0.7 || 0.7, // 竖屏视频的宽高比阈值（0-1）
};

window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.StorageManager = (function() {
  // 从存储中获取黑名单
  let exactMatchBlacklist = GM_getValue("exactBlacklist", DEFAULT_EXACT_MATCH_BLACKLIST);
  // 默认正则匹配黑名单（不区分大小写）
  let regexMatchBlacklist = GM_getValue("regexBlacklist", DEFAULT_REGEX_MATCH_BLACKLIST);
  // 默认标签名黑名单
  let tagNameBlacklist = GM_getValue("tNameBlacklist", DEFAULT_TAG_NAME_BLACKLIST);

  // 从存储中获取全局配置
  let globalPluginConfig = GM_getValue("globalConfig", DEFAULT_GLOBAL_CONFIG);

  // 将黑名单保存到存储中
  function saveBlacklistsToStorage() {
    GM_setValue("exactBlacklist", exactMatchBlacklist);
    GM_setValue("regexBlacklist", regexMatchBlacklist);
    GM_setValue("tNameBlacklist", tagNameBlacklist);
  }

  // 将全局配置保存到存储中
  function saveGlobalConfigToStorage() {
    GM_setValue("globalConfig", globalPluginConfig);
  }

  return {
    exactMatchBlacklist,
    regexMatchBlacklist,
    tagNameBlacklist,
    globalPluginConfig,
    saveBlacklistsToStorage,
    saveGlobalConfigToStorage
  };
})();
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
// 视频数据获取模块
window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.VideoDataFetcher = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;

  // 获取视频卡片的链接
  function getCardHrefLink(cardElement) {
    const hrefLink = cardElement.querySelector("a");
    if (hrefLink) {
      return hrefLink.getAttribute("href");
    }
    return null;
  }

  function checkLinkCM(link) {
    if (!link) return false;
    // 如果是cm.bilibili.com的链接，且启用了CM广告屏蔽，则隐藏卡片
    if (link.match(/cm.bilibili.com/) && StorageManager.globalPluginConfig.flagCM) {
      return true;
    }
    return false;
  }
  
  // 从视频卡片的链接中提取BV ID
  // 还处理cm.bilibili.com广告的屏蔽
  function getLinkBvId(link) {
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

  // 使用BV ID从Bilibili API获取视频信息
  async function getBilibiliVideoApiData(bvid) {
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

  // 检查卡片是否包含任何黑名单标签
  function isCardBlacklistedByTagName(cardElement) {
    const tnameGroup = cardElement.querySelector(
      ".bilibili-blacklist-tname-group"
    );
    if (tnameGroup) {
      const tnameElements = tnameGroup.querySelectorAll(
        ".bilibili-blacklist-tname"
      );
      for (const tnameElement of tnameElements) {
        const tname = tnameElement.textContent.trim();
        if (StorageManager.tagNameBlacklist.includes(tname)) {
          return true;
        }
      }
    }
    return false;
  }

  return {
    getCardHrefLink,
    checkLinkCM,
    getLinkBvId,
    getBilibiliVideoApiData,
    isCardBlacklistedByTagName
  };
})();
// UI元素模块
window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.UIElements = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;
  const VideoDataFetcher = window.BilibiliBlacklist.VideoDataFetcher;

  // UI元素（稍后初始化）
  let tempUnblockButton;
  let managerPanel;
  let exactMatchListElement;
  let regexMatchListElement;
  let tagNameListElement;
  let configListElement;
  let blockCountTitleElement;
  let blockCountDisplayElement = null;

  // 为UP主创建屏蔽按钮，显示在视频卡片上
  function createBlockUpButton(upName, cardElement) {
    const button = document.createElement("div");
    button.className = "bilibili-blacklist-block-btn";
    button.innerHTML = "屏蔽";
    button.title = `屏蔽: ${upName}`;

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡，防止触发视频点击事件
      CoreFeatures.addToExactBlacklist(upName, cardElement);
    });

    return button;
  }

  // 为标签名创建屏蔽按钮，显示在视频卡片上
  function createTNameBlockButton(tagName, cardElement) {
    const button = document.createElement("span");
    button.className = "bilibili-blacklist-tname";
    button.innerHTML = `${tagName}`;
    button.title = `屏蔽: ${tagName}`;

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      CoreFeatures.addToTagNameBlacklist(tagName, cardElement);
    });

    return button;
  }

  // 将黑名单管理器按钮添加到右侧导航条
  function addBlacklistManagerButton() {
    const rightEntry = document.querySelector(".right-entry");
    if (!rightEntry) {
      console.warn("[bilibili-blacklist] 未找到右侧导航栏");
      return;
    } else if (
      !rightEntry.querySelector("#bilibili-blacklist-manager-button")
    ) {
      const listItem = document.createElement("li");
      listItem.id = "bilibili-blacklist-manager-button";
      listItem.style.cursor = "pointer";
      listItem.className = "v-popover-wrap";

      const button = document.createElement("div");
      button.className = "right-entry-item";
      button.style.display = "flex";
      button.style.flexDirection = "column";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";

      const icon = document.createElement("div");
      icon.className = "right-entry__outside";
      icon.innerHTML = getKirbySVG(); // 获取卡比SVG图标
      icon.style.marginBottom = "-5px";

      blockCountDisplayElement = document.createElement("span");
      blockCountDisplayElement.textContent = `0`;

      button.appendChild(icon);
      button.appendChild(blockCountDisplayElement);
      listItem.appendChild(button);

      // 将按钮插入到导航栏的特定位置
      if (rightEntry.children.length > 1) {
        rightEntry.insertBefore(listItem, rightEntry.children[1]);
      } else {
        rightEntry.appendChild(listItem);
      }

      // 点击按钮显示/隐藏管理面板
      listItem.addEventListener("click", () => {
        if (managerPanel.style.display === "none") {
          managerPanel.style.display = "flex";
        } else {
          managerPanel.style.display = "none";
        }
      });
    }
  }

  // 更新已屏蔽视频的显示计数
  function refreshBlockCountDisplay() {
    if (blockCountDisplayElement) {
      blockCountDisplayElement.textContent = `${CoreFeatures.blockedVideoCards.size}`;
    }
    if (blockCountTitleElement) {
      blockCountTitleElement.textContent = `已屏蔽视频 (${CoreFeatures.blockedVideoCards.size} = ${CoreFeatures.countBlockInfo} + ${CoreFeatures.countBlockAD} + ${CoreFeatures.countBlockCM} + ${CoreFeatures.countBlockTName})`;
    }
  }

  // 辅助函数：创建通用按钮
  function createPanelButton(text, bgColor, onClick) {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.padding = "4px 8px";
    button.style.background = bgColor;
    button.style.color = "#fff";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);
    return button;
  }

  // 辅助函数：为黑名单面板创建列表项
  function createBlacklistListItem(contentText, onRemoveClick) {
    const item = document.createElement("li");
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.padding = "8px 0";
    item.style.borderBottom = "1px solid #f1f2f3";

    const content = document.createElement("span");
    content.textContent = contentText;
    content.style.flex = "1";
    const removeBtn = createPanelButton("移除", "#f56c6c", onRemoveClick);

    item.appendChild(content);
    item.appendChild(removeBtn);
    return item;
  }

  // 刷新面板中的精确匹配黑名单显示
  function refreshExactMatchList() {
    if (!exactMatchListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      exactMatchListElement = document.querySelector(
        "#bilibili-blacklist-exact-list"
      );
      if (!exactMatchListElement) {
        console.warn("[Bilibili-Blacklist] exactMatchListElement 未定义");
        return;
      }
    }
    exactMatchListElement.innerHTML = "";
    StorageManager.exactMatchBlacklist.forEach((upName) => {
      const item = createBlacklistListItem(upName, () => {
        CoreFeatures.removeFromExactBlacklist(upName);
      });
      exactMatchListElement.appendChild(item);
    });
    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(exactMatchListElement.children)
      .reverse()
      .forEach((item) => exactMatchListElement.appendChild(item));

    if (StorageManager.exactMatchBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无精确匹配屏蔽UP主";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      exactMatchListElement.appendChild(empty);
    }
  }

  // 刷新面板中的正则匹配黑名单显示
  function refreshRegexMatchList() {
    if (!regexMatchListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      regexMatchListElement = document.querySelector(
        "#bilibili-blacklist-regex-list"
      );
      if (!regexMatchListElement) {
        console.warn("[Bilibili-Blacklist] regexMatchListElement 未定义");
        return;
      }
    }
    regexMatchListElement.innerHTML = "";

    StorageManager.regexMatchBlacklist.forEach((regex, index) => {
      const item = createBlacklistListItem(regex, () => {
        StorageManager.regexMatchBlacklist.splice(index, 1);
        StorageManager.saveBlacklistsToStorage();
        refreshRegexMatchList();
      });
      regexMatchListElement.appendChild(item);
    });

    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(regexMatchListElement.children)
      .reverse()
      .forEach((item) => regexMatchListElement.appendChild(item));

    if (StorageManager.regexMatchBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无正则匹配屏蔽规则";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      regexMatchListElement.appendChild(empty);
    }
  }

  // 刷新面板中的标签名黑名单显示
  function refreshTagNameList() {
    if (!tagNameListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      tagNameListElement = document.querySelector(
        "#bilibili-blacklist-tname-list"
      );
      if (!tagNameListElement) {
        console.warn("[Bilibili-Blacklist] tagNameListElement 未定义");
        return;
      }
    }
    tagNameListElement.innerHTML = "";

    StorageManager.tagNameBlacklist.forEach((tagName) => {
      const item = createBlacklistListItem(tagName, () => {
        CoreFeatures.removeFromTagNameBlacklist(tagName);
      });
      tagNameListElement.appendChild(item);
    });
    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(tagNameListElement.children)
      .reverse()
      .forEach((item) => tagNameListElement.appendChild(item));

    if (StorageManager.tagNameBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无标签屏蔽规则";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      tagNameListElement.appendChild(empty);
    }
  }

  // 辅助函数：为设置创建切换按钮
  function createSettingToggleButton(labelText, configKey, title = null) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.marginBottom = "8px";
    container.style.gap = "8px";
    container.title = title; // 设置鼠标悬停提示

    const label = document.createElement("span");
    label.textContent = labelText;
    label.style.flex = "1";

    const button = document.createElement("button");
    button.style.padding = "6px 12px";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.color = "#fff";

    function refreshButtonAppearance() {
      button.textContent = StorageManager.globalPluginConfig[configKey] ? "开启" : "关闭";
      button.style.backgroundColor = StorageManager.globalPluginConfig[configKey]
        ? "#fb7299"
        : "#909399";
    }

    button.addEventListener("click", () => {
      StorageManager.globalPluginConfig[configKey] = !StorageManager.globalPluginConfig[configKey];
      refreshButtonAppearance();
      StorageManager.saveGlobalConfigToStorage();
    });

    refreshButtonAppearance(); // 初始化按钮外观

    container.appendChild(label);
    container.appendChild(button);

    return container;
  }
  
  // 辅助函数：为设置创建输入文本
  function createSettingInput(labelText, configKey, title = null) {
    // 卡片扫描间隔设置
    const Container = document.createElement("div");
    Container.style.display = "flex";
    Container.style.alignItems = "center";
    Container.style.marginTop = "16px";
    Container.style.gap = "8px";
    Container.title = title;

    const Label = document.createElement("span");
    Label.textContent = labelText;
    Label.style.flex = "1";

    const Input = document.createElement("input");
    Input.type = "number";
    Input.min = "0";
    Input.value = StorageManager.globalPluginConfig[configKey];
    Input.style.width = "100px";
    Input.style.padding = "6px";
    Input.style.border = "1px solid #ddd";
    Input.style.borderRadius = "4px";

    const Button = document.createElement("button");
    Button.textContent = "保存";
    Button.style.padding = "6px 12px";
    Button.style.backgroundColor = "#fb7299";
    Button.style.color = "#fff";
    Button.style.border = "none";
    Button.style.borderRadius = "4px";
    Button.style.cursor = "pointer";

    Button.addEventListener("click", () => {
      const val = parseFloat(Input.value, 10);
      if (!isNaN(val) && val >= 0) {
        StorageManager.globalPluginConfig[configKey] = val;
        StorageManager.saveGlobalConfigToStorage();
      } else {
        alert("请输入有效的非负数字！");
      }
    });
    Container.appendChild(Label);
    Container.appendChild(Input);
    Container.appendChild(Button);

    return Container;
  }
  
  // 刷新面板中的配置设置显示
  function refreshConfigSettings() {
    if (!configListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      configListElement = document.querySelector(
        "#bilibili-blacklist-config-list"
      );
      if (!configListElement) {
        console.warn("[Bilibili-Blacklist] configListElement 未定义");
        return;
      }
    }
    configListElement.innerHTML = "";

    // 临时开关按钮
    const tempToggleContainer = document.createElement("div");
    tempToggleContainer.style.display = "flex";
    tempToggleContainer.style.alignItems = "center";
    tempToggleContainer.style.marginBottom = "8px";
    tempToggleContainer.style.gap = "8px";
    tempToggleContainer.style.margin = "20px 0";

    const tempToggleLabel = document.createElement("span");
    tempToggleLabel.textContent = "临时开关";
    tempToggleLabel.style.flex = "1";

    tempUnblockButton = document.createElement("button");
    tempUnblockButton.textContent = CoreFeatures.isShowAllVideos ? "恢复屏蔽" : "取消屏蔽";
    tempUnblockButton.style.background = CoreFeatures.isShowAllVideos
      ? "#dddddd"
      : "#fb7299";
    tempUnblockButton.style.color = "#fff";
    tempUnblockButton.style.border = "none";
    tempUnblockButton.style.borderRadius = "4px";
    tempUnblockButton.style.cursor = "pointer";
    tempUnblockButton.style.padding = "6px 12px";
    tempUnblockButton.addEventListener("click", () => {
      CoreFeatures.toggleShowAllBlockedVideos();
    });

    tempToggleContainer.appendChild(tempToggleLabel);
    tempToggleContainer.appendChild(tempUnblockButton);
    configListElement.appendChild(tempToggleContainer);

    // 添加各种配置开关
    configListElement.appendChild(
      createSettingToggleButton(
        "启用UP/标题屏蔽",
        "flagInfo",
        "是否启用按UP主名称或视频标题进行屏蔽。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "启用广告屏蔽",
        "flagAD",
        "是否启用广告屏蔽功能。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "启用标签屏蔽",
        "flagTName",
        "是否启用按视频标签进行屏蔽。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "启用CM软广屏蔽",
        "flagCM",
        "是否启用cm.bilibili.com软广屏蔽。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "启用卡比覆盖模式",
        "flagKirby",
        "是否启用卡比覆盖模式，被屏蔽的视频会显示卡比覆盖层而不是完全隐藏。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "启用竖屏视频屏蔽",
        "flagVertical",
        "是否启用竖屏视频屏蔽。"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "页面加载时自动隐藏",
        "flagHideOnLoad",
        "是否在页面加载时自动隐藏已屏蔽的视频。"
      )
    );
    configListElement.appendChild(
      createSettingInput(
        "处理队列间隔(毫秒):",
        "processQueueInterval",
        "处理队列中单个卡片的延迟时间（毫秒）。"
      )
    );
    configListElement.appendChild(
      createSettingInput(
        "扫描间隔(毫秒):",
        "blockScanInterval",
        "BlockCard扫描新卡片的间隔时间（毫秒）。"
      )
    );
    configListElement.appendChild(
      createSettingInput(
        "竖屏视频比例阈值:",
        "verticalScaleThreshold",
        "获取的视频API信息后，判断视频是否为竖屏（长 除于 宽）的阈值。建议值 0.7。"
      )
    );
  }

  // 刷新黑名单管理面板中的所有标签页
  function refreshAllPanelTabs() {
    refreshExactMatchList();
    refreshRegexMatchList();
    refreshTagNameList();
    refreshConfigSettings();
  }

  // 检查黑名单管理面板是否已创建并存在于DOM中
  // 如果找到，则设置全局 `managerPanel` 引用
  function isBlacklistPanelCreated() {
    const panelInDom = document.querySelector(
      "#bilibili-blacklist-manager-panel"
    );
    if (panelInDom) {
      if (!managerPanel) {
        managerPanel = panelInDom;
      }
      return true;
    }
    return false;
  }

  // 创建黑名单管理面板
  function createBlacklistPanel() {
    if (isBlacklistPanelCreated()) {
      return;
    }
    managerPanel = document.createElement("div");
    managerPanel.id = "bilibili-blacklist-manager-panel"; // 确保ID唯一

    // 设置面板样式
    managerPanel.style.position = "fixed";
    managerPanel.style.top = "50%";
    managerPanel.style.left = "50%";
    managerPanel.style.transform = "translate(-50%, -50%)";
    managerPanel.style.width = "500px";
    managerPanel.style.maxHeight = "80vh";
    managerPanel.style.backgroundColor = "#fff";
    managerPanel.style.borderRadius = "8px";
    managerPanel.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    managerPanel.style.zIndex = "99999";
    managerPanel.style.overflow = "hidden";
    managerPanel.style.display = "none"; // 默认隐藏
    managerPanel.style.flexDirection = "column";
    managerPanel.style.backgroundColor = "#ffffffee"; // 半透明背景

    // 创建标签容器
    const tabContainer = document.createElement("div");
    tabContainer.style.display = "flex";
    tabContainer.style.borderBottom = "1px solid #f1f2f3";

    // 创建各个标签页的内容区域
    const exactContent = document.createElement("div");
    exactContent.style.padding = "16px";
    exactContent.style.overflowY = "auto";
    exactContent.style.flex = "1";
    exactContent.style.display = "block"; // 默认显示精确匹配

    const regexContent = document.createElement("div");
    regexContent.style.padding = "16px";
    regexContent.style.overflowY = "auto";
    regexContent.style.flex = "1";
    regexContent.style.display = "none";

    const tnameContent = document.createElement("div");
    tnameContent.style.padding = "16px";
    tnameContent.style.overflowY = "auto";
    tnameContent.style.flex = "1";
    tnameContent.style.display = "none";

    const configContent = document.createElement("div");
    configContent.style.padding = "16px";
    configContent.style.overflowY = "auto";
    configContent.style.flex = "1";
    configContent.style.display = "none";

    // 定义标签页数据
    const tabs = [
      { name: "精确匹配(Up名字)", content: exactContent },
      { name: "正则匹配(Up/标题)", content: regexContent },
      { name: "屏蔽分类", content: tnameContent },
      { name: "插件配置", content: configContent },
    ];
    tabs.forEach((tabData) => {
      const tab = document.createElement("div");
      tab.textContent = tabData.name;
      tab.style.padding = "12px 16px";
      tab.style.cursor = "pointer";
      tab.style.fontWeight = "500";
      tab.style.borderBottom =
        tabData.content.style.display === "block"
          ? "2px solid #fb7299"
          : "none";

      // 标签点击事件，切换内容显示
      tab.addEventListener("click", () => {
        tabs.forEach(({ tab: t, content: c }) => {
          t.style.borderBottom = "none";
          c.style.display = "none";
        });
        tab.style.borderBottom = "2px solid #fb7299";
        tabData.content.style.display = "block";
      });

      tabData.tab = tab; // 保存对标签元素的引用
      tabContainer.appendChild(tab);
    });

    // 创建面板头部
    const header = document.createElement("div");
    header.style.padding = "16px";
    header.style.borderBottom = "1px solid #f1f2f3";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    blockCountTitleElement = document.createElement("h3");
    blockCountTitleElement.style.margin = "0";
    blockCountTitleElement.style.fontWeight = "500";
    blockCountTitleElement.title = "总数 =(UP/标题 + 广告 + CM + 分类/竖屏)";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "0 8px";
    closeBtn.addEventListener("click", () => {
      managerPanel.style.display = "none";
    });

    header.appendChild(blockCountTitleElement);
    header.appendChild(closeBtn);

    const contentContainer = document.createElement("div");
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.flex = "1";
    contentContainer.style.overflow = "hidden";

    // 精确匹配添加输入框和按钮
    const addExactContainer = document.createElement("div");
    addExactContainer.style.display = "flex";
    addExactContainer.style.marginBottom = "16px";
    addExactContainer.style.gap = "8px";

    const exactInput = document.createElement("input");
    exactInput.type = "text";
    exactInput.placeholder = "输入要屏蔽的UP主名称";
    exactInput.style.flex = "1";
    exactInput.style.padding = "8px";
    exactInput.style.border = "1px solid #ddd";
    exactInput.style.borderRadius = "4px";

    const addExactBtn = document.createElement("button");
    addExactBtn.textContent = "添加";
    addExactBtn.style.padding = "8px 16px";
    addExactBtn.style.background = "#fb7299";
    addExactBtn.style.color = "#fff";
    addExactBtn.style.border = "none";
    addExactBtn.style.borderRadius = "4px";
    addExactBtn.style.cursor = "pointer";
    addExactBtn.addEventListener("click", () => {
      const upName = exactInput.value.trim();
      if (upName) {
        CoreFeatures.addToExactBlacklist(upName);
        exactInput.value = "";
      }
    });
    addExactContainer.appendChild(exactInput);
    addExactContainer.appendChild(addExactBtn);
    exactContent.appendChild(addExactContainer);

    // 正则匹配添加输入框和按钮
    const addRegexContainer = document.createElement("div");
    addRegexContainer.style.display = "flex";
    addRegexContainer.style.marginBottom = "16px";
    addRegexContainer.style.gap = "8px";

    const regexInput = document.createElement("input");
    regexInput.type = "text";
    regexInput.placeholder = "输入正则表达式 (如: 小小.*Official)";
    regexInput.style.flex = "1";
    regexInput.style.padding = "8px";
    regexInput.style.border = "1px solid #ddd";
    regexInput.style.borderRadius = "4px";

    const addRegexBtn = document.createElement("button");
    addRegexBtn.textContent = "添加";
    addRegexBtn.style.padding = "8px 16px";
    addRegexBtn.style.background = "#fb7299";
    addRegexBtn.style.color = "#fff";
    addRegexBtn.style.border = "none";
    addRegexBtn.style.borderRadius = "4px";
    addRegexBtn.style.cursor = "pointer";
    addRegexBtn.addEventListener("click", () => {
      const regex = regexInput.value.trim();
      if (regex && !StorageManager.regexMatchBlacklist.includes(regex)) {
        try {
          new RegExp(regex); // 验证正则表达式
          StorageManager.regexMatchBlacklist.push(regex);
          StorageManager.saveBlacklistsToStorage();
          regexInput.value = "";
          refreshRegexMatchList();
        } catch (e) {
          alert("无效的正则表达式: " + e.message);
        }
      }
    });
    addRegexContainer.appendChild(regexInput);
    addRegexContainer.appendChild(addRegexBtn);
    regexContent.appendChild(addRegexContainer);

    // 创建列表元素
    exactMatchListElement = document.createElement("ul");
    exactMatchListElement.id = "bilibili-blacklist-exact-list";
    exactMatchListElement.style.listStyle = "none";
    exactMatchListElement.style.padding = "0";
    exactMatchListElement.style.margin = "0";

    regexMatchListElement = document.createElement("ul");
    regexMatchListElement.id = "bilibili-blacklist-regex-list";
    regexMatchListElement.style.listStyle = "none";
    regexMatchListElement.style.padding = "0";
    regexMatchListElement.style.margin = "0";

    tagNameListElement = document.createElement("ul");
    tagNameListElement.id = "bilibili-blacklist-tname-list";
    tagNameListElement.style.listStyle = "none";
    tagNameListElement.style.padding = "0";
    tagNameListElement.style.margin = "0";

    configListElement = document.createElement("ul");
    configListElement.id = "bilibili-blacklist-config-list";
    configListElement.style.listStyle = "none";
    configListElement.style.padding = "0";
    configListElement.style.margin = "0";

    refreshAllPanelTabs(); // 初始化所有标签页内容
    exactContent.appendChild(exactMatchListElement);
    regexContent.appendChild(regexMatchListElement);
    tnameContent.appendChild(tagNameListElement);
    configContent.appendChild(configListElement);

    contentContainer.appendChild(exactContent);
    contentContainer.appendChild(regexContent);
    contentContainer.appendChild(tnameContent);
    contentContainer.appendChild(configContent);

    managerPanel.appendChild(tabContainer);
    managerPanel.appendChild(header);
    managerPanel.appendChild(contentContainer);

    // 添加全局CSS样式
    GM_addStyle(`
      .bilibili-blacklist-block-container {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 20px;
        margin-top: 5px;
        padding: 0 5px;
        font-size: 12px;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 3px;
        z-index: 9999;
        pointer-events: none;
        text-align:center;

    }

    .bili-video-card:hover .bilibili-blacklist-block-container,
    .card-box:hover .bilibili-blacklist-block-container {
        display: flex !important;
        pointer-events: none;
    }
    .card-box .bilibili-blacklist-block-container
    {
      flex-direction: column;
      align-items: flex-start;
      height: 100%;
    }
    .card-box .bilibili-blacklist-tname-group
    {
      flex-direction: column;
      align-items: flex-end;
      bottom: 0;
    }
    .card-box .bilibili-blacklist-tname-group .bilibili-blacklist-tname
    {
      background-color:rgba(255, 255, 255, 0.87);
      color: #9499A0;
      border: 1px solid #9499A0;
    }

    .bilibili-blacklist-block-btn {
        position: static;
        display: flex;
        width: 40px;
        height: 20px;
        justify-content: center;
        align-items: center;
        pointer-events: auto !important;
        background-color: #fb7299dd;
        color: white;
        border-radius: 10%;
        cursor: pointer;
        text-align: center;
    }

    .bilibili-blacklist-tname-group {
        display: flex;
        flex-direction: row;
        padding:0 5px;
        gap: 3px;
        align-items: center;
        margin-left: auto;
        max-width: 80%;
        pointer-events: none;
    }

    .bilibili-blacklist-tname {
        background-color: #fb7299dd;
        color: white;
        height: 20px;
        padding: 0 5px;
        border-radius: 10%;
        cursor: pointer;
        border-radius: 2px;
        pointer-events: auto;
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }


      /* 修复视频卡片布局 */
      .bili-video-card__cover {
          contain: layout !important;
      }
      /* 面板样式 */
      #bilibili-blacklist-manager-panel {
          font-size: 15px;
      }
      /* 按钮悬停效果 */
      #bilibili-blacklist-manager-panel button {
          transition: background-color 0.2s;
      }
      #bilibili-blacklist-manager-panel button:hover {
          opacity: 0.9;
      }
      /* 管理按钮悬停效果 */
      #bilibili-blacklist-manager-button:hover svg {
          transform: scale(1.1);
      }
      #bilibili-blacklist-manager-button svg {
          transition: transform 0.2s;
      }
      /* 输入框聚焦效果 */
      #bilibili-blacklist-manager-panel input:focus {
          outline: none;
          border-color: #fb7299 !important;
      }
      /*灰度效果*/
      .bilibili-blacklist-grayscale {
         filter: grayscale(95%);
      }
  `);

    document.body.appendChild(managerPanel);
    return managerPanel;
  }

  // 返回卡比图标的SVG代码
  function getKirbySVG() {
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

  // 为视频卡片添加卡比主题的覆盖层
  function addKirbyOverlayToCard(cardElement) {
    const kirbyWrapper = document.createElement("div");
    // 如果已经有Kirby覆盖层，则不重复添加
    if (cardElement.querySelector("#bilibili-blacklist-kirby") != null) return;
    kirbyWrapper.innerHTML = getKirbySVG();
    kirbyWrapper.id = "bilibili-blacklist-kirby";

    const justifyContent = isCurrentPageVideo() ? "flex-start" : "center";
    const alignItems = isCurrentPageVideo() ? "flex-start" : "center";
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
      if (isCurrentPageVideo()) {
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

  // 从视频卡片中移除卡比覆盖层
  function removeKirbyOverlay(cardElement) {
    const kirbyWrapper = cardElement.querySelector("#bilibili-blacklist-kirby");
    if (kirbyWrapper) {
      kirbyWrapper.remove();
    }
  }

  return {
    addBlacklistManagerButton,
    refreshBlockCountDisplay,
    refreshExactMatchList,
    refreshRegexMatchList,
    refreshTagNameList,
    refreshConfigSettings,
    refreshAllPanelTabs,
    isBlacklistPanelCreated,
    createBlacklistPanel,
    createBlockUpButton,
    createTNameBlockButton,
    addKirbyOverlayToCard,
    removeKirbyOverlay,
    // 全局变量
    get tempUnblockButton() { return tempUnblockButton; },
    set tempUnblockButton(value) { tempUnblockButton = value; },
    get managerPanel() { return managerPanel; },
    set managerPanel(value) { managerPanel = value; },
    get exactMatchListElement() { return exactMatchListElement; },
    set exactMatchListElement(value) { exactMatchListElement = value; },
    get regexMatchListElement() { return regexMatchListElement; },
    set regexMatchListElement(value) { regexMatchListElement = value; },
    get tagNameListElement() { return tagNameListElement; },
    set tagNameListElement(value) { tagNameListElement = value; },
    get configListElement() { return configListElement; },
    set configListElement(value) { configListElement = value; },
    get blockCountTitleElement() { return blockCountTitleElement; },
    set blockCountTitleElement(value) { blockCountTitleElement = value; },
    get blockCountDisplayElement() { return blockCountDisplayElement; },
    set blockCountDisplayElement(value) { blockCountDisplayElement = value; },
  };
})();
// 页面检测和初始化模块
window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.PageDetection = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;
  const UIElements = window.BilibiliBlacklist.UIElements;

  // 检查当前页面是否为Bilibili主页
  function isCurrentPageMain() {
    return location.pathname === "/";
  }

  // 初始化主页特有的功能
  function initializeMainPage() {
    initializeObserver("feedchannel-main"); // 观察主页内容区域
    console.log("[bilibili-blacklist] 主页已加载🍓");
  }

  // 检查当前页面是否为Bilibili搜索结果页
  function isCurrentPageSearch() {
    return location.hostname === "search.bilibili.com";
  }

  // 初始化搜索页特有的功能
  function initializeSearchPage() {
    initializeObserver("i_cecream"); // 观察搜索结果内容区域
    console.log("[bilibili-blacklist] 搜索页已加载🍉");
  }

  // 检查当前页面是否为Bilibili视频播放页
  function isCurrentPageVideo() {
    return location.pathname.startsWith("/video/");
  }

  // 初始化视频播放页特有的功能
  function initializeVideoPage() {
    // **用户修改 2: 延迟 5 秒启动屏蔽功能**
    console.log("[bilibili-blacklist] 播放页已加载，将延迟 5 秒启动功能。🍇");

    // 延迟 5 秒执行核心功能
    setTimeout(() => {
      initializeObserver("right-container"); // 观察视频播放页右侧推荐区域

      // 首次手动扫描和广告屏蔽
      CoreFeatures.scanAndBlockVideoCards();
      blockVideoPageAds();

      console.log("[bilibili-blacklist] 视频播放页屏蔽功能已启动。");
    }, 5000); // 5000 毫秒 = 5 秒
  }

  // 检查当前页面是否为Bilibili分类页
  function isCurrentPageCategory() {
    return location.pathname.startsWith("/c/");
  }

  // 初始化分类页特有的功能
  function initializeCategoryPage() {
    initializeObserver("app"); // 观察整个app容器
    console.log("[bilibili-blacklist] 分类页已加载🍊");
  }

  // 检查当前页面是否为Bilibili用户空间页
  function isCurrentUserSpace() {
    return location.hostname === "space.bilibili.com";
  }

  // 初始化用户空间页特有的功能
  function initializeUserSpace() {
    console.log("[bilibili-blacklist] 用户空间已加载🍎");
    const upNameSelector = "#h-name, .nickname"; // UP主名称的选择器
    // 创建一个MutationObserver来等待UP主名称元素加载
    const observerForUpName = new MutationObserver((mutations, observer) => {
      const upNameElement = document.querySelector(upNameSelector);
      if (upNameElement) {
        observer.disconnect(); // 找到元素后停止观察
        addBlockButtonToUserSpace(upNameElement);
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
      addBlockButtonToUserSpace(initialUpNameElement);
    }
  }

  // 在用户空间页面上的UP主名称元素添加屏蔽/取消屏蔽按钮
  function addBlockButtonToUserSpace(upNameElement) {
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
      const blocked = CoreFeatures.isBlacklisted(upName);
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
      const blocked = CoreFeatures.isBlacklisted(upName);
      if (blocked) {
        CoreFeatures.removeFromExactBlacklist(upName);
      } else {
        CoreFeatures.addToExactBlacklist(upName);
      }
      refreshButtonStatus(); // 更新按钮状态
    });

    refreshButtonStatus(); // 设置按钮初始状态

    upNameElement.appendChild(button);
  }

  // MutationObserver 检测动态加载的新内容
  const contentObserver = new MutationObserver((mutations) => {
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
        CoreFeatures.scanAndBlockVideoCards();
        if (isCurrentPageMain()) {
          blockMainPageAds(); // 主页广告屏蔽
        }
        if (isCurrentPageVideo()) {
          blockVideoPageAds(); // 视频页广告屏蔽
        }
        if (!document.getElementById("bilibili-blacklist-manager-button")) {
          UIElements.addBlacklistManagerButton(); // 确保管理按钮存在
        }
      }, StorageManager.globalPluginConfig.blockScanInterval);
    }
  });

  // 在指定容器上初始化MutationObserver
  function initializeObserver(containerIdOrSelector) {
    const rootNode =
      document.getElementById(containerIdOrSelector) ||
      document.querySelector(containerIdOrSelector) ||
      document.documentElement; // 默认观察整个文档

    if (rootNode) {
      contentObserver.observe(rootNode, {
        childList: true,
        subtree: true,
      });
      return true;
    } else {
      // 如果未找到根节点，则进行重试
      setTimeout(() => initializeObserver(containerIdOrSelector), 500);
      console.warn("[bilibili-blacklist] 未找到根节点，正在重试...");
      CoreFeatures.observerRetryCount++;

      if (CoreFeatures.observerRetryCount > 10) {
        console.error("[bilibili-blacklist] 重试次数过多，停止重试。");
        return false;
      }
    }
  }

  // 监听页面可见性变化
  document.addEventListener("visibilitychange", () => {
    CoreFeatures.isPageCurrentlyActive = !document.hidden;
  });

  return {
    isCurrentPageMain,
    initializeMainPage,
    isCurrentPageSearch,
    initializeSearchPage,
    isCurrentPageVideo,
    initializeVideoPage,
    isCurrentPageCategory,
    initializeCategoryPage,
    isCurrentUserSpace,
    initializeUserSpace,
    addBlockButtonToUserSpace,
    initializeObserver
  };
})();
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
// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      1.1.8
// @author       HeavenTTT
// @description  Bilibili UP屏蔽插件 - 屏蔽UP主视频卡片，支持精确匹配和正则匹配，支持视频页面、分类页面、搜索页面等。
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         https://www.bilibili.com/favicon.ico
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // 导入模块
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;
  const VideoDataFetcher = window.BilibiliBlacklist.VideoDataFetcher;
  const UIElements = window.BilibiliBlacklist.UIElements;
  const PageDetection = window.BilibiliBlacklist.PageDetection;
  const AdBlocker = window.BilibiliBlacklist.AdBlocker;

  /* 
   * Bilibili-BlackList -- Bilibili UP屏蔽插件
   * 脚本大部分代码由AI生成，作者一点都不懂JavaScript，出现bug请联系Gemini / ChatGPT / DeepSeek
   * this script is mainly generated by AI, the author doesn't know JavaScript at all, if there are bugs, please contact Gemini / ChatGPT / DeepSeek
   * 感谢你的使用
   * Thank you for using this script
   *
   * 本段注释为VS code 自动生成 this is a comment generated by VS code
   */

  //#region 初始化和入口点

  // 初始化脚本
  function initializeScript() {
    // 重置状态变量
    CoreFeatures.resetState();

    // 根据当前页面URL判断并初始化
    if (PageDetection.isCurrentPageMain()) {
      PageDetection.initializeMainPage();
      AdBlocker.blockMainPageAds();
    } else if (PageDetection.isCurrentPageSearch()) {
      PageDetection.initializeSearchPage();
      AdBlocker.blockMainPageAds(); // 搜索页也进行主页广告屏蔽
    } else if (PageDetection.isCurrentPageVideo()) {
      PageDetection.initializeVideoPage();
    } else if (PageDetection.isCurrentPageCategory()) {
      PageDetection.initializeCategoryPage();
    } else if (PageDetection.isCurrentUserSpace()) {
      PageDetection.initializeUserSpace();
    } else {
      return; // 不支持的页面不进行初始化
    }
    UIElements.createBlacklistPanel(); // 创建管理面板
    console.log("[bilibili-blacklist] 脚本已加载🥔");
  }

  // 监听DOMContentLoaded并检查readyState以进行早期初始化
  document.addEventListener("DOMContentLoaded", initializeScript);
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    initializeScript();
  }

  //#endregion
})();
