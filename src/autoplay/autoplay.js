/**
 * 自动连播处理模块。
 *
 * 背景：B站播放页(/video/BVxx) 开启“自动连播”后，播放器会自己从“相关推荐 / 接下来播放”里挑
 * 下一个视频播放。这个“下一个”来自播放器内部的推荐/播放列表数据，而不是右侧已经
 * 渲染出来的卡片；而且 B 站新版播放器是在页面内原地切换视频，地址栏 URL 不一定同步变。
 * 因此仅靠隐藏卡片（藏 DOM）或监听 URL 变化都不靠谱。
 *
 * 本模块的正确做法：识别“当前正在播放的视频”本身（读取播放器当前 UP 主名 + 标题，
 * 视切集时会原地更新），一旦发现当前播放的视频被屏蔽，就按配置
 * （globalPluginConfig.flagSkipBlockedAutoplay）采取三种行为之一：
 *     "skip"  切换到第一条未屏蔽的视频（避免继续播被屏蔽视频）
 *     "stop"  停止播放
 *     "off"   什么都不做（保留 B 站默认行为，继续播放被屏蔽的视频）
 */

// 内部运行状态
let autoplayWatchTimer = null; // 轮询定时器
let lastSignature = ""; // 上一次检测到的“当前播放视频”特征（UP名 + 标题 + BV + 分P）
let isHandling = false; // 防止多次处理并发

// 当前播放视频的标题选择器（B站标题通常为 h1）
const CURRENT_VIDEO_TITLE_SELECTORS = [
  "h1.video-info-title",
  "h1.video-title",
  "h1",
];
// 当前播放视频的 UP 主名选择器（视频信息栏附近；新版常用 .upname）
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

/**
 * 从 URL 提取 BV ID。
 * @returns {string|null}
 */
function getBvFromUrl() {
  const m = location.pathname.match(/\/video\/(BV\w+)/);
  return m ? m[1] : null;
}

/**
 * 尝试从 window.player 读取当前播放视频的 BV（比 URL 更贴近“正在播的视频”）。
 * @returns {string|null}
 */
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
      // 该方法不适用，继续尝试
    }
  }
  return null;
}

/**
 * 取当前播放视频的 BV：优先播放器，其次 URL。
 * @returns {string|null}
 */
function getCurrentBv() {
  return getBvFromPlayer() || getBvFromUrl();
}

/**
 * 取当前播放视频的位置标识（不是纯 CID）：优先播放器 CID，其次 URL 的 p 参数，
 * 最后退回分P标题；仅用于生成“是否换集/换视频”的特征串。
 * 多P视频切换分P时 BV/标题/UP 均不变，必须用分P信息才能感知切换。
 * @returns {string}
 */
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
        // 该方法不适用，继续尝试
      }
    }
  }
  // 直接看 <video> 的 currentSrc（切分P时 cid 会变）
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
    // 忽略
  }
  // 兜底：URL 的 p 参数
  const m = location.search.match(/[?&]p=(\d+)/);
  if (m) return "p" + m[1];
  // 兜底2：选集面板当前高亮分P（多P同BV时靠它感知切换）
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
    // 忽略
  }
  return "";
}

/**
 * 从页面 DOM 读取“当前正在播放的视频”的标题和 UP 主名。
 * 播放器在切集时会原地更新这些信息，因此它是判断“当前播放视频”最可靠的信号。
 * @returns {{upName: string, title: string}}
 */
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


/**
 * 从 __INITIAL_STATE__ 读取“bvid -> {upName, title}”映射。
 * 数据源：videoData（当前视频）+ related（推荐列表），二者都带 UP 主名/标题。
 * @returns {Object<string, {upName:string,title:string}>}
 */
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

/**
 * 从 __INITIAL_STATE__ 读取“title -> {upName, bvid}”映射。
 * 自动连播卡片里只显示标题、没有 UP 名，所以用标题去 __INITIAL_STATE__.related 里反查 UP 名最靠谱。
 * @returns {Object<string, {upName:string, bvid:string}>}
 */
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

