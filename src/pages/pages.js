/*
 * 页面模块
 * -----------------------------------------------------------
 * 按页面类型初始化并在 DOM 就绪后启动脚本。
 */
/**
 * 根据当前页面初始化脚本。
 */
function initializeScript() {
  if (!isfirstLoad) return;
  isfirstLoad = false;
  // 重置状态变量
  isBlockingOperationInProgress = false;
  lastBlockScanExecutionTime = 0;
  blockedVideoCards = new Set();
  videoCardProcessQueue = new Set();
  tnameDecorateQueue = new Set();
  processedVideoCards = new WeakSet();
  queuedRealCards = new WeakSet(); // 重置“已入队的真实卡片元素”去重表
  tnameRetriedCards = new WeakSet(); // 重置 tname 解析失败重试记录
  videoTagRetriedCards = new WeakSet(); // 重置视频标签接口重试记录

  // 统一的事件委托：所有“屏蔽/标签”按钮共用一个监听器，避免每按钮各自绑定点击导致失效。
  setupCardButtonDelegation();

  // 根据当前页面URL判断并初始化
  if (isCurrentPageMain()) {
    initializeMainPage();
    blockMainPageAds();
  } else if (isCurrentPageSearch()) {
    initializeSearchPage();
    blockMainPageAds(); // 搜索页也进行主页广告屏蔽
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
    return; // 不支持的页面不进行初始化
  }
  createBlacklistPanel(); // 创建管理面板
  addBlacklistManagerButton(); // 立即挂载管理按钮，避免在视频页被迟到的顶栏渲染顶掉前不可见；后续由观察器兜底
  initTampermonkeyMenu(); // 注册油猴菜单（顶部按钮开关 / 打开管理面板）
  startBlockStatsFlusher(); // 屏蔽统计：定时把本页增量按天落盘（面板显示今日/近7天/累计）
  // 网络拦截：命中黑名单的推荐/相关条目直接在响应层过滤
  if (globalPluginConfig.flagNetworkIntercept) {
    installNetworkInterceptors();
  }
  console.log("[🫥BlackList] 脚本已加载🥔");
}
let isfirstLoad = true;// 监听DOMContentLoaded并检查readyState以进行早期初始化
// initializeScript 内部已通过 isfirstLoad 保证只执行一次
document.addEventListener("DOMContentLoaded", initializeScript);
// 注意：这里不再做“立即初始化”检查，因为 initializeScript() 会依赖后续模块
// （interceptor.js 的 NET_INTERCEPT / ads.js / autoplay.js）在求值后才可用。
// 若在 pages.js 段就检查 readyState 并同步调用 initializeScript()，会在这些模块
// 尚未求值时访问到的变量仍为 undefined（例如 NET_INTERCEPT.enabled），导致构建被 eval 时崩溃。
// 该“晚注入立即初始化”逻辑已移到本 IIFE 的最后（src/main.js 末尾）执行。

/**
 * 检查当前页面是否为Bilibili主页。
 *
 * 必须同时校验 hostname：`t.bilibili.com/`（动态首页）的 pathname 也是 "/"，
 * 只看 pathname 会把它误判成主页（用过主页的选择器去扫动态，一张卡都命中不到）。
 * @returns {boolean} 如果是主页则返回true，否则返回false。
 */
function isCurrentPageMain() {
  if (location.hostname !== "www.bilibili.com") return false;
  return location.pathname === "/" || location.pathname === "/index.html";
}

/**
 * 初始化主页特有的功能。
 */
function initializeMainPage() {
  initializeObserver("feedchannel-main"); // 观察主页内容区域
  // 首屏卡片可能在 observer 挂载前已渲染，延迟补一次全量扫描（防漏扫）
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 主页已加载🍓");
}

/**
 * 检查当前页面是否为Bilibili动态页（t.bilibili.com）。
 * @returns {boolean} 如果是动态页则返回true，否则返回false。
 */
function isCurrentPageDynamic() {
  return location.hostname === "t.bilibili.com";
}

