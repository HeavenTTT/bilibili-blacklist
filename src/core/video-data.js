/*
 * 视频数据模块
 * -----------------------------------------------------------
 * 队列串行处理，以及分类标签 / 竖屏的 API 判断。
 */
// 记录“第一次 tname 解析失败、已被重排回队列重试”的卡片（弱引用，随卡片回收释放）。
// 重试仍失败时按“无法确定是否安全”处理为放行（不再屏蔽）。
let tnameRetriedCards = new WeakSet();
// 记录“视频标签接口第一次无返回、已被重排回队列重试”的卡片（弱引用）。
// 重试仍失败时按“无法确定是否安全”处理为放行（不再屏蔽）。
let videoTagRetriedCards = new WeakSet();
// 页面是否可见/前台：切到后台（document.hidden，含被其它窗口完全遮挡）时暂停队列处理，切回后继续。
// 【有意设计，勿改】不要改成“后台也照常判定”：同时开多个 B 站页面时，多页并发请求
// view / /x/tag/archive/tags 会明显提高触发限流的概率，暂停判定等于把并发压回单页。
// 代价：后台页面里的卡片会一直停在「未处理」的模糊遮盖态 —— 刻意的视觉状态，不是 bug。
let isPageCurrentlyActive = true;
/**
 * 获取视频卡片的链接。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} 视频链接，如果未找到则返回null。
 */
function getCardHrefLink(cardElement) {
  const hrefLink = cardElement.querySelector("a");
  if (hrefLink) {
    return hrefLink.getAttribute("href");
  }
  return null;
}

/**
 * 取卡片里的 BV。
 *
 * 优先"指向 /video/ 的链接"：动态页的卡片是整条动态，第一个 <a> 往往是头像或"更多"，
 * 用 getCardHrefLink 会拿不到 BV（于是分类/视频标签判定整段跳过）。
 * 注意不要改 getCardHrefLink 本身：checkLinkCM 依赖"第一个 <a>"来识别 cm.bilibili.com 软广。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} BV ID，未找到返回 null。
 */
function getCardVideoBvId(cardElement) {
  const videoLink = cardElement.querySelector('a[href*="/video/"]');
  if (videoLink) return getLinkBvId(videoLink.getAttribute("href"));
  return getLinkBvId(getCardHrefLink(cardElement));
}

function checkLinkCM(link) {
  if (!link) return false;
  // 如果是cm.bilibili.com的链接，且启用了CM广告屏蔽，则隐藏卡片
  if (link.match(/cm.bilibili.com/) && globalPluginConfig.flagCM) {
    return true;
  }
  return false;
}
/**
 * 从视频链接中提取BV ID。
 * @param {string} link - 视频链接。
 * @returns {string|null} BV ID，如果未找到则返回null。
 */
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

/**
 * 使用BV ID从Bilibili API获取视频信息。
 * @param {string} bvid - 视频的BV ID。
 * @returns {Promise<object|null>} 解析为视频数据或null的Promise。
 */
// BV -> view 接口数据缓存（10 分钟），避免同一视频在多个页面/队列中重复请求
const bvApiDataCache = new Map();
const BV_API_CACHE_TTL = 10 * 60 * 1000;
// 单次接口请求超时：没有超时的话，一个挂起的请求会把整条串行队列永久卡死，
// 后面所有卡片都停在“未处理”状态（搜索页翻页后延迟十几秒的长尾来源之一）。
const BV_API_TIMEOUT_MS = 5000;
// 任意两次 B 站接口请求之间保持的最小间隔，防止连续/循环调用触发限流。
// 命中缓存不经过这里（只有真正发网络请求才等待）。默认 50ms。
const BV_API_MIN_INTERVAL_MS = 50;
let lastBvApiRequestAt = 0;
async function bvApiThrottle() {
  const now = Date.now();
  const wait = lastBvApiRequestAt + BV_API_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastBvApiRequestAt = Date.now();
}

/**
 * 判断某个 BV 是否已有未过期的接口缓存。
 * 用于决定本轮是否真的发生了网络请求 —— 只有真正请求了才需要限速等待。
 * @param {string} bvid
 * @returns {boolean}
 */
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
  await bvApiThrottle(); // 连续调用防限流
  countApiViewRequests++; // 统计：真实发出的 view 请求（命中缓存不会走到这里）
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
    // 修复：原实现在 catch 里没有 return，网络异常时返回 undefined，
    // 会落到调用方的“解析失败”分支被当成应屏蔽处理，导致网络抖动时大面积误屏蔽。
    console.error("[🫥BlackList] API 请求失败:", error);
    return null;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

// BV -> 视频标签接口数据缓存（10 分钟）
const bvTagApiDataCache = new Map();

