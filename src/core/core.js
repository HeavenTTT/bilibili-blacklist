/*
 * 核心模块
 * -----------------------------------------------------------
 * 卡片查找 / 屏蔽 / 黑名单增删 / 主页布局修正。
 */
let tempUnblockButton;
let managerPanel;
let exactMatchListElement;
let regexMatchListElement;
let tagNameListElement;
let videoTagListElement;
let configListElement;
let blockCountTitleElement;
let blockCountDisplayElement = null;
// 面板头部统计明细的数值元素（Map: row.key -> <b>），创建一次后只更新 textContent
let blockStatsValueElements = null;
// 统计明细里"7 日趋势柱"的元素数组（创建一次，只改高度/颜色）
let blockTrendBarElements = null;
// 统计明细是否展开（默认收起；收起时 refreshBlockCountDisplay 跳过 11 个数值的写入）
let isBlockStatsExpanded = false;

// 内部状态变量
let isShowAllVideos = false; // 是否显示全部视频卡片
let isBlockingOperationInProgress = false; // 是否正在执行BlockCard扫描操作
let lastBlockScanExecutionTime = 0; // 上次执行BlockCard扫描的时间戳
let blockedVideoCards = new Set(); // 存储已屏蔽的视频卡片元素
// 记录已处理过的卡片(避免重复处理，包括 UP主/标题检查和 tname 获取)。
// 键为 getRealVideoCardElement() 归一后的“真实卡片元素”：同一张视频卡片在分类页会同时以
// 外层 .feed-card 与内层 .bili-video-card 两种元素被观察到，必须按真实元素去重。
let processedVideoCards = new WeakSet();
// 已进入队列的“真实卡片元素”。同一张卡片的两种元素只会产生一条队列记录，
// 避免重复判定、重复提交以及屏蔽计数翻倍。
let queuedRealCards = new WeakSet();
let videoCardProcessQueue = new Set(); // 存储待处理的卡片，用于统一的队列处理
// 低优先级“补分类标签”队列：卡片已由 UP名/正则/软广判定完成，判定本身不再需要接口，
// 但 flagAlwaysFetchTName 开启时仍要显示分类标签按钮。这些请求排在主队列之后，
// 保证它们不会拖慢其它卡片的判定。
let tnameDecorateQueue = new Set();
let isVideoCardQueueProcessing = false; // 是否正在处理队列
let countBlockInfo = 0; // 已屏蔽视频计数（UP/标题名命中）
let countBlockAD = 0; // 已屏蔽广告计数
let countBlockTName = 0; // 已屏蔽分类标签计数
let countBlockVideoTag = 0; // 已屏蔽视频标签计数
let countBlockVertical = 0; // 已屏蔽竖屏计数
let countBlockCM = 0; // 已屏蔽cm.bilibili.com软广计数
// 以下为“非屏蔽原因”的附加统计（面板头部明细用，按页面生命周期累计、不持久化）
let countProcessedCards = 0; // 累计判定完成的卡片数（含取消屏蔽后的重新判定）
let countApiViewRequests = 0; // view 接口真实请求次数（命中缓存不计）
let countApiTagRequests = 0; // 视频标签接口真实请求次数（命中缓存不计）
let countNetworkInterceptItems = 0; // 网络拦截累计过滤掉的条目数
let countNetworkInterceptAds = 0; // 其中按官方 business_info 判定为广告的条目数
let countNetworkInterceptResponses = 0; // 网络拦截实际改写过的响应次数

// “未处理”卡片：进入视频页时先用 CSS filter 遮盖（不插按钮/kirby 遮罩子元素），
// 避免与 B 站 header 渲染竞争。该 WeakSet 记录已加 filter 的卡片，判定完成后清除。
const pendingFilterCards = new WeakSet();

// “未处理”遮盖使用的 filter 参数（单一真源）。
// 卡片走 JS 逐元素设置 style.filter；播放页广告走 ads.js 里的同参数 CSS 规则，
// 两边视觉完全一致，调整时只需改这一处。
const PENDING_FILTER_STYLE = "blur(8px) grayscale(0.5) opacity(0.4)";

// 用于不同页面UP主名称选择器
// 注意：把具体/作者专用的选择器排在前面，`.name` 这类宽泛选择器放最后作兜底，
// 避免在视频播放页等结构里优先匹配到“游戏名/标签/评论者”等非 UP 名的 `.name`。
const UP_NAME_SELECTORS = [
  ".bili-video-card__info--author", // 主页
  ".bili-video-card__author", // 分类页面 -> span title
  ".upname a span", // 视频播放页“接下来播放/相关推荐”卡片（新版结构）
  ".upname a",
  ".upname",
  ".name", // 视频播放页旧版结构（兜底，放最后）
];
// 作者链接兜底：视频卡片里指向用户空间的链接通常承载 UP 名
const UP_NAME_SPACE_LINK_SELECTOR = 'a[href*="space.bilibili.com"]';