/**
 * 初始化动态页特有的功能。
 *
 * 动态页的"卡片"是整条动态（`.bili-dyn-list__item`，含转发/图文/视频投稿），
 * 屏蔽单位也按整条动态算；发布者取 `.bili-dyn-title__text`，视频标题取
 * `.bili-dyn-card-video__title`（见 core.js 的 getVideoCardInfo）。
 */
function initializeDynamicPage() {
  initializeObserver(".bili-dyn-list"); // 观察动态列表（找不到会回退观察整页）
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 动态页已加载📰");
}

/**
 * 检查当前页面是否为Bilibili搜索结果页。
 * @returns {boolean} 如果是搜索页则返回true，否则返回false。
 */
function isCurrentPageSearch() {
  return location.hostname === "search.bilibili.com";
}

/**
 * 初始化搜索页特有的功能。
 */
function initializeSearchPage() {
  initializeObserver("i_cecream"); // 观察搜索结果内容区域
  // 搜索结果可能在 observer 挂载前已渲染，延迟补一次全量扫描（防漏扫）
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  // 翻页/换关键词时重置处理状态并重扫（详见 watchSearchPageChange）
  lastSearchPageKey = getSearchPageKey();
  installUrlChangeWatcher(watchSearchPageChange);
  // 兜底：若翻页用的 pushState 被更早的引用绕过了我们的包装，这里靠低频比对 URL 兜住。
  // 只做一次字符串比较，开销可忽略。
  setInterval(watchSearchPageChange, 2000);
  console.log("[🫥BlackList] 搜索页已加载🍉");
}

/**
 * 取搜索页的“当前页面”标识。
 *
 * 刻意只取有意义的查询参数，不直接用整个 location.search：B 站会用 replaceState
 * 往 URL 上追加 spm_id_from 之类的埋点参数，直接比较整串会被误判为翻页，
 * 导致反复重置卡片状态、页面闪烁。
 * @returns {string}
 */
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

/**
 * 检测搜索页翻页 / 换关键词，并重置卡片处理状态后重新扫描。
 *
 * 需要重置的原因：观察器的 seenCards 与队列的 processedVideoCards 都按元素引用去重，
 * 若 B 站复用同一批卡片节点只替换内容，新一页的卡片会被判为“已处理”而完全不被处理；
 * 同时节点上还会残留上一页的屏蔽按钮（旧 UP 名）与分类标签（会造成 tname 误判）。
 * @returns {boolean} 本次调用是否检测到变化。
 */
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

/**
 * 重置搜索页的卡片处理状态，并安排几次重扫。
 *
 * 队列里上一页遗留的卡片不需要在这里清空：processVideoCardQueue 出队时会跳过
 * 已从文档移除的卡片，既不会浪费请求，也不会出现“清空队列导致卡片永久停在遮盖态”。
 */
function resetSearchPageCardState() {
  processedVideoCards = new WeakSet();
  queuedRealCards = new WeakSet(); // 翻页后节点可能被复用，去重表一并重置
  tnameRetriedCards = new WeakSet();
  videoTagRetriedCards = new WeakSet(); // 与 tname 重试记录一起重置，避免新一页的卡片被误判为“已重试过”
  resetSeenCards();

  // 清掉可能被复用节点带过来的旧装饰（屏蔽按钮/分类标签/遮罩/隐藏样式）
  const cards = queryAllVideoCards();
  if (cards) cards.forEach((card) => resetCardDecorations(card));

  // 立刻重扫一次（绕过扫描节流），再补几次延迟扫描，等新一页卡片渲染完成
  lastBlockScanExecutionTime = 0;
  scanAndBlockVideoCards();
  [400, 1200, 2500].forEach((delay) => {
    setTimeout(() => {
      lastBlockScanExecutionTime = 0;
      scanAndBlockVideoCards();
    }, delay);
  });
}

/**
 * 检查当前页面是否为Bilibili视频播放页。
 * @returns {boolean} 如果是视频播放页则返回true，否则返回false。
 */
function isCurrentPageVideo() {
  return location.pathname.startsWith("/video/");
}