/**
 * 判断视频数据是否命中“分类标签”黑名单（与卡片屏蔽逻辑一致）。
 * @param {object} data - 一个视频的 view 接口数据。
 * @returns {boolean}
 */
function isVideoTagNameBlacklisted(data) {
  const checkTname = (tname) => {
    if (!tname) return false;
    if (tagNameBlacklist.includes(tname)) return true;
    const mapped = getTagNameByV2(tname); // 若该名字是 V2 名，映射回主名再判断
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

/**
 * 判断视频是否为竖屏（与卡片屏蔽逻辑一致）。
 * @param {object} data - 一个视频的 view 接口数据。
 * @returns {boolean}
 */
function isVerticalVideo(data) {
  if (data.dimension && data.dimension.width && data.dimension.height) {
    const dimension = data.dimension.width / data.dimension.height;
    return dimension < globalPluginConfig.verticalScaleThreshold;
  }
  return false;
}

/**
 * 只依据 B 站 view 接口数据判断某 BV 是否“按分类标签 / 竖屏”被屏蔽（不依赖 DOM 是否已渲染标签组）。
 * @param {string} bvid - 视频 BV。
 * @returns {Promise<boolean>}
 */
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

/**
 * 判断“当前播放视频”是否被屏蔽，规则与卡片屏蔽完全一致：
 *   flagInfo（UP名/标题）、flagTName（分类标签）、flagVertical（竖屏）。
 * 权威来源是 __INITIAL_STATE__ 的 videoData/related（带 owner.name）：
 *   用标题反查 UP 名最靠谱（自动连播卡片只有标题、没有 UP 名），再按 bvid 反查，最后 view 接口兜底。
 * @param {{upName:string,title:string}} info - DOM 读取的信息。
 * @param {string} bv - 当前 BV。
 * @returns {Promise<boolean>}
 */
async function isPlayingVideoBlacklisted(info, bv) {
  const cfg = globalPluginConfig;
  let upName = info.upName;
  let title = info.title;
  let bvid = bv;
  let resolved = false;

  // 1) __INITIAL_STATE__ 按标题反查 UP 名 + bvid（自动连播卡片只有标题）
  if (title) {
    const byTitle = buildTitleInfoMapFromInitialState()[title];
    if (byTitle && byTitle.upName) {
      upName = byTitle.upName;
      if (byTitle.bvid) bvid = byTitle.bvid;
      resolved = true;
    }
  }
  // 2) __INITIAL_STATE__ 按 bvid 反查
  if (!resolved && bvid) {
    const byBv = buildBvInfoMapFromInitialState()[bvid];
    if (byBv && byBv.upName) {
      upName = upName || byBv.upName;
      title = title || byBv.title;
      resolved = true;
    }
  }

  // 3) 先用反查到的权威 UP名/标题做 UP名屏蔽（避免依赖已过期的 view 接口）
  if (cfg.flagInfo && upName && isBlacklisted(upName, title)) {
    return true;
  }

  // 4) 仅当开启了“标签/竖屏屏蔽”时，才拿 view 接口数据（含 tname/dimension）
  if (cfg.flagTName || cfg.flagVertical) {
    const data = bvid ? await getBilibiliVideoApiData(bvid) : null;
    if (data) {
      // 若还没拿到 UP名，用接口数据补一次
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


/**
 * 暂停当前播放。优先 <video>，其次 window.player。
 */
function pauseCurrentPlayback() {
  const video = document.querySelector(
    "#bilibili-player video, .bilibili-player video, video"
  );
  if (video && !video.paused) {
    try {
      video.pause();
      return;
    } catch (e) {
      // 忽略，继续尝试 player
    }
  }
  if (window.player && typeof window.player.pause === "function") {
    try {
      window.player.pause();
    } catch (e) {
      // 忽略
    }
  }
}

/**
 * 取消自动连播：点击 B 站播放器结局面板里的“取消连播”按钮；若按钮不可见则暂停兜底。
 * 当相关推荐全部被屏蔽时调用，比“暂停”更贴近 B 站原生语义。
 */
function cancelAutoplay() {
  try {
    const btns = document.querySelectorAll(
      ".bpx-player-ending-related-item-cancel"
    );
    for (const btn of btns) {
      // 只点可见的取消连播按钮
      if (btn.getBoundingClientRect().height > 0) {
        btn.click();
        console.log("[🫥BlackList] 相关推荐全部被屏蔽，已取消自动连播。");
        return;
      }
    }
  } catch (e) {
    // 忽略，走下方暂停兜底
  }
  pauseCurrentPlayback();
  console.log("[🫥BlackList] 相关推荐全部被屏蔽，已停止自动连播。");
}

/**
 * 尝试让播放器不刷新地切换到指定 BV（best-effort，方法名不稳定需运行时确认）。
 * @param {string} bvid
 * @returns {boolean} 是否成功触发切换。
 */
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
      // 该形态不适用，继续尝试下一种
    }
  }
  return false;
}

/**
 * 找到页面上指向指定 BV 的链接并点击它（不限右侧列表，覆盖相关推荐/接下来播放等）。
 * @param {string} bvid
 * @returns {boolean}
 */
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

/**
 * 从当前页面“相关推荐 / 接下来播放”卡片里找第一条未被屏蔽的视频 BV（DOM 优先，最贴近屏幕内容）。
 * 标签/竖屏用 B 站 view 接口（getBilibiliVideoApiData）精确判定，不依赖 DOM 是否已渲染标签组。
 * @returns {Promise<string|null>}
 */
async function getFirstNonBlockedFromDom() {
  const cfg = globalPluginConfig;
  const cards = document.querySelectorAll(
    ".video-page-card-small, .bili-video-card"
  );
  for (const card of cards) {
    // 跳过已被插件整体屏蔽（隐藏 / 卡比遮挡）的卡片
    try {
      const real = getRealVideoCardElement(card);
      if (blockedVideoCards.has(real)) continue;
      if (real && real.style.display === "none") continue;
      if (real && real.querySelector("#bilibili-blacklist-kirby")) continue;
    } catch (e) {
      // 忽略，继续
    }
    const { upName, videoTitle } = getVideoCardInfo(card);
    if (!upName || !videoTitle) continue;
    // UP名/标题屏蔽
    if (cfg.flagInfo && isBlacklisted(upName, videoTitle)) continue;
    const bv = getCardVideoBvId(card);
    if (!bv) continue;
    // 标签/竖屏屏蔽：用 view 接口精确判定
    if (await isBlockedByTagOrVertical(bv)) continue;
    return bv;
  }
  return null;
}

/**
 * 用 B 站相关推荐接口取第一条未被屏蔽的视频 BV（DOM 找不到时兜底）。
 * @param {string} curBv - 当前视频 BV。
 * @returns {Promise<string|null>}
 */
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
      // UP名/标题屏蔽
      if (globalPluginConfig.flagInfo && isBlacklisted(upName, title)) {
        continue;
      }
      // 标签/竖屏屏蔽：用 view 接口精确判定
      if (await isBlockedByTagOrVertical(item.bvid)) continue;
      return item.bvid;
    }
    return null;
  } catch (e) {
    console.error("[🫥BlackList] 获取相关推荐失败:", e);
    return null;
  }
}