// 用于不同页面视频标题选择器
const VIDEO_TITLE_SELECTORS = [
  ".bili-video-card__info--tit", // 主页
  ".bili-video-card__title", // 分类页面 -> span title
  ".title", // 视频播放页
  ".video-title", // 视频播放页新版标题类
];
// 标题兜底：卡片内指向 /video/ 的链接文本
const VIDEO_TITLE_LINK_SELECTOR = 'a[href*="/video/"]';

// 屏蔽类型对应的原因文案
const BLOCK_REASON_MAP = {
  info: "标题/UP主名",
  ad: "广告",
  tname: "分类标签",
  videoTag: "视频标签",
  cm: "软广",
  vertical: "竖屏视频",
};

// info 类型中“正则匹配”的原因标记（区别于精确匹配 UP 名）。
// 正则可能同时命中多条规则、无法定位具体是哪一条，因此不支持本卡放行，
// 用这个哨兵值让按钮只展示原因、不可点击。
const REGEX_BLOCK_VALUE = "__regex__";

/**
 * 获取视频卡片上容器应挂载的宿主元素，并确保宿主可被绝对定位。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {HTMLElement} 容器宿主元素。
 */
function getBlockContainerHost(cardElement) {
  // 视频播放页面的视频卡片结构特殊，需要调整位置
  if (isCurrentPageVideo()) {
    const cardBox = cardElement.querySelector(".card-box");
    if (cardBox) {
      cardBox.style.position = "relative";
      cardBox.classList.add("bilibili-blacklist-block-container-host");
      return cardBox;
    }
  } else if (isCurrentPageCategory()) {
    // 分类页面的视频卡片结构特殊，需要调整位置
    const biliVideoCard = cardElement.querySelector(".bili-video-card");
    if (biliVideoCard) {
      biliVideoCard.classList.add("bilibili-blacklist-block-container-host");
      return biliVideoCard;
    }
  } else if (isCurrentPageDynamic()) {
    // 动态页：把容器挂在动态里的视频卡上（图文动态没有视频卡，则退回整个动态条目）
    const dynCard = cardElement.querySelector(".bili-dyn-card-video");
    if (dynCard) {
      const dynStyle = getComputedStyle(dynCard);
      if (dynStyle.position === "static" || !dynStyle.position) {
        dynCard.style.position = "relative";
      }
      dynCard.classList.add("bilibili-blacklist-block-container-host");
      return dynCard;
    }
  }
  // 默认宿主：确保可被绝对定位的子元素正常显示
  const hostStyle = getComputedStyle(cardElement);
  if (hostStyle.position === "static" || !hostStyle.position) {
    cardElement.style.position = "relative";
  }
  cardElement.classList.add("bilibili-blacklist-block-container-host");
  return cardElement;
}

/**
 * 确保视频卡片上存在屏蔽容器，不存在则创建（用于广告等未走扫描流程的卡片）。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {HTMLElement} 已存在的或新创建的容器元素。
 */
function ensureBlockContainerOnCard(cardElement) {
  const existing = cardElement.querySelector(
    ".bilibili-blacklist-block-container"
  );
  if (existing) return existing;
  const container = document.createElement("div");
  container.classList.add("bilibili-blacklist-block-container");
  const host = getBlockContainerHost(cardElement);
  host.appendChild(container);
  return container;
}

/**
 * 为视频卡片添加屏蔽按钮容器。
 * @param {string} upName - UP主名称。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {HTMLElement} 创建的容器元素。
 */
function addBlockContainerToCard(upName, cardElement) {
  const container = ensureBlockContainerOnCard(cardElement);
  if (!container.querySelector(".bilibili-blacklist-block-btn")) {
    const blockButton = createBlockUpButton(upName);
    container.appendChild(blockButton);
  }
  return container;
}

/**
 * 给一张卡片应用“未处理”filter 遮盖（模糊 2px + 灰度 20%）。
 * 只修改卡片元素的 style.filter，不插入任何按钮/遮罩子元素 —— 避免与 B 站 header
 * 的 Vue 渲染竞争。记录到 pendingFilterCards（WeakSet），判定完成后由 clearPendingFilter 清除。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
function applyPendingFilter(cardElement) {
  if (!cardElement) return;
  const real = getRealVideoCardElement(cardElement);
  if (!real) return;
  if (pendingFilterCards.has(real)) return; // 已遮盖，避免重复
  pendingFilterCards.add(real);
  real.style.filter = PENDING_FILTER_STYLE;
}

/**
 * 清除一张卡片的“未处理”filter 遮盖，恢复原样。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
function clearPendingFilter(cardElement) {
  if (!cardElement) return;
  const real = getRealVideoCardElement(cardElement);
  if (!real) return;
  pendingFilterCards.delete(real);
  real.style.filter = "";
}

/**
 * 把当前页面已渲染的所有视频卡片标记为“未处理”（应用 filter 遮盖）。
 * 用于视频页进入时：立即遮住推荐卡片，但不启动观察器/不判定，规避 header 渲染竞争。
 */
