// ==UserScript==
// @name        Bilibili-BlackList
// @namespace   https://github.com/HeavenTTT/bilibili-blacklist
// @version     2.0.0
// @author      HeavenTTT
// @description Bilibili UP屏蔽插件 - 屏蔽UP主视频卡片，支持精确匹配和正则匹配，支持视频页面、分类页面、搜索页面等。
// @match       *://*.bilibili.com/*
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       unsafeWindow
// @icon        https://www.bilibili.com/favicon.ico
// @license     MIT
// @noframes
// @run-at      document-idle
// @downloadURL https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.user.js
// @updateURL   https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.meta.js
// ==/UserScript==

(function () {
  "use strict";

let exactMatchBlacklist = GM_getValue("exactBlacklist", [
  "绝区零",
  "崩坏星穹铁道",
  "崩坏3",
  "原神",
  "米哈游miHoYo",
]);
let regexMatchBlacklist = GM_getValue("regexBlacklist", [
  "王者荣耀",
  "和平精英",
  "PUBG",
  "绝地求生",
  "吃鸡",
]);
let tagNameBlacklist = GM_getValue("tNameBlacklist", []);
let videoTagBlacklist = GM_getValue("videoTagBlacklist", []);


const defaultGlobalPluginConfig = {
  flagInfo: true,
  flagAD: true,
  flagTName: true,
  flagVideoTag: true,
  flagAlwaysFetchTName: true,
  flagCM: true,
  blockDisplayMode: "kirby",
  displayModeInfo: "inherit",
  displayModeAD: "inherit",
  displayModeTName: "inherit",
  displayModeVideoTag: "inherit",
  displayModeCM: "inherit",
  displayModeVertical: "inherit",
  flagHeaderButton: true,
  flagNetworkIntercept: false,
  flagHoverReveal: false,
  hoverRevealDelaySeconds: 1,
  processQueueInterval: 200,
  blockScanInterval: 200,
  flagHideOnLoad: true,
  flagVertical: true,
  verticalScaleThreshold: 0.7,
  flagSkipBlockedAutoplay: "off",
};
let globalPluginConfig = {
  ...defaultGlobalPluginConfig,
  ...(GM_getValue("globalConfig", {}) || {}),
};

const storedHoverRevealDelay = Number(
  globalPluginConfig.hoverRevealDelaySeconds
);
globalPluginConfig.hoverRevealDelaySeconds = Number.isFinite(
  storedHoverRevealDelay
)
  ? Math.min(5, Math.max(0.1, storedHoverRevealDelay))
  : defaultGlobalPluginConfig.hoverRevealDelaySeconds;

const AUTOPLAY_SKIP_MODES = ["skip", "stop", "off"];
if (!AUTOPLAY_SKIP_MODES.includes(globalPluginConfig.flagSkipBlockedAutoplay)) {
  globalPluginConfig.flagSkipBlockedAutoplay =
    defaultGlobalPluginConfig.flagSkipBlockedAutoplay;
}

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
};
globalPluginConfig.blockScanInterval = clampNumber(
  globalPluginConfig.blockScanInterval,
  10,
  5000,
  defaultGlobalPluginConfig.blockScanInterval
);
globalPluginConfig.processQueueInterval = clampNumber(
  globalPluginConfig.processQueueInterval,
  5,
  10000,
  defaultGlobalPluginConfig.processQueueInterval
);
globalPluginConfig.verticalScaleThreshold = clampNumber(
  globalPluginConfig.verticalScaleThreshold,
  0.1,
  1,
  defaultGlobalPluginConfig.verticalScaleThreshold
);

if (
  globalPluginConfig.blockDisplayMode === undefined &&
  typeof globalPluginConfig.flagKirby === "boolean"
) {
  globalPluginConfig.blockDisplayMode = globalPluginConfig.flagKirby ? "kirby" : "hide";
}
const DISPLAY_MODES = ["blur", "kirby", "hide"];
if (!DISPLAY_MODES.includes(globalPluginConfig.blockDisplayMode)) {
  globalPluginConfig.blockDisplayMode = defaultGlobalPluginConfig.blockDisplayMode;
}
const PER_TYPE_DISPLAY_KEYS = [
  "displayModeInfo",
  "displayModeAD",
  "displayModeTName",
  "displayModeVideoTag",
  "displayModeCM",
  "displayModeVertical",
];
for (const key of PER_TYPE_DISPLAY_KEYS) {
  if (!["inherit"].concat(DISPLAY_MODES).includes(globalPluginConfig[key])) {
    globalPluginConfig[key] = "inherit";
  }
}

function saveBlacklistsToStorage() {
  GM_setValue("exactBlacklist", exactMatchBlacklist);
  GM_setValue("regexBlacklist", regexMatchBlacklist);
  GM_setValue("tNameBlacklist", tagNameBlacklist);
  GM_setValue("videoTagBlacklist", videoTagBlacklist);
}

function saveGlobalConfigToStorage() {
  GM_setValue("globalConfig", globalPluginConfig);
}

let tagNameList = GM_getValue("tagNameList", []);
let tagListLastTime = GM_getValue("tLastTime", 0);
let tagFeedLastTime = GM_getValue("tFeedLastTime", 0);
function saveTagNameListWithTimestamp() {
  GM_setValue("tagNameList", tagNameList);
  GM_setValue("tLastTime", Date.now());
}
function saveTagNameListOnly() {
  GM_setValue("tagNameList", tagNameList);
}

function getTagNameById(id) {
  if (id === null || id === undefined) return null;
  const entry = tagNameList.find(entry => entry.id == id);
  return entry ? { name: entry.name, name_v2: entry.name_v2 } : null;
}
function getTagNameByV2(name_v2) {
  if (name_v2 === null || name_v2 === undefined) return null;
  const entry = tagNameList.find(entry => entry.name_v2 == name_v2);
  return entry ? entry.name: null;
}
const REGEX_FLAGS_ALLOWED = "dgimsuvy";
const regexCache = new Map();

function parseRegexEntry(entry) {
  entry = String(entry == null ? "" : entry).trim();
  if (!entry) return null;
  if (entry.charAt(0) === "/") {
    const lastSlash = entry.lastIndexOf("/");
    if (lastSlash <= 0) return null;
    const pattern = entry.slice(1, lastSlash);
    let flags = entry.slice(lastSlash + 1).trim();
    if (flags.length === 0) flags = "i";
    for (let i = 0; i < flags.length; i++) {
      if (REGEX_FLAGS_ALLOWED.indexOf(flags.charAt(i)) === -1) return null;
    }
    return { pattern: pattern, flags: flags };
  }
  return { pattern: entry, flags: "i" };
}

function compileRegex(entry) {
  if (regexCache.has(entry)) return regexCache.get(entry);
  let re = null;
  const parsed = parseRegexEntry(entry);
  if (parsed) {
    try {
      re = new RegExp(parsed.pattern, parsed.flags);
    } catch (e) {
      console.warn("[🫥BlackList] 无效正则表达式，已跳过:", entry, e.message);
      re = null;
    }
  }
  regexCache.set(entry, re);
  return re;
}

function invalidateRegexCache() {
  regexCache.clear();
}

const TNAME_LIST_UPDATE_INTERVAL = 12 * 60 * 60 * 1000;

function getTNameListFromVideoPage() {
  try {
    var channelKv = unsafeWindow.__INITIAL_STATE__.channelKv;
    if (!channelKv) return [];

    var result = [];

    if (Array.isArray(channelKv)) {
      channelKv.forEach(element => {


        var subList = element.sub;
        if (Array.isArray(subList)) {
          subList.forEach(subelement => {
            if (element.channelId && element.name && subelement.tid && subelement.name) {
              result.push({ id: subelement.tid, name: element.name, name_v2: subelement.name });
            }
          });
        }
      });
    }
    return result;
  } catch (e) {
    console.error('[🫥BlackList] 获取频道数据失败:', e);
    return [];
  }
}

function mergeTNameListItems(newList) {
  const existingMap = new Map();
  tagNameList.forEach(item => existingMap.set(String(item.id), item));

  let updated = 0;
  for (const item of newList) {
    const id = String(item.id);
    const name = item.name;
    const name_v2 = item.name_v2;
    if (!existingMap.has(id)) {
      const record = { id: item.id, name, name_v2 };
      tagNameList.push(record);
      existingMap.set(id, record);
      updated++;
    } else {
      const existing = existingMap.get(id);
      if (existing.name !== name || existing.name_v2 !== name_v2) {
        existing.name = name;
        existing.name_v2 = name_v2;
        updated++;
      }
    }
  }
  return updated;
}

function updateTNameList() {
  if (tagNameList.length >= 1000) tagNameList = [];
  if (tagNameList.length === 0) tagListLastTime = 0;

  const now = Date.now();
  if (now - tagListLastTime < TNAME_LIST_UPDATE_INTERVAL) {
    console.log('[🫥BlackList] 标签名列表最近已更新，跳过本次更新。');
    return;
  }

  const newList = getTNameListFromVideoPage();
  if (newList.length === 0) {
    console.warn('[🫥BlackList] 未能获取到新的标签名列表。');
    return;
  }

  console.log('[🫥BlackList] 获取到 ' + newList.length + ' 个标签名，开始合并更新。');

  const updated = mergeTNameListItems(newList);

  if (updated) {
    saveTagNameListWithTimestamp();
    tagListLastTime = now;
    console.log('[🫥BlackList] 分区表已更新（新增/变更 ' + updated + ' 条）并保存。');
  } else {
    console.log('[🫥BlackList] 标签名列表无变化，仅更新时间戳。');
    GM_setValue("tLastTime", now);
    tagListLastTime = now;
  }
}

async function fetchTNameListFromFeed() {
  const result = [];
  const seenIds = new Set();
  const urls = [
    "https://api.bilibili.com/x/web-interface/popular?ps=20",
    "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0",
  ];

  for (const url of urls) {
    let controller = null;
    let timer = null;
    try {
      controller =
        typeof AbortController === "function" ? new AbortController() : null;
      timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      const response = await fetch(
        url,
        controller ? { signal: controller.signal } : undefined
      );
      const json = await response.json();
      if (json.code !== 0 || !json.data || !Array.isArray(json.data.list)) {
        console.warn('[🫥BlackList] feed 接口返回异常: ' + url + ' code=' + json.code);
        continue;
      }
      for (const item of json.data.list) {
        const tidv2 = item.tidv2;
        const tnamev2 = item.tnamev2;
        if (tidv2 === undefined || tidv2 === null || !tnamev2) continue;
        if (seenIds.has(String(tidv2))) continue;
        seenIds.add(String(tidv2));
        result.push({
          id: tidv2,
          name: String(item.pid_name_v2 || tnamev2),
          name_v2: String(tnamev2),
        });
      }
    } catch (error) {
      console.error('[🫥BlackList] feed 接口请求失败: ' + url, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return result;
}

async function updateTNameListFromFeed() {
  try {
    if (tagNameList.length >= 1000) tagNameList = [];
    if (tagNameList.length === 0) tagFeedLastTime = 0;

    const now = Date.now();
    if (now - tagFeedLastTime < TNAME_LIST_UPDATE_INTERVAL) {
      return;
    }

    const newList = await fetchTNameListFromFeed();
    if (newList.length === 0) {
      console.warn('[🫥BlackList] feed 接口未返回可用的分区数据，本次不更新时间戳。');
      return;
    }

    console.log(
      '[🫥BlackList] feed 接口获取到 ' + newList.length + ' 个分区条目，开始合并更新。'
    );
    const updated = mergeTNameListItems(newList);
    if (updated) {
      saveTagNameListOnly();
      tagFeedLastTime = now;
      console.log('[🫥BlackList] feed 增量更新分区表（新增/变更 ' + updated + ' 条）并保存。');
    } else {
      GM_setValue("tFeedLastTime", now);
      tagFeedLastTime = now;
      console.log('[🫥BlackList] feed 分区表无变化，仅更新时间戳。');
    }
  } catch (error) {
    console.error('[🫥BlackList] feed 增量更新分区表失败:', error);
  }
}

let tempUnblockButton;
let managerPanel;
let exactMatchListElement;
let regexMatchListElement;
let tagNameListElement;
let videoTagListElement;
let configListElement;
let blockCountTitleElement;
let blockCountDisplayElement = null;
let blockStatsValueElements = null;
let blockTrendBarElements = null;
let isBlockStatsExpanded = false;

let isShowAllVideos = false;
let isBlockingOperationInProgress = false;
let lastBlockScanExecutionTime = 0;
let blockedVideoCards = new Set();
let processedVideoCards = new WeakSet();
let queuedRealCards = new WeakSet();
let videoCardProcessQueue = new Set();
let tnameDecorateQueue = new Set();
let isVideoCardQueueProcessing = false;
let countBlockInfo = 0;
let countBlockAD = 0;
let countBlockTName = 0;
let countBlockVideoTag = 0;
let countBlockVertical = 0;
let countBlockCM = 0;
let countProcessedCards = 0;
let countApiViewRequests = 0;
let countApiTagRequests = 0;
let countNetworkInterceptItems = 0;
let countNetworkInterceptAds = 0;
let countNetworkInterceptResponses = 0;

const pendingFilterCards = new WeakSet();

const PENDING_FILTER_STYLE = "blur(8px) grayscale(0.5) opacity(0.4)";

const UP_NAME_SELECTORS = [
  ".bili-video-card__info--author",
  ".bili-video-card__author",
  ".upname a span",
  ".upname a",
  ".upname",
  ".name",
];
const UP_NAME_SPACE_LINK_SELECTOR = 'a[href*="space.bilibili.com"]';

const VIDEO_TITLE_SELECTORS = [
  ".bili-video-card__info--tit",
  ".bili-video-card__title",
  ".title",
  ".video-title",
];
const VIDEO_TITLE_LINK_SELECTOR = 'a[href*="/video/"]';

const BLOCK_REASON_MAP = {
  info: "标题/UP主名",
  ad: "广告",
  tname: "分类标签",
  videoTag: "视频标签",
  cm: "软广",
  vertical: "竖屏视频",
};

const REGEX_BLOCK_VALUE = "__regex__";

function getBlockContainerHost(cardElement) {
  if (isCurrentPageVideo()) {
    const cardBox = cardElement.querySelector(".card-box");
    if (cardBox) {
      cardBox.style.position = "relative";
      cardBox.classList.add("bilibili-blacklist-block-container-host");
      return cardBox;
    }
  } else if (isCurrentPageCategory()) {
    const biliVideoCard = cardElement.querySelector(".bili-video-card");
    if (biliVideoCard) {
      biliVideoCard.classList.add("bilibili-blacklist-block-container-host");
      return biliVideoCard;
    }
  } else if (isCurrentPageDynamic()) {
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
  const hostStyle = getComputedStyle(cardElement);
  if (hostStyle.position === "static" || !hostStyle.position) {
    cardElement.style.position = "relative";
  }
  cardElement.classList.add("bilibili-blacklist-block-container-host");
  return cardElement;
}

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

function addBlockContainerToCard(upName, cardElement) {
  const container = ensureBlockContainerOnCard(cardElement);
  if (!container.querySelector(".bilibili-blacklist-block-btn")) {
    const blockButton = createBlockUpButton(upName);
    container.appendChild(blockButton);
  }
  return container;
}

function applyPendingFilter(cardElement) {
  if (!cardElement) return;
  const real = getRealVideoCardElement(cardElement);
  if (!real) return;
  if (pendingFilterCards.has(real)) return;
  pendingFilterCards.add(real);
  real.style.filter = PENDING_FILTER_STYLE;
}

function clearPendingFilter(cardElement) {
  if (!cardElement) return;
  const real = getRealVideoCardElement(cardElement);
  if (!real) return;
  pendingFilterCards.delete(real);
  real.style.filter = "";
}

function markAllVideoCardsPending() {
  const cards = queryAllVideoCards();
  if (!cards) return;
  cards.forEach((card) => applyPendingFilter(card));
}

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
  if (BLOCK_REASON_MAP[type]) {
    realCardToBlock.setAttribute("data-bl-block-type", type);
  }
  if (mode === "hide") {
    realCardToBlock.style.display = "none";
    realCardToBlock.style.visibility = "";
  } else {
    realCardToBlock.style.display = "block";
    realCardToBlock.style.visibility = "visible";
    addDisplayOverlayToCard(cardElement, mode);
  }

  setBlockReasonOnCard(cardElement, type, reasonValue);
}

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

function cancelCardBlockReason(card, type, value) {
  if (!card || !value) return;
  if (type === "info") {
    const idx = findExactBlacklistIndex(value);
    if (idx === -1) return;
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
    return;
  }

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

function setBlockReasonOnCard(cardElement, type, reasonValue = null) {
  const isVideoPageAd = type === "ad" && isCurrentPageVideo();
  const container = isVideoPageAd
    ? ensureAdBlockContainer(cardElement)
    : ensureBlockContainerOnCard(cardElement);
  if (!container) return;
  container.classList.add("is-blocked");
  let reasonElement = container.querySelector(
    ".bilibili-blacklist-block-reason"
  );
  if (!reasonElement) {
    reasonElement = document.createElement("span");
    reasonElement.className = "bilibili-blacklist-block-reason";
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

function decrementBlockCounter(type) {
  if (type === "info" && countBlockInfo > 0) countBlockInfo--;
  else if (type === "ad" && countBlockAD > 0) countBlockAD--;
  else if (type === "tname" && countBlockTName > 0) countBlockTName--;
  else if (type === "videoTag" && countBlockVideoTag > 0) countBlockVideoTag--;
  else if (type === "cm" && countBlockCM > 0) countBlockCM--;
  else if (type === "vertical" && countBlockVertical > 0) countBlockVertical--;
}

function unmarkBlockedCard(realCard) {
  if (!realCard) return;
  if (blockedVideoCards.has(realCard)) {
    blockedVideoCards.delete(realCard);
    decrementBlockCounter(realCard.getAttribute("data-bl-block-type"));
  }
  realCard.removeAttribute("data-bl-block-type");
}

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

function resetCardDecorations(cardElement) {
  if (!cardElement) return;
  const container = cardElement.querySelector(
    ".bilibili-blacklist-block-container"
  );
  if (container) container.remove();
  removeKirbyOverlay(cardElement);
  clearPendingFilter(cardElement);
  const realCard = getRealVideoCardElement(cardElement);
  if (realCard) {
    unmarkBlockedCard(realCard);
    realCard.style.display = "";
    realCard.style.visibility = "";
  }
}

function getRealVideoCardElement(cardElement) {
  if (isCurrentPageSearch()) {
    return cardElement.parentElement;
  }
  if (isCurrentPageMain()) {
    if (cardElement.parentElement.classList.contains("bili-feed-card")) {
      cardElement = cardElement.parentElement;
      if (cardElement.parentElement.classList.contains("feed-card")) {
        cardElement = cardElement.parentElement;
      }
    }
  }
  if (isCurrentPageCategory()) {
    const outerCard = cardElement.closest && cardElement.closest(".feed-card");
    if (outerCard) return outerCard;
  }
  return cardElement;
}

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
    return document.querySelectorAll(".bili-dyn-list__item");
  } else if (isCurrentPageRanking()) {
    return document.querySelectorAll(RANKING_CARD_SELECTOR);
  }
  return null;
}

function processCard(card) {
  if (!card) return;
  const realCard = getRealVideoCardElement(card) || card;
  if (processedVideoCards.has(realCard) || queuedRealCards.has(realCard)) {
    return;
  }

  if (globalPluginConfig.flagHideOnLoad && !isShowAllVideos && realCard) {
    applyPendingFilter(card);
  }

  const { upName, videoTitle } = getVideoCardInfo(card);
  if (upName && realCard) {
    addBlockContainerToCard(upName, card);
  }

  queuedRealCards.add(realCard);
  videoCardProcessQueue.add(card);
}

function scanAndBlockVideoCards() {
  const now = Date.now();
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

    if (videoCardProcessQueue.size > 0 && !isVideoCardQueueProcessing) {
      processVideoCardQueue();
    }

    pruneDisconnectedBlockedCards();
    refreshBlockCountDisplay();
    fixMainPageLayout();
  } finally {
    isBlockingOperationInProgress = false;
  }
}

function fixMainPageLayout() {
  if (!isCurrentPageMain()) return;
  const container = document.querySelector(
    ".recommended-container_floor-aside .container"
  );
  if (container) {
    const children = container.children;
    let visibleIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (
        child.style.display !== "none" &&
        child.style.visibility !== "hidden"
      ) {
        if (visibleIndex <= 6) {
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

function toggleShowAllBlockedVideos() {
  isShowAllVideos = !isShowAllVideos;
  pruneDisconnectedBlockedCards();
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

function getVideoCardInfo(cardElement) {
  if (isCurrentPageDynamic()) {
    const dynNameElement = cardElement.querySelector(".bili-dyn-title__text");
    const upName = dynNameElement ? dynNameElement.textContent.trim() : "";
    let videoTitle = "";
    const dynVideoTitle = cardElement.querySelector(".bili-dyn-card-video__title");
    if (dynVideoTitle) videoTitle = dynVideoTitle.textContent.trim();
    return { upName, videoTitle };
  }

  let upName = "";
  let videoTitle = "";

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
    upName = upName.split(" · ")[0].trim();
  }
  upName = upName.replace(/\s*·\s*(刚刚|\d{1,2}[-/]\d{1,2}(-\d{2,4})?|昨天|前天|今天|\d+小时前|\d+天前|\d+分钟前|\d+-\d+-\d+.*)$/i, "").trim();

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

function isExactBlacklisted(upName) {
  return !!getExactBlacklistMatch(upName);
}

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

function getExactBlacklistMatch(upName) {
  const index = findExactBlacklistIndex(upName);
  return index === -1 ? null : exactMatchBlacklist[index];
}

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

function isBlacklisted(upName, title) {
  return isExactBlacklisted(upName) || isRegexBlacklisted(upName, title);
}

function testRegex(re, text) {
  re.lastIndex = 0;
  return re.test(text);
}

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

function hideAllCardsByTagName() {
  const videoCards = queryAllVideoCards();
  if (!videoCards) return;
  videoCards.forEach(card => {
    if (isCardBlacklistedByTagName(card)) {
      hideVideoCard(card, "tname");
    }
  });
}

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

const BLOCK_STATS_STORAGE_KEY = "blockStats";
const BLOCK_STATS_KEEP_DAYS = 30;
const BLOCK_STATS_FLUSH_INTERVAL_MS = 5000;
const BLOCK_STATS_KEYS = [
  "info",
  "ad",
  "cm",
  "tname",
  "videoTag",
  "vertical",
  "netItems",
  "netAds",
  "netResponses",
  "processed",
];

let blockStatsStore = null;
let blockStatsSnapshot = {
  info: 0,
  ad: 0,
  cm: 0,
  tname: 0,
  videoTag: 0,
  vertical: 0,
  netItems: 0,
  netAds: 0,
  netResponses: 0,
  processed: 0,
};
let blockStatsFlushTimer = null;

function getBlockStatsDayKey(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getRecentBlockStatsDayKeys(days) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(
      getBlockStatsDayKey(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      )
    );
  }
  return out;
}

function readBlockStatsFromStorage() {
  if (blockStatsStore) return blockStatsStore;
  let stored = null;
  try {
    stored = GM_getValue(BLOCK_STATS_STORAGE_KEY, null);
  } catch (e) {
    stored = null;
  }
  blockStatsStore = {
    days: (stored && typeof stored.days === "object" && stored.days) || {},
    total: (stored && typeof stored.total === "object" && stored.total) || {},
  };
  return blockStatsStore;
}

function getCurrentBlockStatsValues() {
  return {
    info: countBlockInfo,
    ad: countBlockAD,
    cm: countBlockCM,
    tname: countBlockTName,
    videoTag: countBlockVideoTag,
    vertical: countBlockVertical,
    netItems: countNetworkInterceptItems,
    netAds: countNetworkInterceptAds,
    netResponses: countNetworkInterceptResponses,
    processed: countProcessedCards,
  };
}

function sumBlockStatsBlocked(bucket) {
  if (!bucket) return 0;
  return (
    (bucket.info || 0) +
    (bucket.ad || 0) +
    (bucket.cm || 0) +
    (bucket.tname || 0) +
    (bucket.videoTag || 0) +
    (bucket.vertical || 0)
  );
}

function pruneBlockStatsDays(store) {
  const keys = Object.keys(store.days).sort();
  while (keys.length > BLOCK_STATS_KEEP_DAYS) {
    delete store.days[keys.shift()];
  }
}

function flushBlockStats() {
  const store = readBlockStatsFromStorage();
  const current = getCurrentBlockStatsValues();
  const dayKey = getBlockStatsDayKey();
  const dayBucket = store.days[dayKey] || (store.days[dayKey] = {});
  let changed = false;
  BLOCK_STATS_KEYS.forEach((key) => {
    const delta = (current[key] || 0) - (blockStatsSnapshot[key] || 0);
    if (!delta) return;
    changed = true;
    dayBucket[key] = (dayBucket[key] || 0) + delta;
    store.total[key] = (store.total[key] || 0) + delta;
  });
  if (!changed) return false;
  blockStatsSnapshot = current;
  pruneBlockStatsDays(store);
  try {
    GM_setValue(BLOCK_STATS_STORAGE_KEY, store);
  } catch (e) {
    console.error("[🫥BlackList] 统计落盘失败:", e);
  }
  return true;
}

function getBlockStatsSummary() {
  flushBlockStats();
  const store = readBlockStatsFromStorage();
  const current = getCurrentBlockStatsValues();
  const pending = {};
  BLOCK_STATS_KEYS.forEach((key) => {
    pending[key] = (current[key] || 0) - (blockStatsSnapshot[key] || 0);
  });
  const bucket = (src) => {
    const out = {};
    BLOCK_STATS_KEYS.forEach((key) => {
      out[key] = (src && src[key]) || 0;
    });
    return out;
  };
  const todayKey = getBlockStatsDayKey();
  const today = bucket(store.days[todayKey]);
  BLOCK_STATS_KEYS.forEach((key) => {
    today[key] += pending[key];
  });
  const last7Keys = getRecentBlockStatsDayKeys(7);
  const last7 = bucket(null);
  last7Keys.forEach((key) => {
    const dayBucket = store.days[key] || {};
    BLOCK_STATS_KEYS.forEach((k) => {
      last7[k] += dayBucket[k] || 0;
    });
  });
  const total = bucket(store.total);
  return { today, last7, total };
}

function getBlockStatsDailySeries(days) {
  const store = readBlockStatsFromStorage();
  const todayKey = getBlockStatsDayKey();
  const now = getCurrentBlockStatsValues();
  return getRecentBlockStatsDayKeys(days).map((key) => {
    const dayBucket = store.days[key] || {};
    const isToday = key === todayKey;
    const value = (k) =>
      (dayBucket[k] || 0) + (isToday ? (now[k] || 0) - (blockStatsSnapshot[k] || 0) : 0);
    return {
      key: key,
      blocks:
        value("info") +
        value("ad") +
        value("cm") +
        value("tname") +
        value("videoTag") +
        value("vertical"),
      intercepted: value("netItems"),
    };
  });
}

function clearBlockStats() {
  flushBlockStats();
  blockStatsStore = { days: {}, total: {} };
  blockStatsSnapshot = getCurrentBlockStatsValues();
  try {
    GM_setValue(BLOCK_STATS_STORAGE_KEY, blockStatsStore);
  } catch (e) {
    console.error("[🫥BlackList] 清除统计失败:", e);
  }
}

function startBlockStatsFlusher() {
  if (blockStatsFlushTimer) return;
  blockStatsFlushTimer = setInterval(() => {
    flushBlockStats();
  }, BLOCK_STATS_FLUSH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushBlockStats();
  });
  window.addEventListener("pagehide", () => flushBlockStats());
  window.addEventListener("beforeunload", () => flushBlockStats());
}

let tnameRetriedCards = new WeakSet();
let videoTagRetriedCards = new WeakSet();
let isPageCurrentlyActive = true;
function getCardHrefLink(cardElement) {
  const hrefLink = cardElement.querySelector("a");
  if (hrefLink) {
    return hrefLink.getAttribute("href");
  }
  return null;
}

function getCardVideoBvId(cardElement) {
  const videoLink = cardElement.querySelector('a[href*="/video/"]');
  if (videoLink) return getLinkBvId(videoLink.getAttribute("href"));
  return getLinkBvId(getCardHrefLink(cardElement));
}

function checkLinkCM(link) {
  if (!link) return false;
  if (link.match(/cm.bilibili.com/) && globalPluginConfig.flagCM) {
    return true;
  }
  return false;
}
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

const bvApiDataCache = new Map();
const BV_API_CACHE_TTL = 10 * 60 * 1000;
const BV_API_TIMEOUT_MS = 5000;
const BV_API_MIN_INTERVAL_MS = 50;
let lastBvApiRequestAt = 0;
async function bvApiThrottle() {
  const now = Date.now();
  const wait = lastBvApiRequestAt + BV_API_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastBvApiRequestAt = Date.now();
}

function hasFreshBvApiCache(bvid) {
  if (!bvid) return false;
  const cached = bvApiDataCache.get(bvid);
  return !!(cached && Date.now() < cached.expire);
}

async function getBilibiliVideoApiData(bvid) {
  if (!bvid || bvid.length >= 24) {
    return null;
  }
  const cached = bvApiDataCache.get(bvid);
  if (cached && Date.now() < cached.expire) {
    return cached.data;
  }
  await bvApiThrottle();
  countApiViewRequests++;
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutTimer = controller
    ? setTimeout(() => controller.abort(), BV_API_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(
      url,
      controller ? { signal: controller.signal } : undefined
    );
    const json = await response.json();
    if (json.code === 0) {
      bvApiDataCache.set(bvid, {
        data: json.data,
        expire: Date.now() + BV_API_CACHE_TTL,
      });
      return json.data;
    }
    return null;
  } catch (error) {
    console.error("[🫥BlackList] API 请求失败:", error);
    return null;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

const bvTagApiDataCache = new Map();

function hasFreshBvTagApiCache(bvid) {
  if (!bvid) return false;
  const cached = bvTagApiDataCache.get(bvid);
  return !!(cached && Date.now() < cached.expire);
}

async function getBilibiliVideoTagApiData(bvid) {
  if (!bvid || bvid.length >= 24) {
    return null;
  }
  const cached = bvTagApiDataCache.get(bvid);
  if (cached && Date.now() < cached.expire) {
    return cached.data;
  }
  await bvApiThrottle();
  countApiTagRequests++;
  const url = `https://api.bilibili.com/x/tag/archive/tags?bvid=${encodeURIComponent(bvid)}`;
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutTimer = controller
    ? setTimeout(() => controller.abort(), BV_API_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(
      url,
      controller ? { signal: controller.signal } : undefined
    );
    const json = await response.json();
    if (json.code === 0 && Array.isArray(json.data)) {
      const data = { videoTags: json.data };
      bvTagApiDataCache.set(bvid, {
        data,
        expire: Date.now() + BV_API_CACHE_TTL,
      });
      return data;
    }
    return null;
  } catch (error) {
    console.error("[🫥BlackList] 视频标签 API 请求失败:", error);
    return null;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

function normalizeVideoTagName(tag) {
  if (typeof tag === "string") {
    const name = tag.trim();
    return name && !name.startsWith("#") ? name : null;
  }
  if (!tag || typeof tag !== "object") return null;
  if (tag.tag_id === undefined || tag.tag_id === null) return null;
  const name = String(tag.tag_name || "").trim();
  if (!name || name.startsWith("#")) return null;
  const tagType = String(tag.tag_type || "").toLowerCase();
  if (tagType === "bgm" || tagType === "music" || tagType === "topic") {
    return null;
  }
  if (tag.music_id) return null;
  return name;
}

function getEligibleVideoTags(data) {
  if (!data || !Array.isArray(data.videoTags)) return [];
  const result = [];
  const seen = new Set();
  data.videoTags.forEach((tag) => {
    const name = normalizeVideoTagName(tag);
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  });
  return result;
}

function getBlacklistedTagName(cardElement) {
  const tnameGroup = cardElement.querySelector(
    ".bilibili-blacklist-tname-group"
  );
  if (!tnameGroup) return null;
  const tnameElements = tnameGroup.querySelectorAll(
    ".bilibili-blacklist-tname"
  );
  for (const tnameElement of tnameElements) {
    const tname = tnameElement.textContent.trim();
    if (!tname) continue;
    let matched = null;
    if (tagNameBlacklist.includes(tname)) {
      matched = tname;
    } else {
      const name = getTagNameByV2(tname);
      if (name !== null && tagNameBlacklist.includes(name)) {
        matched = name;
      }
    }
    if (matched === null) continue;
    return matched;
  }
  return null;
}

function isCardBlacklistedByTagName(cardElement) {
  return !!getBlacklistedTagName(cardElement);
}

function addTagSummary(group, label, buttons, color, card) {
  if (!buttons || buttons.length === 0) return;

  const summary = document.createElement("span");
  summary.className = "bilibili-blacklist-tag-summary";
  summary.textContent = label + " " + buttons.length;
  summary.title = "展开" + label + "列表";
  summary.style.backgroundColor = color;
  group.appendChild(summary);

  const popover = document.createElement("div");
  popover.className = "bilibili-blacklist-tag-popover";
  buttons.forEach((b) => popover.appendChild(b));
  group.appendChild(popover);

  let hideTimer = null;
  let lastShowAt = 0;
  const HIDE_DELAY_MS = 200;
  const SHOW_THROTTLE_MS = 300;
  const positionPopover = () => {
    popover.classList.add("show");
    const cr = card.getBoundingClientRect();
    popover.style.maxWidth = Math.min(280, Math.max(120, cr.width - 8)) + "px";
    const gr = group.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    let vLeft = gr.left + (gr.width - pw) / 2;
    let vTop = gr.bottom + 4;
    if (vLeft < cr.left + 4) vLeft = cr.left + 4;
    if (vLeft + pw > cr.right - 4) vLeft = cr.right - 4 - pw;
    if (vTop + ph > cr.bottom - 4) vTop = cr.bottom - 4 - ph;
    if (vTop < cr.top + 4) vTop = cr.top + 4;
    popover.style.left = vLeft - gr.left + "px";
    popover.style.top = vTop - gr.top + "px";
  };
  const show = () => {
    if (hideTimer) clearTimeout(hideTimer);
    const now = Date.now();
    if (now - lastShowAt >= SHOW_THROTTLE_MS) {
      positionPopover();
      lastShowAt = now;
    } else {
      popover.classList.add("show");
    }
  };
  const hide = () => {
    hideTimer = setTimeout(() => popover.classList.remove("show"), HIDE_DELAY_MS);
  };
  summary.addEventListener("mouseenter", show);
  summary.addEventListener("mouseleave", hide);
  popover.addEventListener("mouseenter", show);
  popover.addEventListener("mouseleave", hide);
  summary.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (popover.classList.contains("show")) {
      popover.classList.remove("show");
    } else {
      show();
    }
  });
}

function getBlacklistedVideoTag(cardElement) {
  const videoTagElements = cardElement.querySelectorAll(
    ".bilibili-blacklist-video-tag"
  );
  for (const videoTagElement of videoTagElements) {
    const tagName = (videoTagElement.textContent || "").trim();
    if (tagName && videoTagBlacklist.includes(tagName)) {
      return tagName;
    }
  }
  return null;
}

async function attachTNameGroupToCard(card, bvId) {
  const needViewApi =
    globalPluginConfig.flagTName || globalPluginConfig.flagVertical;
  const needVideoTagApi = globalPluginConfig.flagVideoTag;
  const canRequestApi = !!bvId && bvId.length < 24;
  const usedNetwork =
    (needViewApi && canRequestApi && !hasFreshBvApiCache(bvId)) ||
    (needVideoTagApi && canRequestApi && !hasFreshBvTagApiCache(bvId));
  const viewData = needViewApi ? await getBilibiliVideoApiData(bvId) : null;
  const videoTagData = needVideoTagApi
    ? await getBilibiliVideoTagApiData(bvId)
    : null;
  const data =
    viewData || videoTagData
      ? { ...(viewData || {}), ...(videoTagData || {}) }
      : null;
  const viewFailed = needViewApi && viewData === null;
  const videoTagFailed = needVideoTagApi && videoTagData === null;
  let tnameResolved = false;

  if (data) {
    if (card.querySelector(".bilibili-blacklist-tname-group")) {
      tnameResolved =
        !globalPluginConfig.flagTName ||
        !!card.querySelector(
          ".bilibili-blacklist-tname-group .bilibili-blacklist-tname"
        );
    } else {
      const container = ensureBlockContainerOnCard(card);
      if (container) {
        const tnameGroup = document.createElement("div");
        tnameGroup.className = "bilibili-blacklist-tname-group";

        const tnameButtons = [];
        const pushTName = (name) => {
          const s = String(name || "").trim();
          if (!s) return;
          if (tnameButtons.some((b) => b.textContent.trim() === s)) return;
          tnameButtons.push(createTNameBlockButton(s));
        };
        if (globalPluginConfig.flagTName) {
          pushTName(data.tname);
          pushTName(data.tname_v2);
        }
        if (globalPluginConfig.flagTName && data.tid_v2) {
          const obj = getTagNameById(data.tid_v2);
          if (obj) {
            pushTName(obj.name);
            pushTName(obj.name_v2);
          }
        }

        const videoTagButtons = [];
        const videoTagSeen = new Set();
        if (globalPluginConfig.flagVideoTag) {
          getEligibleVideoTags(data).forEach((tagName) => {
            const s = String(tagName || "").trim();
            if (!s || videoTagSeen.has(s)) return;
            videoTagSeen.add(s);
            videoTagButtons.push(createVideoTagBlockButton(s));
          });
        }

        const hasTname = tnameButtons.length > 0;
        const hasVideoTag = videoTagButtons.length > 0;
        if (hasTname || hasVideoTag) {
          if (hasTname) {
            addTagSummary(tnameGroup, "分类", tnameButtons, "#fb7299dd", card);
          }
          if (hasVideoTag) {
            addTagSummary(tnameGroup, "标签", videoTagButtons, "#409effdd", card);
          }
          container.appendChild(tnameGroup);
          tnameResolved = hasTname;
        }
      }
    }
  }

  return { data, tnameResolved, usedNetwork, viewFailed, videoTagFailed };
}

async function processVideoCardQueue() {
  if (isVideoCardQueueProcessing) return;
  isVideoCardQueueProcessing = true;
  let localDecisionStreak = 0;

  while (videoCardProcessQueue.size > 0 || tnameDecorateQueue.size > 0) {
    if (!isPageCurrentlyActive) {
      await sleep(1000);
      continue;
    }

    if (videoCardProcessQueue.size === 0) {
      const decorateIterator = tnameDecorateQueue.values();
      const decorateCard = decorateIterator.next().value;
      tnameDecorateQueue.delete(decorateCard);
      if (!decorateCard || decorateCard.isConnected === false) continue;
      if (decorateCard.querySelector(".bilibili-blacklist-tname-group")) continue;
      const decorateBvId = getCardVideoBvId(decorateCard);
      if (!decorateBvId) continue;
      const decorateResult = await attachTNameGroupToCard(
        decorateCard,
        decorateBvId
      );
      if (decorateResult.usedNetwork) {
        await sleep(globalPluginConfig.processQueueInterval);
      }
      continue;
    }

    const iterator = videoCardProcessQueue.values();
    const card = iterator.next().value;
    videoCardProcessQueue.delete(card);

    const realCardKey = card ? getRealVideoCardElement(card) || card : null;
    if (!card || processedVideoCards.has(realCardKey)) {
      continue;
    }
    if (card.isConnected === false) {
      continue;
    }

    let usedNetwork = false;
    let shouldHide = false;
    let blockType = "none";
    let blockReasonValue = null;

    const link = getCardHrefLink(card);
    const bvId = getCardVideoBvId(card);
    if (checkLinkCM(link)) {
      shouldHide = true;
      blockType = "cm";
    }
    const { upName, videoTitle } = getVideoCardInfo(card);
    if (!shouldHide && globalPluginConfig.flagInfo && (upName || videoTitle)) {
      const exactMatch = getExactBlacklistMatch(upName);
      if (exactMatch) {
        shouldHide = true;
        blockType = "info";
        blockReasonValue = exactMatch;
      } else if (isRegexBlacklisted(upName, videoTitle)) {
        shouldHide = true;
        blockType = "info";
        blockReasonValue = REGEX_BLOCK_VALUE;
      }
    }

    const hasTNameGroup = !!card.querySelector(".bilibili-blacklist-tname-group");

    if (
      !shouldHide &&
      (globalPluginConfig.flagTName ||
        globalPluginConfig.flagVideoTag ||
        globalPluginConfig.flagVertical) &&
      bvId
    ) {
      if (hasTNameGroup) {
        const result = await attachTNameGroupToCard(card, bvId);
        usedNetwork = result.usedNetwork;
        const data = result.data;
        if (data) {
          const matchedTag = globalPluginConfig.flagTName
            ? getBlacklistedTagName(card)
            : null;
          if (matchedTag) {
            shouldHide = true;
            blockType = "tname";
            blockReasonValue = matchedTag;
          }
          const matchedVideoTag = globalPluginConfig.flagVideoTag
            ? getBlacklistedVideoTag(card)
            : null;
          if (!shouldHide && matchedVideoTag) {
            shouldHide = true;
            blockType = "videoTag";
            blockReasonValue = matchedVideoTag;
          }
          if (
            !shouldHide &&
            globalPluginConfig.flagVertical &&
            data.dimension &&
            data.dimension.width &&
            data.dimension.height
          ) {
            const dimension = data.dimension.width / data.dimension.height;
            if (dimension < globalPluginConfig.verticalScaleThreshold) {
              shouldHide = true;
              blockType = "vertical";
            }
          }
        }
      } else {
        const result = await attachTNameGroupToCard(card, bvId);
        usedNetwork = result.usedNetwork;
        const data = result.data;

        if (data) {
          const matchedTag = globalPluginConfig.flagTName
            ? getBlacklistedTagName(card)
            : null;
          if (matchedTag) {
            shouldHide = true;
            blockType = "tname";
            blockReasonValue = matchedTag;
          }
          const matchedVideoTag = globalPluginConfig.flagVideoTag
            ? getBlacklistedVideoTag(card)
            : null;
          if (!shouldHide && matchedVideoTag) {
            shouldHide = true;
            blockType = "videoTag";
            blockReasonValue = matchedVideoTag;
          }
          if (
            globalPluginConfig.flagVideoTag &&
            !shouldHide &&
            result.videoTagFailed
          ) {
            if (!videoTagRetriedCards.has(card)) {
              videoTagRetriedCards.add(card);
              videoCardProcessQueue.add(card);
              if (usedNetwork) {
                await sleep(globalPluginConfig.processQueueInterval);
              }
              continue;
            }
            console.warn(
              "[🫥BlackList] 视频标签接口无返回，按放行处理:",
              bvId
            );
          }
          if (
            !shouldHide &&
            globalPluginConfig.flagVertical &&
            data.dimension &&
            data.dimension.width &&
            data.dimension.height
          ) {
            const dimension = data.dimension.width / data.dimension.height;
            if (dimension < globalPluginConfig.verticalScaleThreshold) {
              shouldHide = true;
              blockType = "vertical";
            }
          }

          if (globalPluginConfig.flagTName && !shouldHide && !result.tnameResolved) {
            if (!tnameRetriedCards.has(card)) {
              tnameRetriedCards.add(card);
              videoCardProcessQueue.add(card);
              if (usedNetwork) {
                await sleep(globalPluginConfig.processQueueInterval);
              }
              continue;
            }
            console.warn(
              "[🫥BlackList] 分类标签解析失败，按放行处理:",
              bvId
            );
          }
        } else if (
          globalPluginConfig.flagTName ||
          globalPluginConfig.flagVideoTag
        ) {
          const retriedSet = globalPluginConfig.flagTName
            ? tnameRetriedCards
            : videoTagRetriedCards;
          if (!retriedSet.has(card)) {
            retriedSet.add(card);
            videoCardProcessQueue.add(card);
            if (usedNetwork) {
              await sleep(globalPluginConfig.processQueueInterval);
            }
            continue;
          }
          console.warn(
            "[🫥BlackList] 分类/视频标签接口均无返回，按放行处理:",
            bvId
          );
        }
      }
    } else if (
      shouldHide &&
      globalPluginConfig.flagAlwaysFetchTName &&
      (globalPluginConfig.flagTName || globalPluginConfig.flagVideoTag) &&
      bvId &&
      !hasTNameGroup
    ) {
      tnameDecorateQueue.add(card);
    }

    if (shouldHide) {
      clearPendingFilter(card);
      hideVideoCard(card, blockType, blockReasonValue);
    } else {
      clearPendingFilter(card);
      const realCardToDisplay = getRealVideoCardElement(card);
      unmarkBlockedCard(realCardToDisplay);
      removeBlockReason(card);
      removeKirbyOverlay(card);
      if (realCardToDisplay) {
        realCardToDisplay.style.display = "block";
        realCardToDisplay.style.visibility = "visible";
      }
    }

    processedVideoCards.add(realCardKey);
    countProcessedCards++;

    if (usedNetwork) {
      localDecisionStreak = 0;
      await sleep(globalPluginConfig.processQueueInterval);
    } else if (++localDecisionStreak >= 20) {
      localDecisionStreak = 0;
      refreshBlockCountDisplay();
      await sleep(0);
    }
  }
  isVideoCardQueueProcessing = false;
  refreshBlockCountDisplay();
  updateTNameListFromFeed();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const KIRBY_FADE_DURATION_MS = 800;
const DISPLAY_MODE_INHERIT_OPTIONS = [
  { value: "inherit", label: "继承全局" },
  { value: "blur", label: "模糊遮盖" },
  { value: "kirby", label: "模糊遮盖加卡比" },
  { value: "hide", label: "隐藏卡片" },
];
const hoverRevealBoundCards = new WeakSet();
const hoverRevealTimers = new WeakMap();
const kirbyFadeTimers = new WeakMap();

function createBlockUpButton(upName) {
  const button = document.createElement("div");
  button.className = "bilibili-blacklist-block-btn";
  button.textContent = "屏蔽";
  button.title = `屏蔽: ${upName}`;
  button.dataset.upName = upName || "";

  return button;
}

function createTNameBlockButton(tagName) {
  const button = document.createElement("span");
  button.className = "bilibili-blacklist-tname";
  button.textContent = tagName;
  button.title = `屏蔽: ${tagName}`;
  button.dataset.tagName = tagName || "";

  return button;
}

function createVideoTagBlockButton(tagName) {
  const button = document.createElement("span");
  button.className = "bilibili-blacklist-video-tag";
  button.textContent = tagName;
  button.title = `屏蔽视频标签: ${tagName}`;
  button.dataset.videoTag = tagName || "";
  return button;
}

const CARD_ROOT_SELECTORS_FOR_BUTTON = [
  ".bili-video-card",
  ".video-page-card-small",
  ".feed-card",
];

function findCardForButton(button) {
  const container = button.closest(".bilibili-blacklist-block-container");
  if (!container) return null;
  for (const sel of CARD_ROOT_SELECTORS_FOR_BUTTON) {
    const node = container.closest(sel);
    if (node) return node;
  }
  return container.parentElement;
}

let cardButtonDelegationInstalled = false;

function setupCardButtonDelegation() {
  if (cardButtonDelegationInstalled) return;
  cardButtonDelegationInstalled = true;
  document.addEventListener(
    "click",
    function (e) {
      const t = e.target;
      if (!t || typeof t.closest !== "function") return;

      const blockBtn = t.closest(".bilibili-blacklist-block-btn");
      if (blockBtn) {
        e.stopPropagation();
        e.preventDefault();
        const upName = blockBtn.dataset.upName || "";
        if (!upName) return;
        addToExactBlacklist(upName, findCardForButton(blockBtn));
        return;
      }

      const reasonBtn = t.closest(".bilibili-blacklist-block-reason");
      if (reasonBtn) {
        e.stopPropagation();
        e.preventDefault();
        if (!reasonBtn.classList.contains("is-cancellable")) return;
        const blockType = reasonBtn.dataset.blockType || "";
        const blockValue = reasonBtn.dataset.blockValue || "";
        if (!blockType || !blockValue) return;
        cancelCardBlockReason(findCardForButton(reasonBtn), blockType, blockValue);
        return;
      }

      const videoTagBtn = t.closest(".bilibili-blacklist-video-tag");
      if (videoTagBtn) {
        e.stopPropagation();
        e.preventDefault();
        const tagName = videoTagBtn.dataset.videoTag || "";
        if (!tagName) return;
        addToVideoTagBlacklist(tagName, findCardForButton(videoTagBtn));
        return;
      }

      const tnameBtn = t.closest(".bilibili-blacklist-tname");
      if (tnameBtn) {
        e.stopPropagation();
        e.preventDefault();
        const tagName = tnameBtn.dataset.tagName || "";
        if (!tagName) return;
        addToTagNameBlacklist(tagName, findCardForButton(tnameBtn));
      }
    },
    true
  );
}

function resolveHeaderEntryHost() {
  return (
    document.querySelector(".right-entry__main") ||
    document.querySelector(".right-entry") ||
    null
  );
}

function addBlacklistManagerButton() {
  if (!globalPluginConfig.flagHeaderButton) return;
  const rightEntry = resolveHeaderEntryHost();
  if (!rightEntry) {
    console.warn("[🫥BlackList] 未找到右侧导航栏(.right-entry__main / .right-entry)");
    return;
  }
  if (rightEntry.querySelector("#bilibili-blacklist-manager-button")) return;
  if (!rightEntry.querySelector("a, li, .right-entry__item")) {
    return;
  }

  const listItem = document.createElement("li");
  listItem.id = "bilibili-blacklist-manager-button";
  listItem.className = "v-popover-wrap";

  const button = document.createElement("div");
  button.className = "right-entry-item";

  const icon = document.createElement("div");
  icon.className = "right-entry__outside";
  icon.innerHTML = getKirbySVG();

  blockCountDisplayElement = document.createElement("span");
  blockCountDisplayElement.textContent = `0`;

  button.appendChild(icon);
  button.appendChild(blockCountDisplayElement);
  listItem.appendChild(button);

  if (rightEntry.children.length > 1) {
    rightEntry.insertBefore(listItem, rightEntry.children[1]);
  } else {
    rightEntry.appendChild(listItem);
  }

  listItem.addEventListener("click", () => {
    managerPanel.style.display =
      managerPanel.style.display === "flex" ? "none" : "flex";
  });
}

function toggleHeaderButtonVisibility() {
  const btn = document.querySelector("#bilibili-blacklist-manager-button");
  if (btn) {
    btn.style.display = globalPluginConfig.flagHeaderButton ? "" : "none";
  }
}

function initTampermonkeyMenu() {
  if (typeof GM_registerMenuCommand !== "function") return;
  GM_registerMenuCommand("显示/隐藏顶部管理按钮", () => {
    globalPluginConfig.flagHeaderButton = !globalPluginConfig.flagHeaderButton;
    saveGlobalConfigToStorage();
    toggleHeaderButtonVisibility();
  });
  GM_registerMenuCommand("打开黑名单管理面板", () => {
    if (managerPanel) managerPanel.style.display = "flex";
  });
}

const BLOCK_STATS_GROUPS = [
  {
    title: "屏蔽原因明细",
    rows: [
      { key: "info", label: "UP/标题名", getText: () => String(countBlockInfo) },
      { key: "ad", label: "广告", getText: () => String(countBlockAD) },
      { key: "cm", label: "CM 软广", getText: () => String(countBlockCM) },
      { key: "tname", label: "分类标签", getText: () => String(countBlockTName) },
      { key: "videoTag", label: "视频标签", getText: () => String(countBlockVideoTag) },
      { key: "vertical", label: "竖屏", getText: () => String(countBlockVertical) },
    ],
  },
  {
    title: "网络与请求",
    rows: [
      { key: "netItems", label: "网络拦截", getText: () => `${countNetworkInterceptItems} 条` },
      { key: "netAds", label: "其中广告", getText: () => `${countNetworkInterceptAds} 条` },
      { key: "netResponses", label: "拦截响应", getText: () => `${countNetworkInterceptResponses} 次` },
      { key: "processed", label: "已判定卡片", getText: () => String(countProcessedCards) },
      { key: "apiView", label: "view 请求", getText: () => String(countApiViewRequests) },
      { key: "apiTag", label: "标签请求", getText: () => String(countApiTagRequests) },
    ],
  },
  {
    title: "累计与趋势（按天持久化）",
    withTrend: true,
    rows: [
      {
        key: "todayBlocks",
        label: "今日屏蔽",
        getText: (ctx) => String(sumBlockStatsBlocked(ctx.summary.today)),
      },
      {
        key: "last7Blocks",
        label: "近 7 天屏蔽",
        getText: (ctx) => String(sumBlockStatsBlocked(ctx.summary.last7)),
      },
      {
        key: "totalBlocks",
        label: "累计屏蔽",
        getText: (ctx) => String(sumBlockStatsBlocked(ctx.summary.total)),
      },
      {
        key: "todayNet",
        label: "今日拦截",
        getText: (ctx) => `${ctx.summary.today.netItems} 条`,
      },
      {
        key: "last7Net",
        label: "近 7 天拦截",
        getText: (ctx) => `${ctx.summary.last7.netItems} 条`,
      },
      {
        key: "totalProcessed",
        label: "累计判定",
        getText: (ctx) => String(ctx.summary.total.processed),
      },
    ],
  },
];

function refreshBlockCountDisplay() {
  const headerNotReady = isCurrentPageVideo() && !videoHeaderReady;
  if (!headerNotReady && blockCountDisplayElement) {
    blockCountDisplayElement.textContent = `${blockedVideoCards.size}`;
  }
  if (blockCountTitleElement) {
    blockCountTitleElement.textContent = `已屏蔽视频 ${blockedVideoCards.size}`;
  }
  if (!blockStatsValueElements) return;
  if (!isBlockStatsExpanded) return;
  const ctx = {
    summary: getBlockStatsSummary(),
    series: getBlockStatsDailySeries(7),
  };
  BLOCK_STATS_GROUPS.forEach((group) => {
    group.rows.forEach((row) => {
      const valueElement = blockStatsValueElements.get(row.key);
      if (valueElement) valueElement.textContent = row.getText(ctx);
    });
  });
  if (blockTrendBarElements && ctx.series) {
    const maxBlocks = Math.max(
      1,
      ctx.series.reduce((m, d) => Math.max(m, d.blocks), 0)
    );
    ctx.series.forEach((day, index) => {
      const bar = blockTrendBarElements[index];
      if (!bar) return;
      bar.style.height =
        (day.blocks === 0 ? 2 : Math.max(3, Math.round((day.blocks / maxBlocks) * 26))) +
        "px";
      bar.style.backgroundColor = day.blocks === 0 ? "#e3e5e8" : "#fb7299";
      bar.title = `${day.key.slice(5)}：屏蔽 ${day.blocks} 条（网络拦截 ${day.intercepted} 条）`;
    });
  }
}

function createPanelButton(text, bgColor, onClick) {
  const button = document.createElement("button");
  button.className = "bilibili-blacklist-panel-btn";
  button.textContent = text;
  button.style.background = bgColor;
  button.addEventListener("click", onClick);
  return button;
}

function createBlacklistListItem(contentText, onRemoveClick) {
  const item = document.createElement("li");
  item.className = "bilibili-blacklist-list-item";

  const content = document.createElement("span");
  content.textContent = contentText;
  const removeBtn = createPanelButton("移除", "#f56c6c", onRemoveClick);

  item.appendChild(content);
  item.appendChild(removeBtn);
  return item;
}

function getListSearchKeyword(selector) {
  const el = document.querySelector(selector);
  return el ? (el.value || "").trim().toLowerCase() : "";
}

function createListSearchInput(id, placeholder, onInput) {
  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.placeholder = placeholder;
  input.className = "bilibili-blacklist-search-input";
  input.addEventListener("input", onInput);
  return input;
}

function refreshBlacklistList(cfg) {
  let listElement = cfg.cachedElement;
  if (!listElement) {
    if (!isBlacklistPanelCreated()) return null;
    listElement = document.querySelector("#" + cfg.listId);
    if (!listElement) {
      console.warn("[🫥BlackList] 未找到列表容器:", cfg.listId);
      return null;
    }
  }

  const list = cfg.getList() || [];
  const keyword = getListSearchKeyword("#" + cfg.searchId);
  const filtered = keyword
    ? list.filter((item) =>
        String(item == null ? "" : item)
          .toLowerCase()
          .includes(keyword)
      )
    : list;

  listElement.innerHTML = "";
  filtered.forEach((item) => {
    listElement.appendChild(
      createBlacklistListItem(item, () => cfg.onRemove(item))
    );
  });
  Array.from(listElement.children)
    .reverse()
    .forEach((item) => listElement.appendChild(item));

  const emptyText =
    list.length === 0 ? cfg.emptyText : filtered.length === 0 ? "无匹配结果" : null;
  if (emptyText) {
    const empty = document.createElement("div");
    empty.className = "bilibili-blacklist-empty";
    empty.textContent = emptyText;
    listElement.appendChild(empty);
  }
  return listElement;
}

function refreshExactMatchList() {
  const listElement = refreshBlacklistList({
    listId: "bilibili-blacklist-exact-list",
    searchId: "bilibili-blacklist-exact-search",
    cachedElement: exactMatchListElement,
    getList: () => exactMatchBlacklist,
    emptyText: "暂无精确匹配屏蔽UP主",
    onRemove: (upName) => removeFromExactBlacklist(upName),
  });
  if (listElement) exactMatchListElement = listElement;
}

function refreshRegexMatchList() {
  const listElement = refreshBlacklistList({
    listId: "bilibili-blacklist-regex-list",
    searchId: "bilibili-blacklist-regex-search",
    cachedElement: regexMatchListElement,
    getList: () => regexMatchBlacklist,
    emptyText: "暂无正则匹配屏蔽规则",
    onRemove: (regex) => {
      const index = regexMatchBlacklist.indexOf(regex);
      if (index === -1) return;
      regexMatchBlacklist.splice(index, 1);
      saveBlacklistsToStorage();
      invalidateRegexCache();
      refreshRegexMatchList();
    },
  });
  if (listElement) regexMatchListElement = listElement;
}

function refreshTagNameList() {
  const listElement = refreshBlacklistList({
    listId: "bilibili-blacklist-tname-list",
    searchId: "bilibili-blacklist-tname-search",
    cachedElement: tagNameListElement,
    getList: () => tagNameBlacklist,
    emptyText: "暂无标签屏蔽规则",
    onRemove: (tagName) => removeFromTagNameBlacklist(tagName),
  });
  if (listElement) tagNameListElement = listElement;
}

function refreshVideoTagList() {
  const listElement = refreshBlacklistList({
    listId: "bilibili-blacklist-video-tag-list",
    searchId: "bilibili-blacklist-video-tag-search",
    cachedElement: videoTagListElement,
    getList: () => videoTagBlacklist,
    emptyText: "暂无视频标签屏蔽规则",
    onRemove: (tagName) => removeFromVideoTagBlacklist(tagName),
  });
  if (listElement) videoTagListElement = listElement;
}

function createSettingToggleButton(labelText, configKey, title = null) {
  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-toggle";
  container.title = title;

  const label = document.createElement("span");
  label.textContent = labelText;

  const button = document.createElement("button");
  button.className = "bilibili-blacklist-config-btn";

  function refreshButtonAppearance() {
    button.textContent = globalPluginConfig[configKey] ? "开启" : "关闭";
    button.style.backgroundColor = globalPluginConfig[configKey]
      ? "#fb7299"
      : "#909399";
  }

  button.addEventListener("click", () => {
    globalPluginConfig[configKey] = !globalPluginConfig[configKey];
    refreshButtonAppearance();
    saveGlobalConfigToStorage();
    if (configKey === "flagHoverReveal" && !globalPluginConfig[configKey]) {
      restoreAllBlockedVideoOverlays();
    }
  });

  refreshButtonAppearance();

  container.appendChild(label);
  container.appendChild(button);

  return container;
}
function createSettingInput(
  labelText,
  configKey,
  title = null,
  constraints = {}
) {
  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-input-row";
  container.title = title;

  const label = document.createElement("span");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "bilibili-blacklist-number-input";
  const { min = 0, max = null, step = null } = constraints;
  input.min = `${min}`;
  if (max !== null) input.max = `${max}`;
  if (step !== null) input.step = `${step}`;
  input.value = globalPluginConfig[configKey];

  const button = document.createElement("button");
  button.className =
    "bilibili-blacklist-config-btn bilibili-blacklist-config-btn-primary";
  button.textContent = "保存";

  button.addEventListener("click", () => {
    const val = Number(input.value);
    const isInRange =
      input.value.trim() !== "" &&
      Number.isFinite(val) &&
      val >= min &&
      (max === null || val <= max);
    if (isInRange) {
      globalPluginConfig[configKey] = val;
      saveGlobalConfigToStorage();
    } else {
      const rangeText = max === null ? `不小于 ${min}` : `${min} 到 ${max}`;
      alert(`请输入${rangeText}之间的有效数字！`);
    }
  });
  container.appendChild(label);
  container.appendChild(input);
  container.appendChild(button);

  return container;
}

function createSettingSelect(labelText, configKey, title = null, options = []) {
  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-select-row";
  container.title = title;

  const label = document.createElement("span");
  label.textContent = labelText;

  const select = document.createElement("select");
  select.className = "bilibili-blacklist-select";
  select.addEventListener("change", () => {
    globalPluginConfig[configKey] = select.value;
    saveGlobalConfigToStorage();
  });

  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (String(globalPluginConfig[configKey]) === String(opt.value)) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  container.appendChild(label);
  container.appendChild(select);
  return container;
}

function refreshConfigSettings() {
  if (!configListElement) {
    if (!isBlacklistPanelCreated()) {
      return;
    }
    configListElement = document.querySelector(
      "#bilibili-blacklist-config-list"
    );
    if (!configListElement) {
      console.warn("[🫥BlackList] configListElement 未定义");
      return;
    }
  }
  configListElement.innerHTML = "";

  const tempToggleContainer = document.createElement("div");
  tempToggleContainer.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-temp-toggle";
  const tempToggleLabel = document.createElement("span");
  tempToggleLabel.textContent = "临时开关";

  tempUnblockButton = document.createElement("button");
  tempUnblockButton.className = "bilibili-blacklist-config-btn";
  tempUnblockButton.textContent = isShowAllVideos ? "恢复屏蔽" : "取消屏蔽";
  tempUnblockButton.style.background = isShowAllVideos
    ? "#dddddd"
    : "#fb7299";
  tempUnblockButton.addEventListener("click", toggleShowAllBlockedVideos);

  tempToggleContainer.appendChild(tempToggleLabel);
  tempToggleContainer.appendChild(tempUnblockButton);
  configListElement.appendChild(tempToggleContainer);

  const switchTitle = document.createElement("h4");
  switchTitle.textContent = "屏蔽类型开关";
  configListElement.appendChild(switchTitle);

  configListElement.appendChild(
    createSettingToggleButton(
      "屏蔽标题/Up主名",
      "flagInfo",
      "屏蔽标题/Up主名"
    )
  );
  configListElement.appendChild(
    createSettingToggleButton(
      "屏蔽分类标签",
      "flagTName",
      "通过请求API获取分类标签"
    )
  );
  configListElement.appendChild(
    createSettingToggleButton(
      "屏蔽视频标签",
      "flagVideoTag",
      "通过 /x/tag/archive/tags 获取视频标签，并自动排除音乐和话题标签"
    )
  );
  configListElement.appendChild(
    createSettingToggleButton(
      "屏蔽竖屏视频",
      "flagVertical",
      "通过请求API获取视频分辨率"
    )
  );
  configListElement.appendChild(
    createSettingToggleButton("屏蔽主页推荐", "flagAD", "直播/广告/分区推送")
  );
  configListElement.appendChild(
    createSettingToggleButton(
      "屏蔽主页视频软广",
      "flagCM",
      "cm.bilibili.com软广"
    )
  );

  const dataTitle = document.createElement("h4");
  dataTitle.textContent = "分类数据与缓存";
  configListElement.appendChild(dataTitle);

  configListElement.appendChild(
    createSettingToggleButton(
      "始终获取分类标签",
      "flagAlwaysFetchTName",
      "开启(默认)：即使卡片已被UP主名/正则/软广命中，也会在低优先级补一次请求，保证分类标签按钮始终可见。关闭：已命中的卡片不再请求API，队列处理明显更快（搜索页翻页尤其明显），代价是这些卡片上看不到分类标签。"
    )
  );

  const tagNameListControlContainer = document.createElement("div");
  tagNameListControlContainer.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-cache-control";
  tagNameListControlContainer.title = "打开视频播放页面可刷新";

  const tagNameListLabel = document.createElement("span");
  tagNameListLabel.textContent = `分类标签缓存数量: ${tagNameList.length}`;

  const clearTagNameListButton = document.createElement("button");
  clearTagNameListButton.className =
    "bilibili-blacklist-config-btn bilibili-blacklist-config-btn-danger";
  clearTagNameListButton.textContent = "清除";
  clearTagNameListButton.addEventListener("click", () => {
    if (confirm("确定要清除分类标签缓存吗？这不会影响已屏蔽的标签，但会使得下次需要重新从API获取标签信息。")) {
      tagNameList.length = 0;
      saveTagNameListWithTimestamp();
      tagNameListLabel.textContent = `分类标签缓存数量: 0`;
    }
  });

  tagNameListControlContainer.appendChild(tagNameListLabel);
  tagNameListControlContainer.appendChild(clearTagNameListButton);
  configListElement.appendChild(tagNameListControlContainer);

  const blockStatsControlContainer = document.createElement("div");
  blockStatsControlContainer.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-cache-control";
  blockStatsControlContainer.title =
    "按天累计的屏蔽/拦截统计（面板头部明细里的「累计与趋势」）";
  const blockStatsLabel = document.createElement("span");
  const blockStatsTotal = sumBlockStatsBlocked(getBlockStatsSummary().total);
  blockStatsLabel.textContent = `累计屏蔽统计: ${blockStatsTotal}`;
  const clearBlockStatsButton = document.createElement("button");
  clearBlockStatsButton.className =
    "bilibili-blacklist-config-btn bilibili-blacklist-config-btn-danger";
  clearBlockStatsButton.textContent = "清除";
  clearBlockStatsButton.addEventListener("click", () => {
    if (!confirm("确定要清除累计屏蔽统计吗？（面板头部的今日/近7天/累计与趋势会归零）")) {
      return;
    }
    clearBlockStats();
    blockStatsLabel.textContent = "累计屏蔽统计: 0";
    refreshBlockCountDisplay();
  });
  blockStatsControlContainer.appendChild(blockStatsLabel);
  blockStatsControlContainer.appendChild(clearBlockStatsButton);
  configListElement.appendChild(blockStatsControlContainer);

  configListElement.appendChild(
    createSettingSelect(
      "自动连播遇到被屏蔽视频:",
      "flagSkipBlockedAutoplay",
      "播放页开启自动连播并播到被屏蔽视频时：切换为未屏蔽视频 / 停止播放 / 不处理（按B站默认继续播放）。",
      [
        { value: "skip", label: "切换为未屏蔽视频" },
        { value: "stop", label: "停止播放" },
        { value: "off", label: "不处理(默认)" },
      ]
    )
  );

  const displayTitle = document.createElement("h4");
  displayTitle.textContent = "显示方式";
  configListElement.appendChild(displayTitle);

  const DISPLAY_MODE_OPTIONS = DISPLAY_MODE_INHERIT_OPTIONS.filter(
    (opt) => opt.value !== "inherit"
  );
  const displayModeRows = [
    [
      "卡片遮挡模式(全局):",
      "blockDisplayMode",
      "被屏蔽卡片的显示方式：模糊遮盖 / 模糊遮盖加卡比 / 隐藏卡片。",
      DISPLAY_MODE_OPTIONS,
    ],
    [
      "标题/UP主名行为:",
      "displayModeInfo",
      "标题/UP主名命中的卡片显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
    [
      "广告行为:",
      "displayModeAD",
      "广告卡片的显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
    [
      "分类标签行为:",
      "displayModeTName",
      "分类标签命中的卡片显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
    [
      "视频标签行为:",
      "displayModeVideoTag",
      "视频标签命中的卡片显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
    [
      "竖屏行为:",
      "displayModeVertical",
      "竖屏命中的卡片显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
    [
      "软广(CM)行为:",
      "displayModeCM",
      "cm.bilibili.com 软广卡片的显示方式，选择继承全局则跟随上方全局模式。",
      DISPLAY_MODE_INHERIT_OPTIONS,
    ],
  ];
  displayModeRows.forEach(([label, key, title, options]) => {
    configListElement.appendChild(
      createSettingSelect(label, key, title, options)
    );
  });
  configListElement.appendChild(
    createSettingToggleButton(
      "加载时立即隐藏卡片",
      "flagHideOnLoad",
      "开启：新卡片先用 CSS filter 遮盖（模糊+灰度+降透明度，不插 DOM、不改结构，减少重排闪烁），等分类/竖屏 API 判定完再统一显示——避免“先显示、后被屏蔽导致卡片重排”。关闭：卡片先显示，若稍后被判定屏蔽会产生一次重排（观感更突兀），但处理速度感更快。建议开启。"
    )
  );

  const interactTitle = document.createElement("h4");
  interactTitle.textContent = "交互";
  configListElement.appendChild(interactTitle);

  configListElement.appendChild(
    createSettingToggleButton(
      "悬停后显示被遮挡视频",
      "flagHoverReveal",
      "鼠标在被遮挡的视频卡片上停留指定时间后临时显示，移开后重新遮挡。仅在“遮挡被屏蔽视频”开启时生效。"
    )
  );
  configListElement.appendChild(
    createSettingInput(
      "悬停显示延迟 (秒):",
      "hoverRevealDelaySeconds",
      "允许设置 0.1 到 5 秒。",
      { min: 0.1, max: 5, step: 0.1 }
    )
  );

  const netTitle = document.createElement("h4");
  netTitle.textContent = "网络与性能";
  configListElement.appendChild(netTitle);

  configListElement.appendChild(
    createSettingToggleButton(
      "网络拦截(推荐接口)",
      "flagNetworkIntercept",
      "启用后拦截并改写推荐/相关接口响应，命中黑名单的条目不再下发（实验性：会改动 B 站接口响应体，默认关闭；改动后刷新页面生效）。"
    )
  );
  configListElement.appendChild(
    createSettingInput(
      "卡片扫描间隔 (ms):",
      "blockScanInterval",
      "扫描新卡片的间隔时间，单位 ms。值越小，新卡片隐藏越快，但可能会增加CPU负担。建议值 200ms。"
    )
  );
  configListElement.appendChild(
    createSettingInput(
      "视频信息API请求间隔 (ms):",
      "processQueueInterval",
      "每个视频获取分类标签/视频分辨率时的API请求间隔时间，单位 ms。值越小处理越快；实测 16ms 一般不触发 B 站 API 限流，但请自行观察网络面板。"
    )
  );
  configListElement.appendChild(
    createSettingInput(
      "竖屏视频比例阈值:",
      "verticalScaleThreshold",
      "视频宽度/高度小于该阈值时判定为竖屏（0-1）。建议值 0.7。",
      { min: 0, max: 1, step: 0.05 }
    )
  );

  const disclaimer = document.createElement("div");
  disclaimer.className = "bilibili-blacklist-disclaimer";
  disclaimer.textContent =
    "免责声明：本插件由 AI（DeepSeek Harness）自动编写，并非人工逐行开发；" +
    "使用前请自行评估风险。作者：DeepSeek Harness (AI)。";
  configListElement.appendChild(disclaimer);
}

function refreshAllPanelTabs() {
  refreshExactMatchList();
  refreshRegexMatchList();
  refreshTagNameList();
  refreshVideoTagList();
  refreshConfigSettings();
}

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

function createBlacklistPanel() {
  if (isBlacklistPanelCreated()) {
    return;
  }
  managerPanel = document.createElement("div");
  managerPanel.id = "bilibili-blacklist-manager-panel";

  const tabContainer = document.createElement("div");
  tabContainer.className = "bilibili-blacklist-tabs";

  const exactContent = document.createElement("div");
  exactContent.className = "bilibili-blacklist-panel-content";
  exactContent.style.display = "block";

  const regexContent = document.createElement("div");
  regexContent.className = "bilibili-blacklist-panel-content";
  regexContent.style.display = "none";

  const tnameContent = document.createElement("div");
  tnameContent.className = "bilibili-blacklist-panel-content";
  tnameContent.style.display = "none";

  const videoTagContent = document.createElement("div");
  videoTagContent.className = "bilibili-blacklist-panel-content";
  videoTagContent.style.display = "none";

  const configContent = document.createElement("div");
  configContent.className = "bilibili-blacklist-panel-content";
  configContent.style.display = "none";

  const tabs = [
    { name: "精确匹配(Up名字)", content: exactContent },
    { name: "正则匹配(Up/标题)", content: regexContent },
    { name: "屏蔽分类", content: tnameContent },
    { name: "屏蔽标签", content: videoTagContent },
    { name: "插件配置", content: configContent },
  ];
  tabs.forEach((tabData) => {
    const tab = document.createElement("div");
    tab.className = "bilibili-blacklist-tab";
    tab.textContent = tabData.name;
    tab.style.borderBottom =
      tabData.content.style.display === "block"
        ? "2px solid #fb7299"
        : "none";

    tab.addEventListener("click", () => {
      tabs.forEach(({ tab: t, content: c }) => {
        t.style.borderBottom = "none";
        c.style.display = "none";
      });
      tab.style.borderBottom = "2px solid #fb7299";
      tabData.content.style.display = "block";
    });

    tabData.tab = tab;
    tabContainer.appendChild(tab);
  });

  const header = document.createElement("div");
  header.className = "bilibili-blacklist-panel-header";

  blockCountTitleElement = document.createElement("h3");
  blockCountTitleElement.title =
    "总数 = UP/标题名 + 广告 + CM 软广 + 分类标签 + 视频标签 + 竖屏";

  const titleWrap = document.createElement("div");
  titleWrap.className = "bilibili-blacklist-panel-title";
  titleWrap.appendChild(blockCountTitleElement);

  const statsContainer = document.createElement("div");
  statsContainer.className = "bilibili-blacklist-stats";
  blockStatsValueElements = new Map();
  BLOCK_STATS_GROUPS.forEach((group) => {
    const groupTitle = document.createElement("div");
    groupTitle.className = "bilibili-blacklist-stats-group";
    groupTitle.textContent = group.title;
    statsContainer.appendChild(groupTitle);
    group.rows.forEach((row) => {
      const rowElement = document.createElement("div");
      rowElement.className = "bilibili-blacklist-stat-row";
      rowElement.title = row.label;
      const labelElement = document.createElement("span");
      labelElement.textContent = row.label;
      const valueElement = document.createElement("b");
      valueElement.textContent = "0";
      rowElement.appendChild(labelElement);
      rowElement.appendChild(valueElement);
      statsContainer.appendChild(rowElement);
      blockStatsValueElements.set(row.key, valueElement);
    });
    if (group.withTrend) {
      const trend = document.createElement("div");
      trend.className = "bilibili-blacklist-trend";
      blockTrendBarElements = [];
      for (let i = 0; i < 7; i++) {
        const bar = document.createElement("span");
        bar.className = "bilibili-blacklist-trend-bar";
        trend.appendChild(bar);
        blockTrendBarElements.push(bar);
      }
      statsContainer.appendChild(trend);
    }
  });
  titleWrap.appendChild(statsContainer);
  statsContainer.style.display = isBlockStatsExpanded ? "" : "none";

  const headerActions = document.createElement("div");
  headerActions.className = "bilibili-blacklist-panel-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "bilibili-blacklist-panel-toggle";
  toggleBtn.innerHTML = getChevronIconSVG();
  const refreshToggleState = () => {
    toggleBtn.classList.toggle("is-expanded", isBlockStatsExpanded);
    toggleBtn.title = isBlockStatsExpanded ? "收起统计明细" : "展开统计明细";
    toggleBtn.setAttribute("aria-label", toggleBtn.title);
    toggleBtn.setAttribute("aria-expanded", isBlockStatsExpanded ? "true" : "false");
    statsContainer.style.display = isBlockStatsExpanded ? "" : "none";
  };
  toggleBtn.addEventListener("click", () => {
    isBlockStatsExpanded = !isBlockStatsExpanded;
    refreshToggleState();
    if (isBlockStatsExpanded) refreshBlockCountDisplay();
  });
  refreshToggleState();

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bilibili-blacklist-panel-close";
  closeBtn.title = "关闭面板";
  closeBtn.setAttribute("aria-label", "关闭面板");
  closeBtn.innerHTML = getCloseIconSVG();
  closeBtn.addEventListener("click", () => {
    managerPanel.style.display = "none";
  });

  headerActions.appendChild(toggleBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(titleWrap);
  header.appendChild(headerActions);

  const contentContainer = document.createElement("div");
  contentContainer.className = "bilibili-blacklist-panel-body";

  const addExactContainer = document.createElement("div");
  addExactContainer.className = "bilibili-blacklist-add-row";

  const exactInput = document.createElement("input");
  exactInput.type = "text";
  exactInput.placeholder = "输入要屏蔽的UP主名称";

  const addExactBtn = document.createElement("button");
  addExactBtn.className = "bilibili-blacklist-primary-btn";
  addExactBtn.textContent = "添加";
  addExactBtn.addEventListener("click", () => {
    const upName = exactInput.value.trim();
    if (upName) {
      addToExactBlacklist(upName);
      exactInput.value = "";
    }
  });
  addExactContainer.appendChild(exactInput);
  addExactContainer.appendChild(addExactBtn);
  exactContent.appendChild(addExactContainer);
  exactContent.appendChild(
    createListSearchInput(
      "bilibili-blacklist-exact-search",
      "搜索精确匹配列表（模糊匹配）",
      refreshExactMatchList
    )
  );

  const addRegexContainer = document.createElement("div");
  addRegexContainer.className = "bilibili-blacklist-add-row";

  const regexInput = document.createElement("input");
  regexInput.type = "text";
  regexInput.placeholder = "正则表达式，支持 /pattern/flags（如: /小小.*Official/i）";

  const addRegexBtn = document.createElement("button");
  addRegexBtn.className = "bilibili-blacklist-primary-btn";
  addRegexBtn.textContent = "添加";
  addRegexBtn.addEventListener("click", () => {
    const regex = regexInput.value.trim();
    if (regex && !regexMatchBlacklist.includes(regex)) {
      if (!compileRegex(regex)) {
        alert("无效的正则表达式（支持 /pattern/flags）");
        return;
      }
      regexMatchBlacklist.push(regex);
      saveBlacklistsToStorage();
      invalidateRegexCache();
      regexInput.value = "";
      refreshRegexMatchList();
    }
  });
  addRegexContainer.appendChild(regexInput);
  addRegexContainer.appendChild(addRegexBtn);
  regexContent.appendChild(addRegexContainer);

  const regexHint = document.createElement("div");
  regexHint.className = "bilibili-blacklist-regex-hint";
  regexHint.textContent =
    "提示：纯文本按“包含”匹配（忽略大小写），短词可能误伤；" +
    "如需精确/边界匹配请用正则，如 /^米哈游/、/\b原神\b/。";
  regexHint.style.cssText =
    "font-size:12px;color:#999;margin:0 0 12px;line-height:1.5;";
  regexContent.appendChild(regexHint);
  regexContent.appendChild(
    createListSearchInput(
      "bilibili-blacklist-regex-search",
      "搜索正则匹配列表（模糊匹配）",
      refreshRegexMatchList
    )
  );

  const addVideoTagContainer = document.createElement("div");
  addVideoTagContainer.className = "bilibili-blacklist-add-row";

  const videoTagInput = document.createElement("input");
  videoTagInput.type = "text";
  videoTagInput.placeholder = "输入要屏蔽的视频标签（不含音乐/话题）";

  const addVideoTagBtn = document.createElement("button");
  addVideoTagBtn.className = "bilibili-blacklist-primary-btn";
  addVideoTagBtn.textContent = "添加";
  addVideoTagBtn.addEventListener("click", () => {
    const tagName = videoTagInput.value.trim();
    if (tagName) {
      addToVideoTagBlacklist(tagName);
      videoTagInput.value = "";
    }
  });
  addVideoTagContainer.appendChild(videoTagInput);
  addVideoTagContainer.appendChild(addVideoTagBtn);
  videoTagContent.appendChild(addVideoTagContainer);
  videoTagContent.appendChild(
    createListSearchInput(
      "bilibili-blacklist-video-tag-search",
      "搜索视频标签列表（模糊匹配）",
      refreshVideoTagList
    )
  );

  exactMatchListElement = document.createElement("ul");
  exactMatchListElement.id = "bilibili-blacklist-exact-list";

  regexMatchListElement = document.createElement("ul");
  regexMatchListElement.id = "bilibili-blacklist-regex-list";

  tagNameListElement = document.createElement("ul");
  tagNameListElement.id = "bilibili-blacklist-tname-list";

  videoTagListElement = document.createElement("ul");
  videoTagListElement.id = "bilibili-blacklist-video-tag-list";

  configListElement = document.createElement("ul");
  configListElement.id = "bilibili-blacklist-config-list";

  refreshAllPanelTabs();
  exactContent.appendChild(exactMatchListElement);
  regexContent.appendChild(regexMatchListElement);
  tnameContent.appendChild(
    createListSearchInput(
      "bilibili-blacklist-tname-search",
      "搜索分类标签列表（模糊匹配）",
      refreshTagNameList
    )
  );
  tnameContent.appendChild(tagNameListElement);
  videoTagContent.appendChild(videoTagListElement);
  configContent.appendChild(configListElement);

  contentContainer.appendChild(exactContent);
  contentContainer.appendChild(regexContent);
  contentContainer.appendChild(tnameContent);
  contentContainer.appendChild(videoTagContent);
  contentContainer.appendChild(configContent);

  managerPanel.appendChild(tabContainer);
  managerPanel.appendChild(header);
  managerPanel.appendChild(contentContainer);

  document.body.appendChild(managerPanel);

  refreshBlockCountDisplay();

  return managerPanel;
}

GM_addStyle(`
  /* ===== 屏蔽按钮容器 ===== */
  .bilibili-blacklist-block-container {
    display: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    padding: 2px;
    font-size: 12px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 3px;
    z-index: 9999;
    pointer-events: none;
  }

  .bili-video-card:hover .bilibili-blacklist-block-container,
  .card-box:hover .bilibili-blacklist-block-container,
  .bilibili-blacklist-block-container-host:hover .bilibili-blacklist-block-container {
    display: flex !important;
  }

  .card-box .bilibili-blacklist-block-container {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    height: 100%;
  }

  .card-box .bilibili-blacklist-tname-group {
    flex-direction: column;
    align-items: flex-end;
    margin-top: auto;
  }

  /* btn / reason / tname 共用基础外观 */
  .bilibili-blacklist-block-btn,
  .bilibili-blacklist-block-reason,
  .bilibili-blacklist-tname,
  .bilibili-blacklist-video-tag {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    box-sizing: border-box;
    font-size: 12px;
    line-height: 1;
    color: white;
    text-align: center;
    white-space: nowrap;
    border: none;
    border-radius: 2px;
  }

  .bilibili-blacklist-block-btn {
    position: static;
    width: 40px;
    pointer-events: auto !important;
    background-color: #fb7299dd;
    cursor: pointer;
  }

  /* 已屏蔽（有屏蔽原因）的卡片：隐藏“屏蔽”按钮，只保留原因/标签按钮 */
  .bilibili-blacklist-block-container.is-blocked .bilibili-blacklist-block-btn {
    display: none !important;
  }

  .bilibili-blacklist-block-reason {
    background-color: #f56c6c;
    pointer-events: none;
  }

  /* 支持“本卡放行”的原因按钮可点击 */
  .bilibili-blacklist-block-reason.is-cancellable {
    pointer-events: auto;
    cursor: pointer;
  }
  .bilibili-blacklist-block-reason.is-cancellable:hover {
    filter: brightness(1.15);
  }

  .bilibili-blacklist-tname-group {
    display: flex;
    flex-direction: row;
    position: relative;
    padding: 0 5px;
    gap: 3px;
    align-items: center;
    margin-left: auto;
    max-width: 80%;
    pointer-events: none;
  }

  .bilibili-blacklist-tname {
    background-color: #fb7299dd;
    text-overflow: ellipsis;
    overflow: hidden;
    pointer-events: auto;
    cursor: pointer;
  }

  .bilibili-blacklist-video-tag {
    background-color: #409effdd;
    text-overflow: ellipsis;
    overflow: hidden;
    pointer-events: auto;
    cursor: pointer;
  }

  /* “分类 N / 标签 M”汇总按钮（颜色由 JS 内联指定） */
  .bilibili-blacklist-tag-summary {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    padding: 0 6px;
    box-sizing: border-box;
    font-size: 12px;
    line-height: 1;
    color: #fff;
    white-space: nowrap;
    border-radius: 2px;
    pointer-events: auto;
    cursor: pointer;
  }

  /* 悬停/点击汇总按钮展开的覆盖浮层（在卡片内、可滚动） */
  .bilibili-blacklist-tag-popover {
    display: none;
    position: absolute;
    z-index: 10001;
    max-height: 200px;
    overflow: auto;
    padding: 4px;
    box-sizing: border-box;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
    align-content: flex-start;
    background-color: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    pointer-events: auto;
  }
  .bilibili-blacklist-tag-popover.show {
    display: flex !important;
  }

  /* ===== 修复视频卡片布局 ===== */
  .bili-video-card__cover {
    contain: layout !important;
  }

  /* ===== 管理面板 ===== */
  #bilibili-blacklist-manager-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    max-width: 80%;
    max-height: 80vh;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 99999;
    overflow: hidden;
    display: none;
    flex-direction: column;
    font-size: 15px;
    color: var(--text2, #000);
    background-color: var(--bg1, #fff);
    opacity: 0.85;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  #bilibili-blacklist-manager-panel h3,
  #bilibili-blacklist-manager-panel h4 {
    color: var(--text2, #000);
  }

  #bilibili-blacklist-manager-panel h3 {
    margin: 0;
    font-weight: 500;
  }

  #bilibili-blacklist-manager-panel h4 {
    font-weight: bold;
    margin-bottom: 12px;
  }

  /* 插件配置页的分组标题（如“屏蔽类型开关”）加背景色，便于区分功能分组 */
  #bilibili-blacklist-config-list h4 {
    display: block;
    padding: 6px 10px;
    margin: 12px 0 8px;
    background-color: #f2f3f5;
    border-left: 3px solid #fb7299;
    border-radius: 4px;
    color: #333;
  }

  #bilibili-blacklist-manager-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  #bilibili-blacklist-manager-panel hr {
    margin: 12px 0;
    border: none;
    border-top: 2px solid #ddd;
  }

  /* 按钮基础交互 */
  #bilibili-blacklist-manager-panel button {
    transition: background-color 0.2s;
  }

  #bilibili-blacklist-manager-panel button:hover {
    opacity: 0.9;
  }

  /* 输入框 */
  #bilibili-blacklist-manager-panel input:focus {
    outline: none;
    border-color: #fb7299 !important;
  }

  #bilibili-blacklist-manager-panel input[type="text"] {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  /* 屏蔽列表搜索框 */
  .bilibili-blacklist-search-input {
    margin-bottom: 8px;
  }

  #bilibili-blacklist-manager-panel select {
    flex: 1;
    min-width: 120px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    color: var(--text2, #000);
    background-color: var(--bg1, #fff);
  }

  .bilibili-blacklist-setting-select-row {
    margin-bottom: 8px;
  }

  /* 面板结构 */
  .bilibili-blacklist-tabs {
    display: flex;
    border-bottom: 1px solid #f1f2f3;
  }

  .bilibili-blacklist-tab {
    padding: 12px 16px;
    cursor: pointer;
    font-weight: 500;
  }

  .bilibili-blacklist-panel-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .bilibili-blacklist-panel-header {
    padding: 16px;
    border-bottom: 1px solid #f1f2f3;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* 面板标题 + 统计明细（标题一次创建、只更新数值，见 refreshBlockCountDisplay） */
  .bilibili-blacklist-panel-title {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .bilibili-blacklist-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px 14px;
    font-size: 12px;
    line-height: 1.55;
    color: #909399;
  }

  .bilibili-blacklist-stats-group {
    grid-column: 1 / -1;
    margin-top: 4px;
    font-weight: 600;
    color: #fb7299;
  }

  .bilibili-blacklist-stat-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }

  .bilibili-blacklist-stat-row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bilibili-blacklist-stat-row > b {
    flex: 0 0 auto;
    font-weight: 600;
    color: var(--text2, #000);
  }

  /* 7 日趋势柱：高度按当周最大值归一，0 值画一条浅色底线 */
  .bilibili-blacklist-trend {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 30px;
    margin-top: 6px;
  }

  .bilibili-blacklist-trend-bar {
    flex: 1 1 0;
    min-width: 6px;
    height: 2px;
    background-color: #e3e5e8;
    border-radius: 2px 2px 0 0;
    transition: height 0.2s, background-color 0.2s;
  }

  /* 头部右侧操作按钮组：[展开/收起统计明细] [关闭面板] */
  .bilibili-blacklist-panel-actions {
    display: flex;
    align-items: flex-start;
    flex: 0 0 auto;
    gap: 8px;
    /* 头部变高（标题 + 可展开的统计明细）后，按钮贴右上角与标题对齐，而不是垂直居中 */
    align-self: flex-start;
    margin-top: 2px;
  }

  /* 展开/收起按钮：与关闭按钮同尺寸，中性底色 + 会翻转的箭头图标 */
  .bilibili-blacklist-panel-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--text2, #000);
    background-color: #f1f2f3;
    transition: background-color 0.2s;
  }

  .bilibili-blacklist-panel-toggle:hover {
    opacity: 1;
    background-color: #e3e5e7;
  }

  .bilibili-blacklist-panel-toggle svg {
    display: block;
    transition: transform 0.2s;
  }

  .bilibili-blacklist-panel-toggle.is-expanded svg {
    transform: rotate(180deg);
  }

  /* 关闭按钮：圆形底色 + 白色 X 图标（原实现是纯文本「×」，太小不显眼） */
  .bilibili-blacklist-panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: #fff;
    background-color: #fb7299;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    transition: background-color 0.2s, transform 0.2s;
  }

  .bilibili-blacklist-panel-close:hover {
    opacity: 1;
    background-color: #e05f86;
    transform: scale(1.06);
  }

  .bilibili-blacklist-panel-close svg {
    display: block;
  }

  .bilibili-blacklist-panel-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  /* 布局行 */
  .bilibili-blacklist-panel-row,
  .bilibili-blacklist-add-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bilibili-blacklist-panel-row > span:first-child {
    flex: 1;
  }

  .bilibili-blacklist-add-row {
    margin-bottom: 16px;
  }

  .bilibili-blacklist-setting-toggle {
    margin-bottom: 8px;
  }

  .bilibili-blacklist-setting-input-row {
    margin-top: 16px;
  }

  .bilibili-blacklist-temp-toggle {
    margin: 20px 0;
  }

  .bilibili-blacklist-cache-control {
    margin-bottom: 8px;
  }

  /* 列表项 */
  .bilibili-blacklist-list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f1f2f3;
  }

  .bilibili-blacklist-list-item > span {
    flex: 1;
  }

  .bilibili-blacklist-empty {
    text-align: center;
    padding: 16px;
    color: #999;
  }

  /* 免责声明（配置页底部） */
  .bilibili-blacklist-disclaimer {
    margin-top: 16px;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.6;
    color: #888;
    border-top: 1px dashed #e0e0e0;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
  }

  /* 按钮 */
  .bilibili-blacklist-panel-btn,
  .bilibili-blacklist-config-btn,
  .bilibili-blacklist-primary-btn {
    color: #fff;
    border: none;
    cursor: pointer;
  }

  .bilibili-blacklist-panel-btn {
    padding: 4px 8px;
    border-radius: 4px;
  }

  .bilibili-blacklist-config-btn {
    padding: 6px 12px;
    border-radius: 4px;
  }

  .bilibili-blacklist-config-btn-primary {
    background-color: #fb7299;
  }

  .bilibili-blacklist-config-btn-danger {
    background-color: #f56c6c;
  }

  .bilibili-blacklist-primary-btn {
    padding: 8px 16px;
    background: #fb7299;
    border-radius: 4px;
  }

  .bilibili-blacklist-number-input {
    width: 100px;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  /* ===== 顶栏管理按钮 ===== */
  #bilibili-blacklist-manager-button {
    cursor: pointer;
  }

  #bilibili-blacklist-manager-button .right-entry-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  #bilibili-blacklist-manager-button .right-entry__outside {
    margin-bottom: -5px;
  }

  #bilibili-blacklist-manager-button:hover svg {
    transform: scale(1.1);
  }

  #bilibili-blacklist-manager-button svg {
    transition: transform 0.2s;
  }

  /* ===== 卡比覆盖层 ===== */
  #bilibili-blacklist-kirby {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
    z-index: 10;
    border-radius: 6px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: opacity ${KIRBY_FADE_DURATION_MS / 1000}s ease;
  }

  #bilibili-blacklist-kirby.bilibili-blacklist-kirby-video {
    justify-content: flex-start;
  }

  #bilibili-blacklist-kirby svg {
    opacity: 0.15;
    filter: none;
    margin-top: -40px;
  }

  #bilibili-blacklist-kirby.bilibili-blacklist-kirby-blur-only svg {
    display: none !important;
  }

  #bilibili-blacklist-kirby.bilibili-blacklist-kirby-video svg {
    margin-top: -10px;
  }

  /* ===== 用户空间页屏蔽按钮 ===== */
  .bilibili-blacklist-up-block-btn-host {
    display: inline-flex;
    align-items: center;
  }

  .bilibili-blacklist-up-block-btn {
    width: 100px;
    height: 30px;
    margin-left: 10px;
    color: #fff;
    border-radius: 5px;
    border: 1px solid #fb7299;
  }

  /* ===== 灰度效果 ===== */
  .bilibili-blacklist-grayscale {
    filter: grayscale(95%);
  }
`);

function getCloseIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none" />
      </svg>
  `;
}

function getChevronIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 9 L12 15 L18 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
  `;
}

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

function fadeInKirbyOverlay(overlay) {
  if (!overlay) return;
  const pendingTimer = kirbyFadeTimers.get(overlay);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    kirbyFadeTimers.delete(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "0";
  void overlay.offsetHeight;
  overlay.style.opacity = "1";
}

function fadeOutKirbyOverlay(overlay) {
  if (!overlay) return;
  const pendingTimer = kirbyFadeTimers.get(overlay);
  if (pendingTimer) clearTimeout(pendingTimer);
  overlay.style.opacity = "0";
  kirbyFadeTimers.set(
    overlay,
    setTimeout(() => {
      kirbyFadeTimers.delete(overlay);
      if (overlay.isConnected && overlay.style.opacity === "0") {
        overlay.style.display = "none";
      }
    }, KIRBY_FADE_DURATION_MS)
  );
}

function cancelKirbyFade(overlay) {
  if (!overlay) return;
  const pendingTimer = kirbyFadeTimers.get(overlay);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    kirbyFadeTimers.delete(overlay);
  }
}

function restoreAllBlockedVideoOverlays() {
  if (isShowAllVideos) return;
  pruneDisconnectedBlockedCards();
  blockedVideoCards.forEach((card) => {
    const overlay = card.querySelector("#bilibili-blacklist-kirby");
    if (overlay) {
      card.style.visibility = "visible";
      fadeInKirbyOverlay(overlay);
    }
  });
}

function bindHoverRevealToCard(cardElement) {
  if (hoverRevealBoundCards.has(cardElement)) return;
  hoverRevealBoundCards.add(cardElement);

  cardElement.addEventListener("mouseenter", () => {
    const realCard = getRealVideoCardElement(cardElement);
    if (
      !globalPluginConfig.flagHoverReveal ||
      isShowAllVideos ||
      !blockedVideoCards.has(realCard)
    ) {
      return;
    }

    const overlayOnEnter = cardElement.querySelector(
      "#bilibili-blacklist-kirby"
    );
    cancelKirbyFade(overlayOnEnter);

    const existingTimer = hoverRevealTimers.get(cardElement);
    if (existingTimer) clearTimeout(existingTimer);

    const delaySeconds = Math.min(
      5,
      Math.max(0.1, Number(globalPluginConfig.hoverRevealDelaySeconds) || 1)
    );
    const timer = setTimeout(() => {
      hoverRevealTimers.delete(cardElement);
      if (!globalPluginConfig.flagHoverReveal || isShowAllVideos) return;

      const overlay = cardElement.querySelector(
        "#bilibili-blacklist-kirby"
      );
      if (overlay && blockedVideoCards.has(realCard)) {
        fadeOutKirbyOverlay(overlay);
      }
    }, delaySeconds * 1000);
    hoverRevealTimers.set(cardElement, timer);
  });

  cardElement.addEventListener("mouseleave", () => {
    const timer = hoverRevealTimers.get(cardElement);
    if (timer) {
      clearTimeout(timer);
      hoverRevealTimers.delete(cardElement);
    }

    if (isShowAllVideos) return;
    const overlay = cardElement.querySelector("#bilibili-blacklist-kirby");
    if (
      overlay &&
      blockedVideoCards.has(getRealVideoCardElement(cardElement))
    ) {
      fadeInKirbyOverlay(overlay);
    }
  });
}

function addDisplayOverlayToCard(cardElement, mode) {
  bindHoverRevealToCard(cardElement);
  if (cardElement.querySelector("#bilibili-blacklist-kirby") != null) return;
  const kirbyWrapper = document.createElement("div");
  kirbyWrapper.id = "bilibili-blacklist-kirby";
  if (mode === "blur") {
    kirbyWrapper.classList.add("bilibili-blacklist-kirby-blur-only");
  } else {
    kirbyWrapper.innerHTML = getKirbySVG();
  }
  if (isCurrentPageVideo()) {
    kirbyWrapper.classList.add("bilibili-blacklist-kirby-video");
  }

  const svg = kirbyWrapper.querySelector("svg");
  if (svg) {
    const cardRect = cardElement.getBoundingClientRect();
    const size = Math.min(cardRect.width, cardRect.height) * 0.8;
    svg.setAttribute("width", `${size}px`);
    svg.setAttribute("height", `${size}px`);
  }

  const hostElement = isCurrentPageCategory()
    ? cardElement.querySelector(".bili-video-card") || cardElement
    : isCurrentPageDynamic()
      ? cardElement.querySelector(".bili-dyn-card-video") || cardElement
      : cardElement;

  const hostStyle = getComputedStyle(hostElement);
  if (hostStyle.position === "static" || !hostStyle.position) {
    hostElement.style.position = "relative";
  }

  hostElement.appendChild(kirbyWrapper);
}

function removeKirbyOverlay(cardElement) {
  const kirbyWrapper = cardElement.querySelector("#bilibili-blacklist-kirby");
  if (kirbyWrapper) {
    kirbyWrapper.remove();
  }
}

document.addEventListener("visibilitychange", () => {
  isPageCurrentlyActive = !document.hidden;
});

const INCREMENTAL_CARD_SELECTOR =
  ".bili-video-card, .video-page-card-small, .feed-card, .bili-dyn-list__item";
let seenCards = new WeakSet();
const seenAdElements = new WeakSet();
let videoHeaderReady = false;
let observedRoot = null;
let observedTarget = "";
let headerButtonScheduled = false;
const OBSERVER_CONTAINER_WAIT_MS = 15000;
let observerWaitStartedAt = 0;

const PLUGIN_OWNED_SELECTOR =
  ".bilibili-blacklist-block-container, #bilibili-blacklist-kirby, " +
  "#bilibili-blacklist-manager-button, #bilibili-blacklist-manager-panel";

function collectMatchingElements(node, selectorText, out) {
  if (!selectorText) return;
  if (node.closest && node.closest(PLUGIN_OWNED_SELECTOR)) return;
  const self = node.closest ? node.closest(selectorText) : null;
  if (self) {
    out.push(self);
    return;
  }
  const inside = node.querySelectorAll ? node.querySelectorAll(selectorText) : [];
  for (let i = 0; i < inside.length; i++) out.push(inside[i]);
}

function scheduleHeaderButtonRefresh() {
  if (headerButtonScheduled) return;
  headerButtonScheduled = true;
  setTimeout(() => {
    headerButtonScheduled = false;
    addBlacklistManagerButton();
  }, globalPluginConfig.blockScanInterval);
}

const contentObserver = new MutationObserver((mutations) => {
  const foundCards = [];
  const foundAds = [];
  const adSelectorText = isCurrentPageVideo()
    ? VIDEO_AD_SELECTOR_TEXT
    : MAIN_AD_SELECTOR_TEXT;
  const cardSelectorText = isCurrentPageRanking()
    ? INCREMENTAL_CARD_SELECTOR + ", " + RANKING_CARD_SELECTOR
    : INCREMENTAL_CARD_SELECTOR;

  mutations.forEach((mutation) => {
    const addedNodes = mutation.addedNodes;
    for (let i = 0; i < addedNodes.length; i++) {
      const node = addedNodes[i];
      if (node.nodeType !== 1) continue;
      collectMatchingElements(node, cardSelectorText, foundCards);
      collectMatchingElements(node, adSelectorText, foundAds);
    }
  });

  const fresh = [];
  for (let k = 0; k < foundCards.length; k++) {
    const card = foundCards[k];
    if (seenCards.has(card)) continue;
    seenCards.add(card);
    fresh.push(card);
    processCard(card);
  }

  let freshAdCount = 0;
  for (let k = 0; k < foundAds.length; k++) {
    const adElement = foundAds[k];
    if (seenAdElements.has(adElement)) continue;
    seenAdElements.add(adElement);
    freshAdCount++;
  }

  if (fresh.length > 0) {
    if (videoCardProcessQueue.size > 0 && !isVideoCardQueueProcessing) {
      processVideoCardQueue();
    }
    refreshBlockCountDisplay();
    if (isCurrentPageMain()) fixMainPageLayout();
  }

  if (fresh.length > 0 || freshAdCount > 0) {
    if (isCurrentPageVideo()) {
      scheduleVideoAdProcessing();
    } else if (isCurrentPageMain() || isCurrentPageSearch()) {
      scheduleMainPageAdProcessing();
    }
  }

  scheduleHeaderButtonRefresh();
});

function waitForContainer(selector, onFound, intervalMs = 250, timeoutMs = 15000) {
  const find = () => {
    const el = document.getElementById(selector) || document.querySelector(selector);
    if (el) {
      clearInterval(timer);
      clearTimeout(timeout);
      onFound(el);
    }
  };
  const timer = setInterval(find, intervalMs);
  const timeout = setTimeout(() => clearInterval(timer), timeoutMs);
  find();
}

function resetSeenCards() {
  seenCards = new WeakSet();
}

function initializeObserver(containerIdOrSelector) {
  observedTarget = containerIdOrSelector;
  const rootNode =
    document.getElementById(containerIdOrSelector) ||
    document.querySelector(containerIdOrSelector);

  if (rootNode) {
    observedRoot = rootNode;
    observerWaitStartedAt = 0;
    contentObserver.observe(rootNode, {
      childList: true,
      subtree: true,
    });
    return;
  }

  if (isCurrentPageVideo()) {
    console.log(
      "[🫥BlackList] 观察容器尚未挂载，等待其出现后再观察（避免回退整页干扰 header）:",
      containerIdOrSelector
    );
    observerWaitStartedAt = Date.now();
    waitForContainer(
      containerIdOrSelector,
      (el) => {
        observerWaitStartedAt = 0;
        observedRoot = el;
        contentObserver.observe(el, {
          childList: true,
          subtree: true,
        });
      },
      250,
      OBSERVER_CONTAINER_WAIT_MS
    );
    return;
  }

  observedRoot = document.documentElement;
  observerWaitStartedAt = 0;
  contentObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function ensureObserverAttached() {
  if (!observedTarget) return false;
  if (observedRoot && observedRoot.isConnected) return false;
  if (
    !observedRoot &&
    Date.now() - observerWaitStartedAt < OBSERVER_CONTAINER_WAIT_MS
  ) {
    return false;
  }
  console.log("[🫥BlackList] 观察根节点已失效，重新绑定观察器:", observedTarget);
  contentObserver.disconnect();
  observedRoot = null;
  observerWaitStartedAt = 0;
  initializeObserver(observedTarget);
  return true;
}

function initializeScript() {
  if (!isfirstLoad) return;
  isfirstLoad = false;
  isBlockingOperationInProgress = false;
  lastBlockScanExecutionTime = 0;
  blockedVideoCards = new Set();
  videoCardProcessQueue = new Set();
  tnameDecorateQueue = new Set();
  processedVideoCards = new WeakSet();
  queuedRealCards = new WeakSet();
  tnameRetriedCards = new WeakSet();
  videoTagRetriedCards = new WeakSet();

  setupCardButtonDelegation();

  if (isCurrentPageMain()) {
    initializeMainPage();
    blockMainPageAds();
  } else if (isCurrentPageSearch()) {
    initializeSearchPage();
    blockMainPageAds();
  } else if (isCurrentPageVideo()) {
    initializeVideoPage();
    updateTNameList();
  } else if (isCurrentPageCategory()) {
    initializeCategoryPage();
    updateTNameList();
  } else if (isCurrentPageRanking()) {
    initializeRankingPage();
    blockMainPageAds();
  } else if (isCurrentPageDynamic()) {
    initializeDynamicPage();
  } else if (isCurrentUserSpace()) {
    initializeUserSpace();
  } else {
    return;
  }
  createBlacklistPanel();
  addBlacklistManagerButton();
  initTampermonkeyMenu();
  startBlockStatsFlusher();
  if (globalPluginConfig.flagNetworkIntercept) {
    installNetworkInterceptors();
  }
  console.log("[🫥BlackList] 脚本已加载🥔");
}
let isfirstLoad = true;
document.addEventListener("DOMContentLoaded", initializeScript);

function isCurrentPageMain() {
  if (location.hostname !== "www.bilibili.com") return false;
  return location.pathname === "/" || location.pathname === "/index.html";
}

function initializeMainPage() {
  initializeObserver("feedchannel-main");
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 主页已加载🍓");
}

function isCurrentPageDynamic() {
  return location.hostname === "t.bilibili.com";
}

function initializeDynamicPage() {
  initializeObserver(".bili-dyn-list");
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 动态页已加载📰");
}

function isCurrentPageSearch() {
  return location.hostname === "search.bilibili.com";
}

function initializeSearchPage() {
  initializeObserver("i_cecream");
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  lastSearchPageKey = getSearchPageKey();
  installUrlChangeWatcher(watchSearchPageChange);
  setInterval(watchSearchPageChange, 2000);
  console.log("[🫥BlackList] 搜索页已加载🍉");
}

function getSearchPageKey() {
  let params;
  try {
    params = new URLSearchParams(location.search);
  } catch (e) {
    return location.pathname + location.search;
  }
  const fields = ["keyword", "page", "order", "duration", "tids", "search_type"];
  return (
    location.pathname +
    "|" +
    fields.map((name) => `${name}=${params.get(name) || ""}`).join("&")
  );
}

function watchSearchPageChange() {
  if (!isCurrentPageSearch()) return false;
  const key = getSearchPageKey();
  if (!lastSearchPageKey) {
    lastSearchPageKey = key;
    return false;
  }
  if (key === lastSearchPageKey) return false;
  lastSearchPageKey = key;
  console.log("[🫥BlackList] 搜索页翻页/条件变化，重置卡片处理状态:", key);
  resetSearchPageCardState();
  return true;
}

function resetSearchPageCardState() {
  processedVideoCards = new WeakSet();
  queuedRealCards = new WeakSet();
  tnameRetriedCards = new WeakSet();
  videoTagRetriedCards = new WeakSet();
  resetSeenCards();

  const cards = queryAllVideoCards();
  if (cards) cards.forEach((card) => resetCardDecorations(card));

  lastBlockScanExecutionTime = 0;
  scanAndBlockVideoCards();
  [400, 1200, 2500].forEach((delay) => {
    setTimeout(() => {
      lastBlockScanExecutionTime = 0;
      scanAndBlockVideoCards();
    }, delay);
  });
}

function isCurrentPageVideo() {
  return location.pathname.startsWith("/video/");
}

const VIDEO_PAGE_SETTLE_MS = 5000;
const VIDEO_PAGE_HEADER_WAIT_MS = 15000;
let videoPageProcessingStarted = false;

function initializeVideoPage() {
  console.log("[🫥BlackList] 播放页已加载（未处理卡片先 filter 遮盖，等 header 正常后启动）。🍇");

  markAllVideoCardsPending();
  markVideoPageAdsPending();

  videoHeaderReady = false;
  videoPageProcessingStarted = false;
  setTimeout(
    () =>
      waitForContainer(
        ".right-entry",
        () => {
          videoHeaderReady = true;
          addBlacklistManagerButton();
          refreshBlockCountDisplay();
          startVideoPageProcessing();
        },
        250,
        VIDEO_PAGE_HEADER_WAIT_MS
      ),
    VIDEO_PAGE_SETTLE_MS
  );

  setTimeout(() => {
    if (videoPageProcessingStarted) return;
    console.warn(
      "[🫥BlackList] 顶栏 .right-entry 未在预期时间内出现，强制启动播放页处理（跳过顶栏管理按钮）。"
    );
    videoHeaderReady = false;
    startVideoPageProcessing();
  }, VIDEO_PAGE_SETTLE_MS + VIDEO_PAGE_HEADER_WAIT_MS + 1000);

  console.log("[🫥BlackList] 视频播放页已就绪：等待 header 正常后启动屏蔽功能。\n");
}

function startVideoPageProcessing() {
  if (videoPageProcessingStarted) return;
  videoPageProcessingStarted = true;
  initializeObserver("#right-container, .right-container");
  scanAndBlockVideoCards();
  resolveVideoPageAds();
  lastSeenVideoBv = getVideoSwitchKey();
  installVideoSwitchWatcher();
  setInterval(() => {
    scanAndBlockVideoCards();
    ensureObserverAttached();
    if (!watchVideoSwitch()) {
      resolveVideoPageAds();
    }
  }, 2500);
  initAutoplaySkip();
  console.log("[🫥BlackList] 视频播放页屏蔽功能已启动（header 已正常）。🍇");
}

let lastSeenVideoBv = "";
let lastSearchPageKey = "";
let urlChangeHandlers = [];
let urlChangeWatcherInstalled = false;

function getVideoSwitchKey() {
  const bvFromUrl = getBvFromUrl();
  if (bvFromUrl) return bvFromUrl;
  return getCurrentBv() || "";
}

function watchVideoSwitch() {
  if (!isCurrentPageVideo()) return false;
  const bv = getVideoSwitchKey();
  if (!bv) return false;
  if (!lastSeenVideoBv) {
    lastSeenVideoBv = bv;
    return false;
  }
  if (bv === lastSeenVideoBv) return false;
  lastSeenVideoBv = bv;
  console.log("[🫥BlackList] 检测到页面内切换视频，广告重新覆盖并等待新元素:", bv);
  onVideoSwitchedAds();
  return true;
}

function installVideoSwitchWatcher() {
  installUrlChangeWatcher(watchVideoSwitch);
}

function installUrlChangeWatcher(handler) {
  if (typeof handler === "function" && urlChangeHandlers.indexOf(handler) === -1) {
    urlChangeHandlers.push(handler);
  }
  if (urlChangeWatcherInstalled) return;
  urlChangeWatcherInstalled = true;

  const notify = () => {
    urlChangeHandlers.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error("[🫥BlackList] URL 变化处理出错:", e);
      }
    });
  };

  window.addEventListener("popstate", notify);
  try {
    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        const result = original.apply(this, arguments);
        notify();
        return result;
      };
    });
  } catch (e) {
    console.warn("[🫥BlackList] 无法包装 history 方法，改由定时兜底检测 URL 变化:", e);
  }
}



function isCurrentPageCategory() {
  return location.pathname.startsWith("/c/");
}

function initializeCategoryPage() {
  initializeObserver("app");
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 分类页已加载🍊");
}

function isCurrentPageRanking() {
  return /^\/(v\/popular(\/rank.*)?|ranking)/.test(location.pathname);
}

const RANKING_CARD_SELECTOR = ".bili-video-card, .rank-item, .video-card, .rank-card";

function initializeRankingPage() {
  initializeObserver("app");
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 600);
  console.log("[🫥BlackList] 排行榜页已加载🏆");
}

function isCurrentUserSpace() {
  return location.hostname === "space.bilibili.com";
}

function initializeUserSpace() {
  console.log("[🫥BlackList] 用户空间已加载🍎");
  const upNameSelector = "#h-name, .nickname";
  const observerForUpName = new MutationObserver((mutations, observer) => {
    const upNameElement = document.querySelector(upNameSelector);
    if (upNameElement) {
      observer.disconnect();
      addBlockButtonToUserSpace(upNameElement);
    }
  });

  observerForUpName.observe(document.body, {
    childList: true,
    subtree: true,
  });
  const initialUpNameElement = document.querySelector(upNameSelector);
  if (initialUpNameElement) {
    observerForUpName.disconnect();
    addBlockButtonToUserSpace(initialUpNameElement);
  }
}

function addBlockButtonToUserSpace(upNameElement) {
  const upName = upNameElement.textContent.trim();
  if (upNameElement.querySelector(".bilibili-blacklist-up-block-btn")) {
    return;
  }

  upNameElement.classList.add("bilibili-blacklist-up-block-btn-host");

  const button = document.createElement("button");
  button.className = "bilibili-blacklist-up-block-btn";
  button.textContent = "屏蔽";

  const refreshButtonStatus = () => {
    const blocked = isBlacklisted(upName);
    if (blocked) {
      button.textContent = "已屏蔽";
      button.style.backgroundColor = "#dddddd";
      button.style.border = "1px solid #ccc";
      upNameElement.style.textDecoration = "line-through";
      document.body.classList.add("bilibili-blacklist-grayscale");
    } else {
      button.textContent = "屏蔽";
      button.style.backgroundColor = "#fb7299";
      button.style.border = "1px solid #fb7299";
      upNameElement.style.textDecoration = "none";
      document.body.classList.remove("bilibili-blacklist-grayscale");
    }
  };

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const blocked = isBlacklisted(upName);
    if (blocked) {
      removeFromExactBlacklist(upName);
    } else {
      addToExactBlacklist(upName);
    }
    refreshButtonStatus();
  });

  refreshButtonStatus();

  upNameElement.appendChild(button);
}



const MAIN_AD_SELECTORS = [
  ".floor-single-card",
  ".bili-live-card",
  ".btn-ad",
];
const MAIN_AD_SELECTOR_TEXT = MAIN_AD_SELECTORS.join(", ");

const VIDEO_AD_SELECTORS = [
  ".video-card-ad-small",
  ".slide-ad-exp",
  ".video-page-game-card-small",
  ".activity-m-v1",
  ".video-page-special-card-small",
  ".ad-floor-exp",
  ".btn-ad",
  ".video-page-operator-card-small",
  ".ad-report",
  ".slide_ad",
];
const VIDEO_AD_SELECTOR_TEXT = VIDEO_AD_SELECTORS.join(", ");

const AD_DONE_ATTR = "data-bl-ad-done";
const AD_PENDING_CLASS = "bilibili-blacklist-ad-pending";
const VIDEO_AD_PENDING_MAX_MS = 1500;

let videoAdProcessScheduled = false;
let mainAdProcessScheduled = false;
let videoAdPendingReleaseTimer = null;

GM_addStyle(`
  ${VIDEO_AD_SELECTORS.map(
    (selector) => `html.${AD_PENDING_CLASS} ${selector}:not([${AD_DONE_ATTR}])`
  ).join(",\n  ")} {
    filter: ${PENDING_FILTER_STYLE} !important;
    pointer-events: none !important;
  }
`);

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

function markVideoPageAdsPending() {
  if (!isCurrentPageVideo()) return;
  if (!globalPluginConfig.flagAD) return;
  if (!globalPluginConfig.flagHideOnLoad) return;
  if (isShowAllVideos) return;
  document.documentElement.classList.add(AD_PENDING_CLASS);
}

function clearVideoPageAdsPending() {
  if (videoAdPendingReleaseTimer) {
    clearTimeout(videoAdPendingReleaseTimer);
    videoAdPendingReleaseTimer = null;
  }
  document.documentElement.classList.remove(AD_PENDING_CLASS);
}

function resolveAdElement(adElement) {
  if (!adElement || adElement.nodeType !== 1) return false;
  if (!globalPluginConfig.flagAD) return false;
  if (adElement.hasAttribute(AD_DONE_ATTR)) return false;
  adElement.setAttribute(AD_DONE_ATTR, "1");
  hideVideoCard(adElement, "ad");
  return true;
}

function resolveVideoPageAds() {
  if (!isCurrentPageVideo()) return 0;
  let blockedCount = 0;
  document.querySelectorAll(VIDEO_AD_SELECTOR_TEXT).forEach((adElement) => {
    if (resolveAdElement(adElement)) blockedCount++;
  });
  clearVideoPageAdsPending();
  if (blockedCount > 0) {
    refreshBlockCountDisplay();
  }
  return blockedCount;
}

function scheduleVideoAdProcessing() {
  if (!isCurrentPageVideo()) return;
  if (videoAdProcessScheduled) return;
  videoAdProcessScheduled = true;
  setTimeout(() => {
    videoAdProcessScheduled = false;
    if (!videoHeaderReady) return;
    resolveVideoPageAds();
  }, globalPluginConfig.blockScanInterval);
}

function scheduleMainPageAdProcessing() {
  if (mainAdProcessScheduled) return;
  mainAdProcessScheduled = true;
  setTimeout(() => {
    mainAdProcessScheduled = false;
    blockMainPageAds();
  }, globalPluginConfig.blockScanInterval);
}

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

function blockMainPageAds() {
  if (!globalPluginConfig.flagAD) return;
  document.querySelectorAll(MAIN_AD_SELECTOR_TEXT).forEach((adCard) => {
    hideVideoCard(adCard, "ad");
  });
}

markVideoPageAdsPending();


let autoplayWatchTimer = null;
let lastSignature = "";
let isHandling = false;

const CURRENT_VIDEO_TITLE_SELECTORS = [
  "h1.video-info-title",
  "h1.video-title",
  "h1",
];
const CURRENT_VIDEO_UP_SELECTORS = [
  ".up-info-container .name",
  ".up-info .name",
  ".video-info .name",
  ".video-info-v2 .up-name",
  ".bili-video-info .up-name",
  ".up-name",
  ".up-info-container .upname a span",
  ".video-info .upname a span",
  ".video-info-container .upname a span",
  ".upname a span",
  ".upname a",
  ".upname",
];

function getBvFromUrl() {
  const m = location.pathname.match(/\/video\/(BV\w+)/);
  return m ? m[1] : null;
}

function getBvFromPlayer() {
  const p = window.player;
  if (!p) return null;
  const tries = [
    () => p.getVideoID && p.getVideoID(),
    () => p.getVideo && p.getVideo().bvid,
    () => p.getVideoInfo && p.getVideoInfo().bvid,
    () => p.__video && p.__video.bvid,
  ];
  for (const f of tries) {
    try {
      const v = f();
      if (typeof v === "string" && /^BV\w+/.test(v)) return v;
    } catch (e) {
    }
  }
  return null;
}

function getCurrentBv() {
  return getBvFromPlayer() || getBvFromUrl();
}

function getVideoPositionKey() {
  const p = window.player;
  if (p) {
    const tries = [
      () => p.getVideoData && p.getVideoData().cid,
      () => p.getVideoInfo && p.getVideoInfo().cid,
      () => p.__video && p.__video.cid,
      () => p.getCurrentVideo && p.getCurrentVideo().cid,
      () => p.getConfig && p.getConfig().cid,
      () => p.getVideoData && p.getVideoData().page && p.getVideoData().page.cid,
      () => p.getVideoInfo && p.getVideoInfo().page && p.getVideoInfo().page.cid,
      () => p.__playerData && p.__playerData.cid,
      () => p.__initedData && p.__initedData.cid,
    ];
    for (const f of tries) {
      try {
        const v = f();
        if (typeof v === "number" || (typeof v === "string" && v)) {
          return String(v);
        }
      } catch (e) {
      }
    }
  }
  try {
    const video = document.querySelector(
      "#bilibili-player video, .bilibili-player video, video"
    );
    if (video && video.currentSrc) {
      const m =
        video.currentSrc.match(/[?&]cid=(\d+)/) ||
        video.currentSrc.match(/\/cid\/(\d+)/);
      if (m) return "cid" + m[1];
    }
  } catch (e) {
  }
  const m = location.search.match(/[?&]p=(\d+)/);
  if (m) return "p" + m[1];
  try {
    const actives = document.querySelectorAll(
      ".video-episode-card__title.active, .video-episode-card__title.current, " +
      ".video-episode-card__title[aria-current], .bpx-player-ctrl-episode .active, " +
      ".bpx-player-ctrl-episode .current, .bpx-player-ctrl-episode [aria-current], " +
      ".list-box .active, .list-box .current, [class*='episode-card'] .active, " +
      "[class*='episode-card'] .current, .episode-item.active, .episode-item.current"
    );
    for (const el of actives) {
      const txt = (el.textContent || "").trim();
      if (txt) return "part:" + txt.slice(0, 40);
    }
  } catch (e) {
  }
  return "";
}

function getPlayingVideoInfo() {
  let title = "";
  for (const sel of CURRENT_VIDEO_TITLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      title = el.textContent.trim();
      break;
    }
  }
  let upName = "";
  for (const sel of CURRENT_VIDEO_UP_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      upName = el.textContent.trim();
      break;
    }
  }
  return { upName, title };
}


function buildBvInfoMapFromInitialState() {
  const map = {};
  const state =
    typeof unsafeWindow !== "undefined" ? unsafeWindow.__INITIAL_STATE__ : null;
  if (!state) return map;
  if (state.videoData && state.videoData.bvid) {
    map[state.videoData.bvid] = {
      upName: (state.videoData.owner && state.videoData.owner.name) || "",
      title: state.videoData.title || "",
    };
  }
  if (Array.isArray(state.related)) {
    for (const item of state.related) {
      if (!item.bvid) continue;
      map[item.bvid] = {
        upName: (item.owner && item.owner.name) || "",
        title: item.title || "",
      };
    }
  }
  return map;
}

function buildTitleInfoMapFromInitialState() {
  const map = {};
  const state =
    typeof unsafeWindow !== "undefined" ? unsafeWindow.__INITIAL_STATE__ : null;
  if (!state) return map;
  const add = (title, upName, bvid) => {
    if (!title || !upName) return;
    if (!map[title] || !map[title].upName) {
      map[title] = { upName, bvid };
    }
  };
  if (state.videoData && state.videoData.bvid) {
    add(state.videoData.title, state.videoData.owner && state.videoData.owner.name, state.videoData.bvid);
  }
  if (Array.isArray(state.related)) {
    for (const item of state.related) {
      add(item.title, item.owner && item.owner.name, item.bvid);
    }
  }
  return map;
}

function isVideoTagNameBlacklisted(data) {
  const checkTname = (tname) => {
    if (!tname) return false;
    if (tagNameBlacklist.includes(tname)) return true;
    const mapped = getTagNameByV2(tname);
    if (mapped !== null && tagNameBlacklist.includes(mapped)) return true;
    return false;
  };
  if (checkTname(data.tname)) return true;
  if (checkTname(data.tname_v2)) return true;
  if (data.tid_v2 !== undefined && data.tid_v2 !== null) {
    const obj = getTagNameById(data.tid_v2);
    if (obj) {
      if (checkTname(obj.name)) return true;
      if (obj.name_v2 && checkTname(obj.name_v2)) return true;
    }
  }
  return false;
}

function isVerticalVideo(data) {
  if (data.dimension && data.dimension.width && data.dimension.height) {
    const dimension = data.dimension.width / data.dimension.height;
    return dimension < globalPluginConfig.verticalScaleThreshold;
  }
  return false;
}

async function isBlockedByTagOrVertical(bvid) {
  const cfg = globalPluginConfig;
  if (!cfg.flagTName && !cfg.flagVertical) return false;
  if (!bvid) return false;
  const data = await getBilibiliVideoApiData(bvid);
  if (!data) return false;
  if (cfg.flagTName && isVideoTagNameBlacklisted(data)) return true;
  if (cfg.flagVertical && isVerticalVideo(data)) return true;
  return false;
}

async function isPlayingVideoBlacklisted(info, bv) {
  const cfg = globalPluginConfig;
  let upName = info.upName;
  let title = info.title;
  let bvid = bv;
  let resolved = false;

  if (title) {
    const byTitle = buildTitleInfoMapFromInitialState()[title];
    if (byTitle && byTitle.upName) {
      upName = byTitle.upName;
      if (byTitle.bvid) bvid = byTitle.bvid;
      resolved = true;
    }
  }
  if (!resolved && bvid) {
    const byBv = buildBvInfoMapFromInitialState()[bvid];
    if (byBv && byBv.upName) {
      upName = upName || byBv.upName;
      title = title || byBv.title;
      resolved = true;
    }
  }

  if (cfg.flagInfo && upName && isBlacklisted(upName, title)) {
    return true;
  }

  if (cfg.flagTName || cfg.flagVertical) {
    const data = bvid ? await getBilibiliVideoApiData(bvid) : null;
    if (data) {
      if (cfg.flagInfo && !upName) {
        const dUpName = (data.owner && data.owner.name) || "";
        if (dUpName && isBlacklisted(dUpName, data.title)) return true;
      }
      if (cfg.flagTName && isVideoTagNameBlacklisted(data)) return true;
      if (cfg.flagVertical && isVerticalVideo(data)) return true;
    }
  }

  return false;
}


function pauseCurrentPlayback() {
  const video = document.querySelector(
    "#bilibili-player video, .bilibili-player video, video"
  );
  if (video && !video.paused) {
    try {
      video.pause();
      return;
    } catch (e) {
    }
  }
  if (window.player && typeof window.player.pause === "function") {
    try {
      window.player.pause();
    } catch (e) {
    }
  }
}

function cancelAutoplay() {
  try {
    const btns = document.querySelectorAll(
      ".bpx-player-ending-related-item-cancel"
    );
    for (const btn of btns) {
      if (btn.getBoundingClientRect().height > 0) {
        btn.click();
        console.log("[🫥BlackList] 相关推荐全部被屏蔽，已取消自动连播。");
        return;
      }
    }
  } catch (e) {
  }
  pauseCurrentPlayback();
  console.log("[🫥BlackList] 相关推荐全部被屏蔽，已停止自动连播。");
}

function tryInPageSwitch(bvid) {
  const player = window.player;
  if (!player) return false;

  const trySwitch = (method, arg) => {
    if (typeof player[method] !== "function") return false;
    const ret = player[method](arg);
    return ret !== false;
  };

  const attempts = [
    () => trySwitch("changeVideo", { bvid }),
    () => trySwitch("switchVideo", { bvid }),
    () => trySwitch("loadVideo", { bvid }),
    () => trySwitch("changeVideo", bvid),
    () => trySwitch("switchVideo", bvid),
  ];
  for (const attempt of attempts) {
    try {
      if (attempt()) {
        console.log(
          `[🫥BlackList] 自动连播已切换到未屏蔽视频: ${bvid}`
        );
        return true;
      }
    } catch (e) {
    }
  }
  return false;
}

function clickRecommendCardByBv(bvid) {
  try {
    const links = document.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const m = href.match(/\/video\/(BV\w+)/);
      if (m && m[1] === bvid) {
        link.click();
        console.log(
          `[🫥BlackList] 自动连播已点击未屏蔽推荐卡片: ${bvid}`
        );
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function getFirstNonBlockedFromDom() {
  const cfg = globalPluginConfig;
  const cards = document.querySelectorAll(
    ".video-page-card-small, .bili-video-card"
  );
  for (const card of cards) {
    try {
      const real = getRealVideoCardElement(card);
      if (blockedVideoCards.has(real)) continue;
      if (real && real.style.display === "none") continue;
      if (real && real.querySelector("#bilibili-blacklist-kirby")) continue;
    } catch (e) {
    }
    const { upName, videoTitle } = getVideoCardInfo(card);
    if (!upName || !videoTitle) continue;
    if (cfg.flagInfo && isBlacklisted(upName, videoTitle)) continue;
    const bv = getCardVideoBvId(card);
    if (!bv) continue;
    if (await isBlockedByTagOrVertical(bv)) continue;
    return bv;
  }
  return null;
}

async function getFirstNonBlockedFromApi(curBv) {
  if (!curBv) return null;
  try {
    const res = await fetch(
      `https://api.bilibili.com/x/web-interface/archive/related?bvid=${curBv}`
    );
    const json = await res.json();
    if (json.code !== 0 || !Array.isArray(json.data)) return null;
    for (const item of json.data) {
      if (!item.bvid || item.bvid === curBv) continue;
      const upName = (item.owner && item.owner.name) || "";
      const title = item.title || "";
      if (!upName) continue;
      if (globalPluginConfig.flagInfo && isBlacklisted(upName, title)) {
        continue;
      }
      if (await isBlockedByTagOrVertical(item.bvid)) continue;
      return item.bvid;
    }
    return null;
  } catch (e) {
    console.error("[🫥BlackList] 获取相关推荐失败:", e);
    return null;
  }
}

function getAvailableVideoList() {
  const state =
    typeof unsafeWindow !== "undefined" ? unsafeWindow.__INITIAL_STATE__ : null;
  return state && Array.isArray(state.availableVideoList)
    ? state.availableVideoList
    : [];
}

async function getFirstNonBlockedFromAvailableList(curBv, infoMap) {
  const list = getAvailableVideoList();
  if (list.length === 0) return null;
  let start = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].bvid === curBv) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  for (let i = start + 1; i < list.length; i++) {
    const item = list[i];
    if (!item || !item.bvid) continue;
    const rel = infoMap[item.bvid] || {};
    if (!rel.upName) continue;
    if (globalPluginConfig.flagInfo && isBlacklisted(rel.upName, rel.title)) {
      continue;
    }
    if (await isBlockedByTagOrVertical(item.bvid)) continue;
    return item.bvid;
  }
  return null;
}

async function getFirstNonBlockedBv(curBv) {
  const fromDom = await getFirstNonBlockedFromDom();
  if (fromDom) return fromDom;
  const infoMap = buildBvInfoMapFromInitialState();
  const fromAvailableList = await getFirstNonBlockedFromAvailableList(
    curBv,
    infoMap
  );
  if (fromAvailableList) return fromAvailableList;
  return await getFirstNonBlockedFromApi(curBv);
}

async function handleBlockedVideo(info, bv) {
  const mode = globalPluginConfig.flagSkipBlockedAutoplay;
  if (mode === "off") return;

  const blocked = await isPlayingVideoBlacklisted(info, bv);
  if (!blocked) return;

  if (mode === "stop") {
    pauseCurrentPlayback();
    return;
  }

  const nextBv = await getFirstNonBlockedBv(bv);
  if (nextBv && nextBv !== bv) {
    if (tryInPageSwitch(nextBv)) {
      return;
    }
    if (clickRecommendCardByBv(nextBv)) {
      return;
    }
    location.href = `/video/${nextBv}`;
  } else if (!nextBv) {
    cancelAutoplay();
  }
}

function initAutoplaySkip() {
  if (autoplayWatchTimer) return;

  const check = async () => {
    if (document.hidden) return;
    const bv = getCurrentBv();
    if (!bv) {
      lastSignature = "";
      return;
    }
    const info = getPlayingVideoInfo();
    const cid = getVideoPositionKey();
    const signature = `${info.upName}||${info.title}||${bv}||${cid}`;
    if (signature === lastSignature) return;

    lastSignature = signature;

    if (isHandling) return;
    isHandling = true;
    try {
      await handleBlockedVideo(info, bv);
    } catch (e) {
      console.error("[🫥BlackList] 自动连播处理出错:", e);
    } finally {
      isHandling = false;
    }
  };

  autoplayWatchTimer = setInterval(check, 700);
  window.addEventListener("popstate", check);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  const onPlayback = () => check();
  ["playing", "loadstart", "loadedmetadata", "load", "emptied"].forEach(
    (evt) => document.addEventListener(evt, onPlayback, true)
  );
}

var NET_INTERCEPT = {
  enabled: false,
  rewrite: true,
  urlPatterns: [
    "/x/web-interface/wbi/index/top/feed/rcmd",
    "/x/web-interface/wbi/index/feed",
    "/x/web-interface/wbi/index/web/feed/rcmd",
    "/x/web-interface/archive/related"
  ],
  page: (typeof unsafeWindow !== "undefined") ? unsafeWindow : window
};

function netUrlMatches(url) {
  var patterns = NET_INTERCEPT.urlPatterns;
  for (var i = 0; i < patterns.length; i++) {
    if (url.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

var INTERCEPT_FIELD_PROBE = false;
function setInterceptFieldProbe(on) {
  INTERCEPT_FIELD_PROBE = !!on;
}
var PROBE_INTERESTING_KEYS = [
  "goto", "card_goto", "card_type", "bvid", "cid", "uri", "param",
  "tid", "tname", "tname_v2", "tid_v2", "duration",
  "is_ads", "cm_info", "ad_info", "business_info", "is_ad", "ad_cb",
  "rcmd_reason", "rcmd_reason_style", "reason", "is_followed", "is_up",
  "owner", "stat", "pubdate", "dimension", "track_id", "av_feature", "desc"
];
function probeInterceptPayload(url, parsed) {
  if (!INTERCEPT_FIELD_PROBE) return;
  try {
    var data = parsed && parsed.data;
    var items = null;
    if (data && Array.isArray(data.item)) items = data.item;
    else if (Array.isArray(data)) items = data;
    console.log("[🫥BlackList][probe] 命中接口: " + url);
    console.log(
      "[🫥BlackList][probe] data 形态: " +
        (Array.isArray(data) ? "(array, len=" + data.length + ")" : typeof data) +
        (data && !Array.isArray(data) && typeof data === "object"
          ? " keys=" + Object.keys(data).join(",")
          : "")
    );
    if (!items || items.length === 0) {
      console.log("[🫥BlackList][probe] 没有可分析的条目");
      return;
    }
    var first = items[0];
    console.log("[🫥BlackList][probe] 条目数=" + items.length);
    console.log("[🫥BlackList][probe] item[0] 全部字段: " + Object.keys(first).join(","));
    var picked = {};
    PROBE_INTERESTING_KEYS.forEach(function (k) {
      if (first[k] !== undefined) picked[k] = first[k];
    });
    console.log("[🫥BlackList][probe] 关注字段: " + JSON.stringify(picked));
    console.log(
      "[🫥BlackList][probe] item[0] 原样: " +
        JSON.stringify(first).slice(0, 2000)
    );
    var gotos = {};
    var withBiz = 0;
    var withTid = 0;
    var withTname = 0;
    var withAd = 0;
    var withDuration = 0;
    var count = Math.min(items.length, 12);
    for (var i = 0; i < count; i++) {
      var it = items[i];
      if (!it) continue;
      gotos[it.goto || "?"] = (gotos[it.goto || "?"] || 0) + 1;
      if (it.business_info) withBiz++;
      if (it.tid !== undefined) withTid++;
      if (it.tname || it.tname_v2) withTname++;
      if (it.is_ads || it.ad_info || it.cm_info || it.ad_cb) withAd++;
      if (it.duration !== undefined) withDuration++;
      console.log(
        "[🫥BlackList][probe] [" + i + "] goto=" + (it.goto || "?") +
        " tid=" + (it.tid === undefined ? "-" : it.tid) +
        " tname=" + (it.tname || it.tname_v2 || "-") +
        " dur=" + (it.duration === undefined ? "-" : it.duration) +
        " biz=" + (it.business_info ? JSON.stringify(it.business_info) : "-") +
        " rcmd=" + (it.rcmd_reason ? JSON.stringify(it.rcmd_reason) : "-") +
        " adField=" + (it.is_ads || it.ad_info || it.cm_info || it.ad_cb || "-") +
        " owner=" + ((it.owner && it.owner.name) || "-") +
        " title=" + String(it.title || "").slice(0, 24)
      );
    }
    console.log(
      "[🫥BlackList][probe] 分布: goto=" + JSON.stringify(gotos) +
      " | business_info 非空=" + withBiz +
      " | tid=" + withTid +
      " | tname=" + withTname +
      " | 广告字段=" + withAd +
      " | duration=" + withDuration +
      " / 共 " + count + " 条"
    );
  } catch (e) {
    console.log("[🫥BlackList][probe] 勘查失败: " + (e && e.message));
  }
}

var STREAM_REASON_TEXT = {
  ad: "广告",
  info: "UP/标题名",
  tname: "分类标签",
  videoTag: "视频标签",
  vertical: "竖屏"
};

function getStreamBlockReason(item) {
  if (!item) return null;

  if (globalPluginConfig.flagAD && item.business_info) {
    var biz = item.business_info;
    if (biz.is_ad_loc === true || biz.res_id || biz.creative_type || biz.ad_cb) {
      return "ad";
    }
  }

  var upName = (item.owner && item.owner.name) || "";
  var title = item.title || "";
  if ((upName || title) && isBlacklisted(upName, title)) return "info";

  var bvid = item.bvid || getLinkBvId(item.uri || "");
  if (!bvid) return null;

  var viewCached = bvApiDataCache.get(bvid);
  if (viewCached && viewCached.data && Date.now() < viewCached.expire) {
    if (globalPluginConfig.flagTName && isVideoTagNameBlacklisted(viewCached.data)) {
      return "tname";
    }
    if (globalPluginConfig.flagVertical && isVerticalVideo(viewCached.data)) {
      return "vertical";
    }
  }

  var tagCached = bvTagApiDataCache.get(bvid);
  if (
    globalPluginConfig.flagVideoTag &&
    tagCached &&
    tagCached.data &&
    Date.now() < tagCached.expire
  ) {
    var tags = getEligibleVideoTags(tagCached.data);
    for (var i = 0; i < tags.length; i++) {
      if (videoTagBlacklist.indexOf(tags[i]) !== -1) return "videoTag";
    }
  }

  return null;
}

function filterStreamItems(items) {
  var byReason = {};
  var removed = 0;
  var removedAds = 0;
  var kept = items.filter(function (item) {
    var reason = getStreamBlockReason(item);
    if (!reason) return true;
    removed++;
    if (reason === "ad") removedAds++;
    byReason[reason] = (byReason[reason] || 0) + 1;
    return false;
  });
  return { kept: kept, removed: removed, removedAds: removedAds, byReason: byReason };
}

function describeStreamReasons(byReason) {
  var parts = Object.keys(byReason).map(function (key) {
    return (STREAM_REASON_TEXT[key] || key) + " " + byReason[key];
  });
  return parts.length ? "（" + parts.join("、") + "）" : "";
}

function rewriteRecommendation(url, responseText) {
  try {
    var parsed = JSON.parse(responseText);
    if (!parsed || typeof parsed !== "object") return responseText;
    probeInterceptPayload(url, parsed);

    if (parsed.data && Array.isArray(parsed.data.item)) {
      var streamResult = filterStreamItems(parsed.data.item);
      if (streamResult.removed === 0) return responseText;
      parsed.data.item = streamResult.kept;
      countNetworkInterceptItems += streamResult.removed;
      countNetworkInterceptAds += streamResult.removedAds;
      countNetworkInterceptResponses++;
      refreshBlockCountDisplay();
      console.log(
        "[🫥BlackList] 网络拦截: 推荐流已过滤 " +
        streamResult.removed + " 条" + describeStreamReasons(streamResult.byReason)
      );
      return JSON.stringify(parsed);
    }

    if (Array.isArray(parsed.data)) {
      var relatedResult = filterStreamItems(parsed.data);
      if (relatedResult.removed === 0) return responseText;
      parsed.data = relatedResult.kept;
      countNetworkInterceptItems += relatedResult.removed;
      countNetworkInterceptAds += relatedResult.removedAds;
      countNetworkInterceptResponses++;
      refreshBlockCountDisplay();
      console.log(
        "[🫥BlackList] 网络拦截: 相关推荐已过滤 " +
        relatedResult.removed + " 条" + describeStreamReasons(relatedResult.byReason)
      );
      return JSON.stringify(parsed);
    }

    return responseText;
  } catch (e) {
    return responseText;
  }
}

function installNetworkInterceptors() {
  if (NET_INTERCEPT.enabled) return;
  var page = NET_INTERCEPT.page;
  if (!page || typeof page.fetch !== "function") return;
  NET_INTERCEPT.enabled = true;

  var originFetch = page.fetch.bind(page);
  page.fetch = function (input, init) {
    var url = "";
    if (typeof input === "string") {
      url = input;
    } else if (input && input.url) {
      url = input.url;
    } else if (init && init.url) {
      url = init.url;
    }
    return originFetch(input, init).then(function (res) {
      if (!NET_INTERCEPT.rewrite || !url || !netUrlMatches(url)) return res;
      return res.clone().text().then(function (text) {
        var rewritten = rewriteRecommendation(url, text);
        if (rewritten === text) return res;
        return new Response(rewritten, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers
        });
      });
    });
  };
}


if (
  (document.readyState === "complete" || document.readyState === "interactive") &&
  typeof isfirstLoad !== "undefined" &&
  isfirstLoad
) {
  initializeScript();
}

})();