function hasFreshBvTagApiCache(bvid) {
  if (!bvid) return false;
  const cached = bvTagApiDataCache.get(bvid);
  return !!(cached && Date.now() < cached.expire);
}

/**
 * 使用 BV ID 从 Bilibili 视频标签接口获取视频 TAG。
 * @param {string} bvid - 视频的 BV ID。
 * @returns {Promise<object|null>} 带 videoTags 字段的视频数据。
 */
async function getBilibiliVideoTagApiData(bvid) {
  if (!bvid || bvid.length >= 24) {
    return null;
  }
  const cached = bvTagApiDataCache.get(bvid);
  if (cached && Date.now() < cached.expire) {
    return cached.data;
  }
  await bvApiThrottle(); // 连续调用防限流
  countApiTagRequests++; // 统计：真实发出的视频标签请求（命中缓存不会走到这里）
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

/**
 * 只保留可用于屏蔽的视频标签：去掉背景音乐（bgm/music）和话题标签。
 * @param {unknown} tag - 视频标签接口返回的 TAG 对象或旧格式字符串。
 * @returns {string|null} 可展示的视频标签名。
 */
function normalizeVideoTagName(tag) {
  if (typeof tag === "string") {
    const name = tag.trim();
    return name && !name.startsWith("#") ? name : null;
  }
  if (!tag || typeof tag !== "object") return null;
  // 部分页面/接口会返回 tag_type / music_id，部分不会；
  // 统一要求 tag_id 与 tag_name 都能找到才保留。
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

/**
 * 返回卡片上第一个命中分类黑名单的标签名。
 *
 * 对卡片标签组里的每个标签按钮逐个判定：
 *   标签文本本身在 tagNameBlacklist，或按 V2 映射出的名称在黑名单中 → 视为命中。
 * 返回的标签名用于：屏蔽原因按钮显示具体内容、以及“取消屏蔽”时从黑名单删除该规则。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} 命中的标签名，没有则返回 null。
 */
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
      // 临时更新，根据V2查找名称
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

/**
 * 检查卡片是否包含任何黑名单标签（放行感知）。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {boolean} 如果有任何标签被列入黑名单，则返回true，否则返回false。
 */
function isCardBlacklistedByTagName(cardElement) {
  return !!getBlacklistedTagName(cardElement);
}

/**
 * 给标签组添加一个“汇总按钮 + 悬停浮层”：只显示一个「分类 N / 标签 M」按钮，
 * 数量为 0 时不添加；悬停/点击该按钮时，在卡片内弹出浮层展示该类别的全部标签。
 * 浮层作为标签组的子元素，内部按钮仍能被 getBlacklistedTagName/getBlacklistedVideoTag 匹配。
 * @param {HTMLElement} group - .bilibili-blacklist-tname-group 容器。
 * @param {string} label - 汇总按钮文案前缀（如“分类”/“标签”）。
 * @param {HTMLElement[]} buttons - 该类别的按钮元素（会被移入浮层）。
 * @param {string} color - 汇总按钮背景色。
 * @param {HTMLElement} card - 视频卡片元素。
 */
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
  // 悬停节流/防抖：300ms 内重复 show 只复用不重算定位；隐藏用 200ms 防抖避免抖动。
  const HIDE_DELAY_MS = 200;
  const SHOW_THROTTLE_MS = 300;
  const positionPopover = () => {
    popover.classList.add("show");
    const cr = card.getBoundingClientRect();
    // 宽度不超过卡片，避免被卡片溢出裁掉
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
    // 300ms 节流：快速进出同一卡片时，只确保显示，不重复 build/定位
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

/**
 * 返回卡片上第一个命中的视频标签黑名单项。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} 命中的视频标签名，没有则返回 null。
 */
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

/**
 * 请求接口并把分类标签按钮挂到卡片上。
 * 主判定与“补标签”两条路径共用。
 * @param {HTMLElement} card - 视频卡片元素。
 * @param {string} bvId - 卡片对应的 BV。
 * @returns {Promise<{data: object|null, tnameResolved: boolean, usedNetwork: boolean, viewFailed: boolean, videoTagFailed: boolean}>}
 *   data: 接口数据；tnameResolved: 是否解析出至少一个分类标签；usedNetwork: 本次是否真的发了请求；
 *   viewFailed / videoTagFailed: 对应接口本次是否无返回（供“重试一次 → 放行”判定）。
 */
async function attachTNameGroupToCard(card, bvId) {
  const needViewApi =
    globalPluginConfig.flagTName || globalPluginConfig.flagVertical;
  const needVideoTagApi = globalPluginConfig.flagVideoTag;
  // 预测“本轮是否真的会发请求”，供队列决定要不要限速等待：
  //   - 两个接口各自查自己的缓存：view → bvApiDataCache，tag → bvTagApiDataCache，
  //     不要互相串用（view 缓存新鲜不代表 tag 有缓存，反之亦然）；
  //   - 与两个请求函数的前置判断保持一致：无效/异常长度的 BV 会直接返回 null、不发请求，
  //     否则会把“没发请求”误判成发过请求而白等一次限速。
  const canRequestApi = !!bvId && bvId.length < 24;
  const usedNetwork =
    (needViewApi && canRequestApi && !hasFreshBvApiCache(bvId)) ||
    (needVideoTagApi && canRequestApi && !hasFreshBvTagApiCache(bvId));
  // 串行获取：先 view（分类/竖屏），再 tag（视频标签），不并发。
  const viewData = needViewApi ? await getBilibiliVideoApiData(bvId) : null;
  const videoTagData = needVideoTagApi
    ? await getBilibiliVideoTagApiData(bvId)
    : null;
  const data =
    viewData || videoTagData
      ? { ...(viewData || {}), ...(videoTagData || {}) }
      : null;
  // 两个接口的“本次是否无返回”（无返回 = code 非 0 / 请求失败 / 超时）：
  // 供队列做“重试一次 → 放行”判定。
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
      // 用 ensureBlockContainerOnCard 而不是 querySelector：解析不到 UP 名的卡片没有容器，
      // 旧实现会因此永远挂不上标签 → 被判为“tname 解析失败”→ 误屏蔽。
      const container = ensureBlockContainerOnCard(card);
      if (container) {
        const tnameGroup = document.createElement("div");
        tnameGroup.className = "bilibili-blacklist-tname-group";

        // 收集分类标签按钮（按文本去重）
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

        // 收集视频标签按钮（按文本去重）
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
          // 只显示两个汇总按钮（分类 N / 标签 M），数量为 0 则不显示；
          // 悬停/点击时在卡片内弹出浮层展示各自全部值。
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

/**
 * 处理视频卡片队列进行屏蔽。
 *
 * 判定顺序刻意分成两个阶段：
 *   阶段 A（零网络）：软广链接 > UP主名精确匹配 > 正则匹配。命中即可直接提交，
 *                    不发任何请求、也不需要限速等待。
 *   阶段 B（网络）  ：仅当阶段 A 未命中时，才请求 view 接口做分类标签/竖屏判定。
 * 已在阶段 A 命中的卡片，若开启 flagAlwaysFetchTName（默认开），会被放进低优先级的
 * “补标签队列”，等主队列判定完再补请求，保证标签按钮始终可见但不拖慢其它卡片的判定。
 */
async function processVideoCardQueue() {
  if (isVideoCardQueueProcessing) return;
  isVideoCardQueueProcessing = true;
  let localDecisionStreak = 0; // 连续“零网络判定”的卡片数，用于定期让出主线程

  while (videoCardProcessQueue.size > 0 || tnameDecorateQueue.size > 0) {
    // 页面切到后台：暂停处理（每 1s 重查一次，恢复可见后继续）。
    if (!isPageCurrentlyActive) {
      await sleep(1000);
      continue;
    }

    // ===== 补标签队列：优先级最低，只有主队列空了才处理 =====
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

    // processedVideoCards 以“真实卡片元素”为键（分类页会把内层 .bili-video-card 归一到
    // 外层 .feed-card），这里必须用同一套归一结果查询，否则同一张卡片的第二条记录会被重复判定。
    const realCardKey = card ? getRealVideoCardElement(card) || card : null;
    if (!card || processedVideoCards.has(realCardKey)) {
      continue;
    }
    // 翻页/切集后旧卡片已从文档移除：直接丢弃。
    // 否则它们照样各消耗一次 API 请求 + 一次限速等待，把新一页的卡片堵在队尾。
    // 用 === false 而不是 !card.isConnected：万一环境不支持 isConnected（undefined），
    // 取反会把所有卡片都跳过，等于整个屏蔽功能失效。
    if (card.isConnected === false) {
      continue;
    }

    let usedNetwork = false; // 本轮是否真的发起了网络请求（决定是否需要限速等待）
    let shouldHide = false;
    let blockType = "none";
    let blockReasonValue = null; // 具体屏蔽内容（UP 名 / 标签名 / REGEX_BLOCK_VALUE）

    // ===== 阶段 A：零网络判定（软广链接 > UP主名精确 > 正则）=====
    const link = getCardHrefLink(card); // 软广判定仍用"第一个 <a>"（cm.bilibili.com 靠它）
    const bvId = getCardVideoBvId(card); // BV 单独取：优先 /video/ 链接（动态页必需）
    if (checkLinkCM(link)) {
      shouldHide = true;
      blockType = "cm";
    }
    const { upName, videoTitle } = getVideoCardInfo(card);
    // 依据 UP 名/标题判定：只要解析到其中一个就参与判定（空 UP 名也能用正则匹标题，
    // 标题解析失败也能用 UP 名精确匹配）。两者都解析不到则交给阶段 B，避免误伤。
    // 精确匹配优先；命中即记录具体 UP 名（显示与取消用）。正则无法定位具体规则，记录哨兵值。
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

    // ===== 阶段 B：网络判定（分类标签 / 竖屏）=====
    if (
      !shouldHide &&
      (globalPluginConfig.flagTName ||
        globalPluginConfig.flagVideoTag ||
        globalPluginConfig.flagVertical) &&
      bvId
    ) {
      if (hasTNameGroup) {
        // 已有标签组（例如刚被“取消屏蔽”重新判定的卡片）：不重复挂标签，
        // 用（通常已缓存的）接口数据补做 tname/竖屏完整判定 —— 满足
        // “取消一次后重新完整检查，其它原因仍继续屏蔽”。
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
          // 如果启用了垂直视频屏蔽
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
        // data 为 null（缓存过期且请求失败）：不重试、不误屏蔽，按未命中处理。
      } else {
        // 首次挂标签：请求接口，挂标签组 + tname/竖屏判定
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
          // 视频标签接口无返回：重排到队尾重试一次，再次失败则放行（不再屏蔽）。
          if (
            globalPluginConfig.flagVideoTag &&
            !shouldHide &&
            result.videoTagFailed
          ) {
            if (!videoTagRetriedCards.has(card)) {
              videoTagRetriedCards.add(card);
              videoCardProcessQueue.add(card); // 加入队列最后（重新出队时排到最后）
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
          // 如果启用了垂直视频屏蔽
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

          // 开启了 tname 却没能解析出任何分类标签（数据缺失/结构变化）：
          // 重排到队尾重试一次，再次失败则放行（不再按屏蔽处理）。
          if (globalPluginConfig.flagTName && !shouldHide && !result.tnameResolved) {
            if (!tnameRetriedCards.has(card)) {
              tnameRetriedCards.add(card);
              videoCardProcessQueue.add(card); // 加入队列最后
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
          // 接口返回 null（请求失败/超时/限流/BV无效）：分类/视频标签解析失败。
          // 重排到队尾重试一次，再次失败则按放行处理（不再屏蔽）。
          const retriedSet = globalPluginConfig.flagTName
            ? tnameRetriedCards
            : videoTagRetriedCards;
          if (!retriedSet.has(card)) {
            retriedSet.add(card);
            videoCardProcessQueue.add(card); // 加入队列最后
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
      // 阶段 A 已命中：判定上不再需要接口。但按配置仍要显示分类标签按钮，
      // 于是放进低优先级补标签队列，等主队列判定完再补，不占用判定时间。
      tnameDecorateQueue.add(card);
    }

    // ===== 提交 =====
    if (shouldHide) {
      // 命中：先去掉“未处理”filter 遮盖，再走正式遮蔽（hide / kirby 遮罩 / 模糊）
      clearPendingFilter(card);
      hideVideoCard(card, blockType, blockReasonValue);
    } else {
      // 未命中：去掉“未处理”filter 遮盖，恢复原样显示
      clearPendingFilter(card);
      const realCardToDisplay = getRealVideoCardElement(card);
      unmarkBlockedCard(realCardToDisplay);
      removeBlockReason(card);
      removeKirbyOverlay(card); // 幂等：清理可能残留的遮罩（不再依赖 flagKirby）
      if (realCardToDisplay) {
        realCardToDisplay.style.display = "block";
        realCardToDisplay.style.visibility = "visible"; // 取消未处理阶段的遮盖（若有）
      }
    }

    processedVideoCards.add(realCardKey); // 标记卡片已处理（键为真实卡片元素）
    countProcessedCards++; // 统计：累计判定完成的卡片数

    // 只有真正发生网络请求时才限速：纯本地命中的卡片立即处理下一张。
    // （旧实现对每张卡片无差别 sleep 200ms，一页 30 张仅等待就要 6 秒。）
    if (usedNetwork) {
      localDecisionStreak = 0;
      await sleep(globalPluginConfig.processQueueInterval);
    } else if (++localDecisionStreak >= 20) {
      // 纯本地判定不限速，但连续处理很多张时主动让出主线程一次，
      // 避免超长列表下形成长任务造成页面卡顿；顺便刷新一次计数显示。
      localDecisionStreak = 0;
      refreshBlockCountDisplay();
      await sleep(0);
    }
  }
  isVideoCardQueueProcessing = false;
  refreshBlockCountDisplay();
  // 处理队列为空：触发分区表 feed 增量更新（popular / ranking，12 小时节流，内部自行判断）。
  updateTNameListFromFeed();
}

// 异步等待函数
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