function markAllVideoCardsPending() {
  const cards = queryAllVideoCards();
  if (!cards) return;
  cards.forEach((card) => applyPendingFilter(card));
}

/**
 * 隐藏给定的视频卡片。
 * @param {HTMLElement} cardElement - 要隐藏的视频卡片元素。
 * @param {string} type - 隐藏类型，默认为"none"。
 * @returns {void}
 *
 */
/**
 * 计算某屏蔽类型最终使用的显示模式（支持按类型覆盖全局）。
 * @param {string} type - 屏蔽类型：info/ad/tname/cm/vertical
 * @returns {string} blur | kirby | hide
 */
function getEffectiveDisplayMode(type) {
  const perTypeMap = {
    info: globalPluginConfig.displayModeInfo,
    ad: globalPluginConfig.displayModeAD,
    tname: globalPluginConfig.displayModeTName,
    videoTag: globalPluginConfig.displayModeVideoTag,
    cm: globalPluginConfig.displayModeCM,
    vertical: globalPluginConfig.displayModeVertical,
  };
  const per = perTypeMap[type];
  if (per && per !== "inherit") return per;
  return globalPluginConfig.blockDisplayMode;
}

function hideVideoCard(cardElement, type = "none", reasonValue = null) {
  const realCardToBlock = getRealVideoCardElement(cardElement);
  if (!realCardToBlock) {
    console.warn(
      "[🫥BlackList] hideVideoCard: realCardToBlock is null"
    );
    return;
  }
  // 解析具体屏蔽内容：未显式传入时按类型从卡片上推导（用于展示/取消）
  if (reasonValue == null) {
    if (type === "info") {
      reasonValue = getVideoCardInfo(cardElement).upName;
    } else if (type === "tname") {
      reasonValue = getBlacklistedTagName(cardElement);
    }
  }
  if (blockedVideoCards.has(realCardToBlock)) {
    return;
  }
  blockedVideoCards.add(realCardToBlock);
  if (type === "info") {
    countBlockInfo++;
  }
  if (type === "ad") {
    countBlockAD++;
  }
  if (type === "tname") {
    countBlockTName++;
  }
  if (type === "videoTag") {
    countBlockVideoTag++;
  }
  if (type === "cm") {
    countBlockCM++;
  }
  if (type === "vertical") {
    countBlockVertical++;
  }

  const mode = getEffectiveDisplayMode(type);
  // 记录屏蔽类型：翻页复用节点等场景下需要撤销屏蔽时，据此回退对应计数
  if (BLOCK_REASON_MAP[type]) {
    realCardToBlock.setAttribute("data-bl-block-type", type);
  }
  if (mode === "hide") {
    realCardToBlock.style.display = "none";
    realCardToBlock.style.visibility = "";
  } else {
    realCardToBlock.style.display = "block";
    realCardToBlock.style.visibility = "visible"; // 立即隐藏阶段用的是 visibility，需恢复显示遮罩
    addDisplayOverlayToCard(cardElement, mode);
  }

  setBlockReasonOnCard(cardElement, type, reasonValue);
}

/**
 * 生成卡片屏蔽原因的显示文案（要求：屏蔽原因按钮显示具体的屏蔽内容）。
 * - info 精确匹配：显示具体 UP 名；
 * - info 正则匹配：无法定位具体规则，写明原因（不支持取消）；
 * - tname：显示具体标签名；
 * - videoTag：显示具体视频标签名；
 * - 其余（cm/竖屏/广告）：显示类型文案（不支持取消）。
 * @param {string} type - 屏蔽类型。
 * @param {string|null} reasonValue - 具体内容（UP 名 / 标签名 / REGEX_BLOCK_VALUE）。
 * @returns {string}
 */
function buildBlockReasonText(type, reasonValue) {
  if (type === "info" && reasonValue === REGEX_BLOCK_VALUE) {
    return "屏蔽原因: 正则匹配(无法定位具体规则,请在面板移除对应正则)";
  }
  if (type === "info" && reasonValue) {
    return `屏蔽原因: UP: ${reasonValue}`;
  }
  if (type === "info") {
    return "屏蔽原因: 标题/UP主名";
  }
  if (type === "tname" && reasonValue) {
    return `屏蔽原因: 标签: ${reasonValue}`;
  }
  if (type === "tname") {
    return "屏蔽原因: 分类标签";
  }
  if (type === "videoTag" && reasonValue) {
    return `屏蔽原因: 视频标签: ${reasonValue}`;
  }
  if (type === "videoTag") {
    return "屏蔽原因: 视频标签";
  }
  return `屏蔽原因: ${BLOCK_REASON_MAP[type] || type}`;
}