/**
 * 读取 __INITIAL_STATE__.availableVideoList（B 站连播真正依据的有序“可播列表”）。
 * @returns {Array<{bvid:string,title:string}>}
 */
function getAvailableVideoList() {
  const state =
    typeof unsafeWindow !== "undefined" ? unsafeWindow.__INITIAL_STATE__ : null;
  return state && Array.isArray(state.availableVideoList)
    ? state.availableVideoList
    : [];
}

/**
 * 从 availableVideoList 里找“当前视频之后”的第一条未屏蔽视频 BV。
 * 这是连播最权威的“下一个”顺序；当前视频为 index 0，其后紧跟 related 推荐。
 * @param {string} curBv - 当前视频 BV。
 * @param {Object<string,{upName:string,title:string}>} infoMap - bvid -> {upName,title}。
 * @returns {string|null}
 */
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
  // 当前视频不在列表里（可能已播到 SSR 列表之外），交给 DOM/API 兜底，避免误取已播视频
  if (start < 0) return null;
  for (let i = start + 1; i < list.length; i++) {
    const item = list[i];
    if (!item || !item.bvid) continue;
    const rel = infoMap[item.bvid] || {};
    if (!rel.upName) continue; // 拿不到 UP 名，跳过，靠后续 DOM/API 兜底
    if (globalPluginConfig.flagInfo && isBlacklisted(rel.upName, rel.title)) {
      continue;
    }
    // 标签/竖屏屏蔽：用 view 接口精确判定
    if (await isBlockedByTagOrVertical(item.bvid)) continue;
    return item.bvid;
  }
  return null;
}