/**
 * 初始化视频播放页特有的功能。
 *
 * 进入视频页时
 *   “未处理”状态（用 CSS filter 遮盖，不插入按钮/kirby 遮罩子元素，避免与 B 站 header
 *   的 Vue 渲染竞争 → 导致 header 被顶掉）。视频正常播放。
 *   先静默 VIDEO_PAGE_SETTLE_MS，再等右侧导航栏 .right-entry 渲染完成（header 完全正常），
 *   然后统一启动：观察器 + 扫描屏蔽 + 广告屏蔽 + 自动连播 + 补扫，并逐卡判定。
 */
// 进入播放页后的固定静默期：期间不碰 header、不启动处理（有意设计，见下方注释）
const VIDEO_PAGE_SETTLE_MS = 5000;
// 静默期结束后等待 .right-entry 出现的最长时间
const VIDEO_PAGE_HEADER_WAIT_MS = 15000;
// 播放页处理是否已启动（正常路径 / 顶栏未出现的兜底路径只启动一次）
let videoPageProcessingStarted = false;

function initializeVideoPage() {
  console.log("[🫥BlackList] 播放页已加载（未处理卡片先 filter 遮盖，等 header 正常后启动）。🍇");

  // 1) 进入页面：把当前已渲染的推荐卡片都标为“未处理”（filter 遮盖，不插 DOM 元素）
  markAllVideoCardsPending();
  // 广告同样先覆盖：加 pending class，由 CSS 统一罩住广告位。
  // （ads.js 求值期已调用过一次，这里再调一次是幂等的，用于覆盖配置在此期间被改动的情况）
  markVideoPageAdsPending();

  // 2) 故意先留一段静默期（VIDEO_PAGE_SETTLE_MS），再等 .right-entry 就绪后才启动完整处理。
  //
  //    为什么是「5s + 等元素」两步、而不是「等元素出现就启动」：
  //    B 站顶栏是 Vue 延迟渲染的，元素出现≠渲染完成；过早往 .right-entry 里插入我们的 li
  //    会被随后的重渲染顶掉（历史 bug：header 被顶掉/按钮消失）。所以先整体静默 5s，
  //    再确认 .right-entry 已存在才动手。这是**有意设计**，不要合并成
  //    waitForContainer(".right-entry", cb, 250, 5000)（那会去掉静默期）。
  //    参见 ads.js 顶部 P1 注释、README「保留的优化：视频页延迟 5 秒启用」、
  //    TEST_FLOW.md §7；videotest.md 记录过“去掉 5 秒”的实验并已回滚。
  videoHeaderReady = false;
  videoPageProcessingStarted = false;
  setTimeout(
    () =>
      waitForContainer(
        ".right-entry",
        () => {
          videoHeaderReady = true;
          addBlacklistManagerButton(); // 顶栏就绪后才写 header 元素（管理按钮）
          refreshBlockCountDisplay();
          startVideoPageProcessing(); // header 正常后才做卡片处理
        },
        250,
        VIDEO_PAGE_HEADER_WAIT_MS
      ),
    VIDEO_PAGE_SETTLE_MS
  );

  // 3) 兜底：万一 .right-entry 一直没出现（改版/A-B 实验），waitForContainer 超时后
  //    onFound 不会执行，卡片就会永远停在 pending 遮盖态（全糊着且不再判定）。
  //    这里强制启动：不写顶栏（保持 header 原样），只做卡片/广告处理。
  setTimeout(() => {
    if (videoPageProcessingStarted) return;
    console.warn(
      "[🫥BlackList] 顶栏 .right-entry 未在预期时间内出现，强制启动播放页处理（跳过顶栏管理按钮）。"
    );
    videoHeaderReady = false; // 明确不写顶栏元素
    startVideoPageProcessing();
  }, VIDEO_PAGE_SETTLE_MS + VIDEO_PAGE_HEADER_WAIT_MS + 1000);

  console.log("[🫥BlackList] 视频播放页已就绪：等待 header 正常后启动屏蔽功能。\n");
}