/**
 * 该原因是否支持“点击取消”（= 存在可删除的黑名单规则）。
 * 只支持 info 精确匹配、tname 与 videoTag：点取消会把对应规则从黑名单删除；
 * 正则无法定位具体规则，cm/竖屏/广告没有可删除的规则。
 * @param {string} type - 屏蔽类型。
 * @param {string|null} reasonValue - 具体内容。
 * @returns {boolean}
 */
function isReasonCancellable(type, reasonValue) {
  if (type === "info") {
    return !!reasonValue && reasonValue !== REGEX_BLOCK_VALUE;
  }
  if (type === "tname") {
    return !!reasonValue;
  }
  if (type === "videoTag") {
    return !!reasonValue;
  }
  return false;
}

/**
 * 取消某张卡片当前显示的屏蔽原因（仅支持 info 精确匹配 / tname / videoTag）：
 *   1. 把对应规则从黑名单中删除（精确 UP 名从 exactMatchBlacklist、标签从
 *      tagNameBlacklist 移除）并持久化 —— 这就是“取消屏蔽”本身；
 *   2. 只刷新这一张卡片：恢复显示、重新入队做完整判定 —— 若还有其它屏蔽原因
 *      （其它 UP 名规则 / 正则 / 其它标签 / 软广 / 竖屏 / 广告）会继续屏蔽并刷新为新原因，
 *      没有则保持显示。
 * @param {HTMLElement} card - 视频卡片元素。
 * @param {string} type - 屏蔽类型（info/tname）。
 * @param {string} value - 具体内容（UP 名 / 标签名）。
 */
function cancelCardBlockReason(card, type, value) {
  if (!card || !value) return;
  if (type === "info") {
    const idx = findExactBlacklistIndex(value);
    if (idx === -1) return; // 规则已不存在，无需处理
    exactMatchBlacklist.splice(idx, 1);
    saveBlacklistsToStorage();
    refreshExactMatchList();
  } else if (type === "tname") {
    const idx = tagNameBlacklist.indexOf(value);
    if (idx === -1) return;
    tagNameBlacklist.splice(idx, 1);
    saveBlacklistsToStorage();
    refreshTagNameList();
  } else if (type === "videoTag") {
    const idx = videoTagBlacklist.indexOf(value);
    if (idx === -1) return;
    videoTagBlacklist.splice(idx, 1);
    saveBlacklistsToStorage();
    refreshVideoTagList();
  } else {
    return; // 正则/cm/竖屏/广告 不支持
  }

  // 只刷新该卡片：恢复显示 + 重新入队完整判定。
  // 判定期间用 pending 模糊作为“重新检查中”的视觉反馈。
  clearPendingFilter(card);
  const realCard = getRealVideoCardElement(card);
  unmarkBlockedCard(realCard);
  removeBlockReason(card);
  removeKirbyOverlay(card);
  if (realCard) {
    realCard.style.display = "block";
    realCard.style.visibility = "visible";
  }
  if (globalPluginConfig.flagHideOnLoad && !isShowAllVideos) {
    applyPendingFilter(card);
  }
  processedVideoCards.delete(realCard || card);
  videoCardProcessQueue.add(card);
  if (!isVideoCardQueueProcessing) {
    processVideoCardQueue();
  }
  refreshBlockCountDisplay();
}

/**
 * 在卡片的屏蔽按钮容器中设置屏蔽原因。
 * 支持“一键取消”的原因（info 精确 / tname / videoTag）渲染为可点击的取消按钮，
 * 并展示具体屏蔽内容（UP 名 / 标签名）；其余类型仅展示原因文案。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @param {string} type - 屏蔽类型。
 * @param {string|null} reasonValue - 具体内容（UP 名 / 标签名 / REGEX_BLOCK_VALUE）。
 */