/**
 * 取第一条未屏蔽的视频 BV。
 * 优先级：页面 DOM 卡片（实时“接下来播放/相关推荐”，随切集更新）-> availableVideoList ->
 * 相关推荐 API。
 * @param {string} curBv - 当前播放视频 BV。
 * @returns {Promise<string|null>}
 */
async function getFirstNonBlockedBv(curBv) {
  // DOM 卡片是实时的，切集后会跟着更新；优先用它，避免用到页面加载时的旧缓存
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

/**
 * 处理“当前播放视频被屏蔽”的逻辑（按配置走三态）。
 * @param {{upName:string,title:string}} info - 当前播放视频信息。
 * @param {string} bv - 当前播放视频 BV。
 */
async function handleBlockedVideo(info, bv) {
  const mode = globalPluginConfig.flagSkipBlockedAutoplay;
  if (mode === "off") return; // 不处理：保留 B 站默认行为

  const blocked = await isPlayingVideoBlacklisted(info, bv);
  if (!blocked) return;

  if (mode === "stop") {
    pauseCurrentPlayback();
    return;
  }

  // mode === "skip"
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
    // 相关推荐全部被屏蔽：取消自动连播（点击“取消连播”按钮），按钮不可见则暂停兜底
    cancelAutoplay();
  }
}

/**
 * 初始化自动连播监听。
 * 每 700ms 读一次“当前播放视频”的信息（标题/UP名/BV），一旦发生变化（无论是切集还是
 * 加载了新视频），就检查其是否被屏蔽，并按配置选择“跳过/停止/不处理”。
 */
function initAutoplaySkip() {
  if (autoplayWatchTimer) return; // 防止重复初始化

  const check = async () => {
    // 页面在后台：不值得每 700ms 做一整套 DOM 探测。
    // 与队列的 isPageCurrentlyActive 一致 —— 后台不做判定，避免多开页面并发请求
    // （自动连播判断会打 view / archive/related 接口）触发限流；切回前台由 visibilitychange 立即补一次。
    if (document.hidden) return;
    const bv = getCurrentBv();
    if (!bv) {
      // 不在视频播放页，重置基准
      lastSignature = "";
      return;
    }
    const info = getPlayingVideoInfo();
    const cid = getVideoPositionKey();
    const signature = `${info.upName}||${info.title}||${bv}||${cid}`;
    if (signature === lastSignature) return; // 视频没变

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
  // 从后台切回前台：立即补一次检测（后台期间 check 直接返回，不消耗 DOM 探测）
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  // 捕获阶段监听播放事件（video 事件不冒泡，用 capture 才能捕捉），
  // 切集开始播放新视频时会触发一次检测，比轮询更快、更稳。
  const onPlayback = () => check();
  ["playing", "loadstart", "loadedmetadata", "load", "emptied"].forEach(
    (evt) => document.addEventListener(evt, onPlayback, true)
  );
}