/**
 * 视频页在 header 完全正常后启动的完整处理：观察器 + 首次扫描 + 广告 + 连播 + 补扫。
 * 自动连播监听在此之后才初始化，因此启动阶段无需改动 flagSkipBlockedAutoplay 配置。
 * 幂等：正常路径与“顶栏未出现”的兜底路径只会真正启动一次（否则会重复注册观察器与定时器）。
 */
function startVideoPageProcessing() {
  if (videoPageProcessingStarted) return;
  videoPageProcessingStarted = true;
  // 观察右侧推荐区域（等容器挂载，避免观察整页）：
  // 老版布局是 id="right-container"，新版是 class="right-container"，
  // 只写裸字符串 "right-container" 会先被 getElementById 当 id 查、再被 querySelector 当标签名查，
  // 两者都不命中 → 观察器永远挂不上（还会每 2.5s 重连刷屏）。这里两种写法都列上。
  initializeObserver("#right-container, .right-container");
  // 首次主动扫描 + 广告判定：header 已稳定，此时对卡片/广告做 DOM 操作不会再顶掉 header。
  // 广告与卡片在同一批提交：判定完成后 resolveVideoPageAds() 内部会解除预覆盖。
  scanAndBlockVideoCards();
  resolveVideoPageAds();
  // 记录当前 BV 作为“切视频”检测基准，并安装即时监听
  lastSeenVideoBv = getVideoSwitchKey();
  installVideoSwitchWatcher();
  // 页面内切集后右侧推荐会重建，观察器可能绑定到已替换节点；定时补扫兜底。
  setInterval(() => {
    scanAndBlockVideoCards();
    // 观察根节点被整体替换时重连，否则此后新卡片/新广告都不会再触发观察器
    ensureObserverAttached();
    // 刚检测到切视频时只做预覆盖，判定交给观察器的新元素触发（或 1.5s 兜底），
    // 避免在新广告渲染出来之前就把预覆盖解除掉。
    if (!watchVideoSwitch()) {
      resolveVideoPageAds(); // 低频兜底：观察器万一失效也不至于漏广告
    }
  }, 2500);
  // 自动连播遇到被屏蔽视频时的处理
  initAutoplaySkip();
  console.log("[🫥BlackList] 视频播放页屏蔽功能已启动（header 已正常）。🍇");
}

// 上一次检测到的播放页 BV，用于识别页面内切换视频
let lastSeenVideoBv = "";
// 上一次检测到的搜索页 URL（路径+查询串），用于识别翻页/换关键词
let lastSearchPageKey = "";
// 通用 URL 变化监听的处理函数列表与安装标志
let urlChangeHandlers = [];
let urlChangeWatcherInstalled = false;

/**
 * 取用于“切视频”比对的 BV。
 *
 * 刻意优先用 URL 而不是 autoplay.js 的 getCurrentBv()（它优先读播放器）：
 * 页面内切视频先改 URL，播放器要晚一些才更新到新 BV。用 URL 才能在 pushState
 * 包装里立刻感知到切换，从而在新广告插入之前就把预覆盖加回去。
 * @returns {string}
 */
function getVideoSwitchKey() {
  // getBvFromUrl / getCurrentBv 都在 autoplay.js 里以函数声明定义，同一 IIFE 内已提升，直接调用
  const bvFromUrl = getBvFromUrl();
  if (bvFromUrl) return bvFromUrl;
  return getCurrentBv() || "";
}

/**
 * 检测页面内切换视频（BV 变化）。变化时让广告重新进入“覆盖 → 判定”小周期。
 *
 * 只负责广告：卡片侧已有 2.5s 补扫 + 观察器增量处理，行为保持不变。
 * @returns {boolean} 本次调用是否刚检测到切换。
 */
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

/**
 * 安装“切视频”的即时监听（复用通用 URL 变化监听）。
 */
function installVideoSwitchWatcher() {
  installUrlChangeWatcher(watchVideoSwitch);
}

/**
 * 通用的 SPA URL 变化监听：popstate + history.pushState/replaceState 包装。
 *
 * B 站页面内切视频、搜索页翻页走的都是 pushState，不会触发 popstate，因此需要包装；
 * 包装只是在调用原方法之后追加一次通知，不改变其行为。包装失败也不影响功能，
 * 各页面自身都有定时兜底（只是响应会晚一些）。
 * @param {Function} handler - URL 变化时调用的处理函数。
 */
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