function setBlockReasonOnCard(cardElement, type, reasonValue = null) {
  // 广告等卡片未经过 scanAndBlockVideoCards 流程，可能不存在容器，需确保创建。
  // 播放页广告位的 DOM 结构与视频卡片完全不同（没有 .card-box，且常依赖自身定位/浮动布局），
  // 走 ads.js 里独立的 ensureAdBlockContainer()，避免 getBlockContainerHost 的卡片专用分支。
  const isVideoPageAd = type === "ad" && isCurrentPageVideo();
  const container = isVideoPageAd
    ? ensureAdBlockContainer(cardElement)
    : ensureBlockContainerOnCard(cardElement);
  if (!container) return;
  container.classList.add("is-blocked"); // 有屏蔽原因 → 隐藏“屏蔽”按钮，只显示原因
  let reasonElement = container.querySelector(
    ".bilibili-blacklist-block-reason"
  );
  if (!reasonElement) {
    reasonElement = document.createElement("span");
    reasonElement.className = "bilibili-blacklist-block-reason";
    // 位于"屏蔽"按钮之后、标签组之前
    const tnameGroup = container.querySelector(
      ".bilibili-blacklist-tname-group"
    );
    if (tnameGroup) {
      container.insertBefore(reasonElement, tnameGroup);
    } else {
      container.appendChild(reasonElement);
    }
  }
  const cancellable = isReasonCancellable(type, reasonValue);
  reasonElement.textContent = buildBlockReasonText(type, reasonValue);
  reasonElement.classList.toggle("is-cancellable", cancellable);
  reasonElement.title = cancellable
    ? "点击取消本卡屏蔽(仅当前视频,不影响黑名单规则)"
    : "";
  if (cancellable) {
    reasonElement.dataset.blockType = type;
    reasonElement.dataset.blockValue = reasonValue || "";
  } else {
    delete reasonElement.dataset.blockType;
    delete reasonElement.dataset.blockValue;
  }
}

/**
 * 移除卡片上的屏蔽原因显示。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
function removeBlockReason(cardElement) {
  const container = cardElement.querySelector(
    ".bilibili-blacklist-block-container"
  );
  if (!container) return;
  container.classList.remove("is-blocked");
  const reasonElement = container.querySelector(
    ".bilibili-blacklist-block-reason"
  );
  if (reasonElement) {
    reasonElement.remove();
  }
}

/**
 * 回退某个屏蔽类型的计数（撤销屏蔽时使用，避免面板上的
 * “总数 = 各类型之和”对不上）。
 * @param {string} type - 屏蔽类型。
 */
function decrementBlockCounter(type) {
  if (type === "info" && countBlockInfo > 0) countBlockInfo--;
  else if (type === "ad" && countBlockAD > 0) countBlockAD--;
  else if (type === "tname" && countBlockTName > 0) countBlockTName--;
  else if (type === "videoTag" && countBlockVideoTag > 0) countBlockVideoTag--;
  else if (type === "cm" && countBlockCM > 0) countBlockCM--;
  else if (type === "vertical" && countBlockVertical > 0) countBlockVertical--;
}

/**
 * 把一张卡片从“已屏蔽”集合中撤销，并回退对应计数。
 * @param {HTMLElement} realCard - getRealVideoCardElement 得到的真实卡片元素。
 */
function unmarkBlockedCard(realCard) {
  if (!realCard) return;
  if (blockedVideoCards.has(realCard)) {
    blockedVideoCards.delete(realCard);
    decrementBlockCounter(realCard.getAttribute("data-bl-block-type"));
  }
  realCard.removeAttribute("data-bl-block-type");
}

/**
 * 清理已经从文档移除的“已屏蔽卡片”记录。
 *
 * blockedVideoCards 是强引用 Set（需要遍历，故不能用 WeakSet）：经过搜索页翻页/切集、
 * 主页无限滚动后，被 B 站移除的节点会一直留在这里 —— 既占内存，又会让“取消/恢复屏蔽”
 * 去操作早已不在文档里的节点（fadeInKirbyOverlay 里的同步布局白做一遍）。
 * 这里顺手调用 unmarkBlockedCard 回退对应计数，保持“总数 = 各类型之和”的显示口径。
 */
function pruneDisconnectedBlockedCards() {
  if (blockedVideoCards.size === 0) return;
  let stale = null;
  blockedVideoCards.forEach((card) => {
    if (!card || card.isConnected === false) {
      if (!stale) stale = [];
      stale.push(card);
    }
  });
  if (!stale) return;
  stale.forEach((card) => unmarkBlockedCard(card));
}