/**
 * 检查当前页面是否为Bilibili分类页。
 * @returns {boolean} 如果是分类页则返回true，否则返回false。
 */
function isCurrentPageCategory() {
  return location.pathname.startsWith("/c/");
}

/**
 * 初始化分类页特有的功能。
 */
function initializeCategoryPage() {
  initializeObserver("app"); // 观察整个app容器
  // 分类页首屏卡片可能在 observer 挂载前已渲染，延迟补一次全量扫描（防漏扫）
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 800);
  console.log("[🫥BlackList] 分类页已加载🍊");
}

/**
 * 检查当前页面是否为Bilibili排行榜/热门页。
 *
 * 覆盖两种 URL 形态：
 *   - `/v/popular/rank...` 与 `/v/popular...`（旧版排行榜/热门，rank 可能带 rid 后缀）
 *   - `/ranking...`（新版排行榜，含 `/ranking/v2`
 * 注意这里必须是**锚定的路径前缀**判断，不能用 `includes("ranking")` 之类的宽匹配，
 * 否则任何路径里含该词的页面都会被当成排行榜页。
 * @returns {boolean} 如果是排行榜页则返回true，否则返回false。
 */
function isCurrentPageRanking() {
  return /^\/(v\/popular(\/rank.*)?|ranking)/.test(location.pathname);
}

/**
 * 排行榜页的卡片选择器。
 *
 * 与 `isCurrentPageRanking()` 一一对应：core.js 的 `queryAllVideoCards()` 与
 * observer.js 的增量卡片收集共用它，避免两处各写一份后漂移
 * （此前排行榜卡片只在 core.js 里，观察器漏掉了 `.rank-item / .video-card / .rank-card`，
 *  导致这些卡片只能靠首屏 600ms 那一次全量扫描处理）。
 */
const RANKING_CARD_SELECTOR = ".bili-video-card, .rank-item, .video-card, .rank-card";

/**
 * 初始化排行榜页特有的功能。
 */
function initializeRankingPage() {
  initializeObserver("app"); // 排行榜页卡片容器（不存在时 observer 回退到整个文档）
  // 排行榜卡片可能在 observer 挂载前已渲染，延迟做一次初始扫描
  setTimeout(() => {
    scanAndBlockVideoCards();
  }, 600);
  console.log("[🫥BlackList] 排行榜页已加载🏆");
}

/**
 * 检查当前页面是否为Bilibili用户空间页。
 * @returns {boolean} 如果是用户空间页则返回true，否则返回false。
 */
function isCurrentUserSpace() {
  return location.hostname === "space.bilibili.com";
}

/**
 * 初始化用户空间页特有的功能。
 */
function initializeUserSpace() {
  console.log("[🫥BlackList] 用户空间已加载🍎");
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

/**
 * 在用户空间页面上的UP主名称元素添加屏蔽/取消屏蔽按钮。
 * @param {HTMLElement} upNameElement - 包含UP主名称的元素。
 */
function addBlockButtonToUserSpace(upNameElement) {
  const upName = upNameElement.textContent.trim();
  // 避免重复添加按钮
  if (upNameElement.querySelector(".bilibili-blacklist-up-block-btn")) {
    return;
  }

  // 调整UP主名称元素的样式，以便容纳按钮
  upNameElement.classList.add("bilibili-blacklist-up-block-btn-host");

  const button = document.createElement("button");
  button.className = "bilibili-blacklist-up-block-btn";
  button.textContent = "屏蔽";

  // 刷新按钮状态和页面灰度效果
  const refreshButtonStatus = () => {
    const blocked = isBlacklisted(upName);
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
    const blocked = isBlacklisted(upName);
    if (blocked) {
      removeFromExactBlacklist(upName);
    } else {
      addToExactBlacklist(upName);
    }
    refreshButtonStatus(); // 更新按钮状态
  });

  refreshButtonStatus(); // 设置按钮初始状态

  upNameElement.appendChild(button);
}