/**
 * 清除一张卡片上由本脚本添加的全部装饰与屏蔽状态，使其可以被重新判定。
 *
 * 用于搜索页翻页：B 站可能复用同一批卡片节点只替换内容，此时节点上会残留上一页的
 * 屏蔽按钮（带旧 UP 名）、分类标签按钮（旧标签，会导致 tname 误判）、卡比遮罩与
 * 隐藏样式。逐张重置后再走一次正常扫描，等价于“这批卡片是全新的”。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
function resetCardDecorations(cardElement) {
  if (!cardElement) return;
  const container = cardElement.querySelector(
    ".bilibili-blacklist-block-container"
  );
  if (container) container.remove(); // 同时带走屏蔽按钮与分类标签组
  removeKirbyOverlay(cardElement);
  clearPendingFilter(cardElement);
  const realCard = getRealVideoCardElement(cardElement);
  if (realCard) {
    unmarkBlockedCard(realCard);
    realCard.style.display = "";
    realCard.style.visibility = "";
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
  // 分类页：卡片根节点是外层 .feed-card，但观察器与“屏蔽容器宿主”会拿到内层的
  // .bili-video-card（插件自己插入的容器就在内层）。若不向上归一，同一张视频会被当成
  // 两个不同元素：pending 滤镜叠加两层、队列里出现两条记录、屏蔽计数翻倍；而且“解除模糊”
  // 必须等后一条记录提交才可见（那批是缓存命中、无限速，整批同帧提交）——表现为整批卡片
  // 一起变清晰，而不是逐张。
  if (isCurrentPageCategory()) {
    const outerCard = cardElement.closest && cardElement.closest(".feed-card");
    if (outerCard) return outerCard;
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
  } else if (isCurrentPageDynamic()) {
    // 动态页：以"整条动态"为屏蔽单位（含转发/图文动态；其中的视频卡只是它的一部分）
    return document.querySelectorAll(".bili-dyn-list__item");
  } else if (isCurrentPageRanking()) {
    return document.querySelectorAll(RANKING_CARD_SELECTOR);
  }
  return null;
}

/**
 * 扫描并处理视频卡片进行屏蔽。
 */
  /**
 * 处理单张卡片：加「屏蔽」按钮、立即隐藏/遮挡、压入队列（后续走 API 判断）。
 * @param {HTMLElement} card - 视频卡片元素。
 */
function processCard(card) {
  if (!card) return;
  const realCard = getRealVideoCardElement(card) || card;
  // 同一张视频卡片可能以不同元素（外层 .feed-card / 内层 .bili-video-card）被观察到多次：
  // 统一按“真实卡片元素”去重，保证一张视频只入队、只判定、只提交一次。
  if (processedVideoCards.has(realCard) || queuedRealCards.has(realCard)) {
    return;
  }

  // --- 未处理阶段：先用 CSS filter 遮盖（模糊2px+灰度20%）---
  // 不往卡片插入按钮/kirby 遮罩子元素、不改 visibility，避免与 B 站 header 的 Vue 渲染竞争
  // 卡片先处于“未处理”状态，待队列判定后再提交：
  //   命中 → hideVideoCard（正式遮蔽）+ clearPendingFilter；未命中 → clearPendingFilter（去 filter 恢复）。
  if (globalPluginConfig.flagHideOnLoad && !isShowAllVideos && realCard) {
    applyPendingFilter(card);
  }

  const { upName, videoTitle } = getVideoCardInfo(card);
  // 只要解析到 UP 主名称就添加“屏蔽”按钮（按钮按 UP 名屏蔽，不需要标题；
  // 有些卡片标题解析失败但仍可通过 UP 名手动屏蔽，避免“按钮缺失导致无法屏蔽”）。
  // 视频页 header 正常后才由 scanAndBlockVideoCards 触发，此时插入按钮不再干扰 header。
  if (upName && realCard) {
    addBlockContainerToCard(upName, card);
  }

  // 将卡片添加到处理队列（队列仍以“原始卡片元素”处理，保持各提取函数的行为不变；
  // 去重则统一走真实卡片元素）
  queuedRealCards.add(realCard);
  videoCardProcessQueue.add(card);
}

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

    videoCards.forEach(processCard);

    // 如果队列中有待处理的卡片且当前未在处理中，则开始处理队列
    if (videoCardProcessQueue.size > 0 && !isVideoCardQueueProcessing) {
      processVideoCardQueue();
    }

    // 刷新屏蔽计数显示（先清掉已从文档移除的卡片记录，计数才与页面一致）
    pruneDisconnectedBlockedCards();
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
    // 屏蔽后把可见卡片的垂直间距规整为 B 站默认（首行顶部 0、第二行 24px），
    // 避免隐藏卡片后剩余卡片的 top 不对齐（旧版修复；当前主页该容器仍存在）。
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (
        child.style.display !== "none" &&
        child.style.visibility !== "hidden"
      ) {
        if (visibleIndex <= 6) {
          // 只在值真的变化时写样式：这段代码每次扫描都会跑，无谓的 style 写入会触发布局
          if (child.style.marginTop !== "0px") child.style.marginTop = "0px";
        } else if (visibleIndex < 12) {
          if (child.style.marginTop !== "24px") child.style.marginTop = "24px";
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
  pruneDisconnectedBlockedCards(); // 只对仍存在的卡片做显隐/遮罩切换
  blockedVideoCards.forEach((card) => {
    const overlay = card.querySelector("#bilibili-blacklist-kirby");
    if (overlay) {
      if (isShowAllVideos) {
        overlay.style.display = "none";
      } else {
        fadeInKirbyOverlay(overlay);
      }
      card.style.display = "block";
      card.style.visibility = "visible";
    } else {
      card.style.display = isShowAllVideos ? "block" : "none";
      card.style.visibility = isShowAllVideos ? "visible" : "";
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
  // 动态页（t.bilibili.com）：卡片是"整条动态"，发布者在 .bili-dyn-title__text、
  // 视频标题在 .bili-dyn-card-video__title。这里必须单独处理：动态里还混着直播用户、
  // 话题等多个 .name，走下面的通用选择器会取错人。
  if (isCurrentPageDynamic()) {
    const dynNameElement = cardElement.querySelector(".bili-dyn-title__text");
    const upName = dynNameElement ? dynNameElement.textContent.trim() : "";
    // 只认明确的视频标题；图文/转发动态没有它 → 留空（宁可不判标题，也不拿"时长+播放量"
    // 这类混合文本去跑正则，避免误伤）。
    let videoTitle = "";
    const dynVideoTitle = cardElement.querySelector(".bili-dyn-card-video__title");
    if (dynVideoTitle) videoTitle = dynVideoTitle.textContent.trim();
    return { upName, videoTitle };
  }

  let upName = "";
  let videoTitle = "";

  // UP主名称：优先具体作者选择器；未取到再用“指向用户空间的链接”兜底
  const upNameElements = cardElement.querySelectorAll(
    UP_NAME_SELECTORS.join(", ")
  );
  if (upNameElements.length > 0) {
    upName = upNameElements[0].textContent.trim();
  }
  if (!upName) {
    const spaceLinks = cardElement.querySelectorAll(UP_NAME_SPACE_LINK_SELECTOR);
    for (const a of spaceLinks) {
      const t = (a.textContent || "").trim();
      if (t) {
        upName = t;
        break;
      }
    }
  }
  if (isCurrentPageCategory()) {
    // 分类页面的UP主名称可能包含其他信息，需要进一步处理
    upName = upName.split(" · ")[0].trim();
  }
  // 去掉误带进来的“ · 时间/日期”后缀（如 “ · 08-23”、“ · 昨天”），
  // 保证精确匹配与“屏蔽按 UP 名”用的是干净的 UP 名。
  upName = upName.replace(/\s*·\s*(刚刚|\d{1,2}[-/]\d{1,2}(-\d{2,4})?|昨天|前天|今天|\d+小时前|\d+天前|\d+分钟前|\d+-\d+-\d+.*)$/i, "").trim();

  // 视频标题：优先标题选择器；未取到再用“指向 /video/ 的链接文本”兜底
  const titleElements = cardElement.querySelectorAll(
    VIDEO_TITLE_SELECTORS.join(", ")
  );
  if (titleElements.length > 0) {
    videoTitle = titleElements[0].textContent.trim();
  }
  if (!videoTitle) {
    const videoLinks = cardElement.querySelectorAll(VIDEO_TITLE_LINK_SELECTOR);
    for (const a of videoLinks) {
      const t = (a.textContent || "").trim();
      if (t) {
        videoTitle = t;
        break;
      }
    }
  }
  return { upName, videoTitle };
}

/**
 * 检查UP主名称是否命中精确匹配黑名单（零网络、最快，优先级最高）。
 * @param {string} upName - 要检查的UP主名称。
 * @returns {boolean}
 */
function isExactBlacklisted(upName) {
  return !!getExactBlacklistMatch(upName);
}

/**
 * 在精确匹配黑名单中查找规则下标（忽略大小写）。
 * 匹配 / 取消 / 新增 / 移除四处的比较口径统一走这里，
 * 避免出现“能匹配到但删不掉”或“同一 UP 名大小写不同被加两条规则”。
 * @param {string} upName - 要查找的UP主名称。
 * @returns {number} 命中下标；未命中返回 -1。
 */
function findExactBlacklistIndex(upName) {
  const lowerCaseUpName = String(upName == null ? "" : upName).toLowerCase();
  if (!lowerCaseUpName) return -1;
  for (let i = 0; i < exactMatchBlacklist.length; i++) {
    if (String(exactMatchBlacklist[i]).toLowerCase() === lowerCaseUpName) {
      return i;
    }
  }
  return -1;
}

/**
 * 返回与 UP 名精确匹配的黑名单条目（用于显示具体原因与生成放行 key）。
 * @param {string} upName - 要检查的UP主名称。
 * @returns {string|null}
 */
function getExactBlacklistMatch(upName) {
  const index = findExactBlacklistIndex(upName);
  return index === -1 ? null : exactMatchBlacklist[index];
}

/**
 * 检查UP主名称或标题是否命中正则黑名单（零网络，优先级次于精确匹配）。
 * 支持 /pattern/flags，默认 i；无效正则自动跳过。
 * @param {string} upName - 要检查的UP主名称。
 * @param {string} title - 要检查的视频标题。
 * @returns {boolean}
 */
function isRegexBlacklisted(upName, title) {
  const name = upName || "";
  const text = title || "";
  for (let i = 0; i < regexMatchBlacklist.length; i++) {
    const re = compileRegex(regexMatchBlacklist[i]);
    if (!re) continue;
    if (testRegex(re, name) || testRegex(re, text)) return true;
  }
  return false;
}

/**
 * 检查UP主名称或标题是否在黑名单中（精确匹配优先，其次正则）。
 * @param {string} upName - 要检查的UP主名称。
 * @param {string} title - 要检查的视频标题。
 * @returns {boolean} 如果在黑名单中则返回true，否则返回false。
 */
function isBlacklisted(upName, title) {
  return isExactBlacklisted(upName) || isRegexBlacklisted(upName, title);
}

/**
 * 用编译后的正则测试文本；先重置 lastIndex，避免 g/y 状态残留。
 * @param {RegExp} re
 * @param {string} text
 * @returns {boolean}
 */
function testRegex(re, text) {
  re.lastIndex = 0;
  return re.test(text);
}

/**
 * 将UP主名称添加到精确匹配黑名单并刷新。
 * @param {string} upName - 要添加的UP主名称。
 * @param {HTMLElement} [cardElement=null] - 添加后要隐藏的视频卡片元素。
 */
function addToExactBlacklist(upName, cardElement = null) {
  try {
    if (!upName) return;
    if (findExactBlacklistIndex(upName) === -1) {
      exactMatchBlacklist.push(upName);
      saveBlacklistsToStorage();
      refreshAllPanelTabs();
      if (cardElement) {
        hideVideoCard(cardElement, "info");
      }
      hideAllCardsByUpName(upName);
    }
  } catch (e) {
    console.error("[🫥BlackList] 添加黑名单出错:", e);
  }
}

/**
 * 从精确匹配黑名单中移除UP主名称。
 * @param {string} upName - 要移除的UP主名称。
 */
function removeFromExactBlacklist(upName) {
  try {
    const index = findExactBlacklistIndex(upName);
    if (index !== -1) {
      exactMatchBlacklist.splice(index, 1);
      saveBlacklistsToStorage();
      refreshExactMatchList();
    }
  } catch (e) {
    console.error("[🫥BlackList] 移除黑名单出错:", e);
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
        hideVideoCard(cardElement, "tname");
      }
      hideAllCardsByTagName();
    }
  } catch (e) {
    console.error("[🫥BlackList] 添加标签黑名单出错:", e);
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
    console.error("[🫥BlackList] 移除标签黑名单出错:", e);
  }
}

/**
 * 将视频标签添加到黑名单并刷新。
 * @param {string} tagName - 要添加的视频标签名。
 * @param {HTMLElement} [cardElement=null] - 添加后要隐藏的视频卡片元素。
 */
function addToVideoTagBlacklist(tagName, cardElement = null) {
  try {
    const normalizedTagName = String(tagName || "").trim();
    if (!normalizedTagName || videoTagBlacklist.includes(normalizedTagName)) {
      return;
    }
    videoTagBlacklist.push(normalizedTagName);
    saveBlacklistsToStorage();
    refreshAllPanelTabs();
    if (cardElement) {
      hideVideoCard(cardElement, "videoTag", normalizedTagName);
    }
    hideAllCardsByVideoTag(normalizedTagName);
  } catch (e) {
    console.error("[🫥BlackList] 添加视频标签黑名单出错:", e);
  }
}

/**
 * 从视频标签黑名单中移除标签名。
 * @param {string} tagName - 要移除的视频标签名。
 */
function removeFromVideoTagBlacklist(tagName) {
  try {
    const index = videoTagBlacklist.indexOf(tagName);
    if (index === -1) return;
    videoTagBlacklist.splice(index, 1);
    saveBlacklistsToStorage();
    refreshVideoTagList();
  } catch (e) {
    console.error("[🫥BlackList] 移除视频标签黑名单出错:", e);
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
 * 隐藏所有命中分类标签规则的视频卡片（不限于某一具体标签：与 hideAllCardsByUpName 口径一致）。
 */
function hideAllCardsByTagName() {
  const videoCards = queryAllVideoCards();
  if (!videoCards) return;
  videoCards.forEach(card => {
    if (isCardBlacklistedByTagName(card)) {
      hideVideoCard(card, "tname");
    }
  });
}

/**
 * 隐藏所有匹配指定视频标签的视频卡片。
 * @param {string} tagName - 要匹配的视频标签名。
 */
function hideAllCardsByVideoTag(tagName) {
  const videoCards = queryAllVideoCards();
  if (!videoCards) return;
  videoCards.forEach((card) => {
    const matchedTag = getBlacklistedVideoTag(card);
    if (matchedTag === tagName) {
      hideVideoCard(card, "videoTag", matchedTag);
    }
  });
}
