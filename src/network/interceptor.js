/*
 * 网络拦截模块
 * -----------------------------------------------------------
 * 目标：在“网络层”拦截 B 站页面的 Fetch / XHR 请求，处理推荐/相关接口数据。
 *
 * 开关：
 *   - NET_INTERCEPT.enabled：是否已安装代理；
 *   - NET_INTERCEPT.rewrite ：是否命中后“改写响应”（删除黑名单条目）再交给页面。
 *
 * 说明：
 *   - 需要 patch 的是“页面上下文”的 window.fetch，因此使用 unsafeWindow
 *     （由加载器 @grant unsafeWindow 提供）。
 *   - 只对 urlPatterns 命中的 URL 回调，其余请求零影响。
 *   - 只改写 Fetch：XHR 的 responseText 只读、很难安全改写，原先的“只读观察”钩子
 *     （onFetch / onXhr）为空实现且无人使用，已移除；确有需要时应在 dev 构建里单独挂。
 */
var NET_INTERCEPT = {
  enabled: false,
  rewrite: true,   // true=命中后删除黑名单条目再交给页面；false=只读观察
  // B 站推荐 / 相关接口关键字（命中才处理）
  urlPatterns: [
    "/x/web-interface/wbi/index/top/feed/rcmd",
    "/x/web-interface/wbi/index/feed",
    "/x/web-interface/wbi/index/web/feed/rcmd",
    "/x/web-interface/archive/related"
  ],
  // 页面上下文的全局对象（优先 unsafeWindow）
  page: (typeof unsafeWindow !== "undefined") ? unsafeWindow : window
};

/**
 * 判断某个 URL 是否命中要拦截的接口。
 * @param {string} url
 * @returns {boolean}
 */
function netUrlMatches(url) {
  var patterns = NET_INTERCEPT.urlPatterns;
  for (var i = 0; i < patterns.length; i++) {
    if (url.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

/* ============ dev 专用：响应字段勘查 ============
 * 用途：搞清"推荐/相关接口到底返回了哪些字段"，才能判断哪些信号可以在流内直接拦截
 * （分区 tname/tid、官方广告标记、时长、推荐理由……），而不是靠 DOM 猜。
 * 默认关闭，只由 dev-test.js 通过 URL 标记 #bl-probe-fields 或
 * window.__blacklistExpose.probeInterceptFields(true) 打开；release 产物里恒为 false。
 */
var INTERCEPT_FIELD_PROBE = false;
function setInterceptFieldProbe(on) {
  INTERCEPT_FIELD_PROBE = !!on;
}
// 这些字段与"能不能在流内拦截"直接相关，优先打印出来
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
    // 逐条精简摘要 + 字段分布：一次看清"哪些信号能用于流内拦截"
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

/* ============ 流内判定（不发起任何请求） ============
 * 2026-09 实测首页 rcmd 条目可用字段：owner.name / title / business_info（官方商业推广标记）
 * / duration / goto / rcmd_reason / is_followed / dislike_switch……
 * **没有** tid/tname/tname_v2、也没有 dimension 与视频标签 —— 所以：
 *   - 广告：用官方 business_info 判定（不再靠 cm.bilibili.com 链接猜）；
 *   - 分类/视频标签/竖屏：只能复用队列**已经请求并缓存**下来的数据（命中未过期缓存才判，
 *     绝不在这里新增请求 —— 否则会把推荐接口的响应时间拖长，还可能触发限流）。
 */
var STREAM_REASON_TEXT = {
  ad: "广告",
  info: "UP/标题名",
  tname: "分类标签",
  videoTag: "视频标签",
  vertical: "竖屏"
};

/**
 * 判断一条推荐/相关条目是否应被流内拦截。
 * @param {object} item 推荐/相关接口的单条数据。
 * @returns {string|null} 命中原因（ad/info/tname/videoTag/vertical）；未命中返回 null。
 */
function getStreamBlockReason(item) {
  if (!item) return null;

  // 1) 官方广告标记：rcmd 的 business_info 非空即商业推广（实测含 is_ad_loc / res_id / creative_type）
  if (globalPluginConfig.flagAD && item.business_info) {
    var biz = item.business_info;
    if (biz.is_ad_loc === true || biz.res_id || biz.creative_type || biz.ad_cb) {
      return "ad";
    }
  }

  // 2) UP 名 / 标题：精确 + 正则（与 DOM 侧同一套规则，零网络）
  var upName = (item.owner && item.owner.name) || "";
  var title = item.title || "";
  if ((upName || title) && isBlacklisted(upName, title)) return "info";

  // 3) 分区 / 竖屏 / 视频标签：只吃缓存（队列判定过的卡片才会命中）
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

/**
 * 按流内规则过滤一个条目数组，并统计各原因命中数。
 * @param {Array} items
 * @returns {{kept: Array, removed: number, removedAds: number, byReason: object}}
 */
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

/**
 * 把原因统计拼成可读文案，例如：（广告 1、UP/标题名 2）。
 * @param {object} byReason
 * @returns {string}
 */
function describeStreamReasons(byReason) {
  var parts = Object.keys(byReason).map(function (key) {
    return (STREAM_REASON_TEXT[key] || key) + " " + byReason[key];
  });
  return parts.length ? "（" + parts.join("、") + "）" : "";
}

/**
 * 改写推荐接口响应文本：删除命中黑名单/广告标记/已缓存分区的条目，并累计面板统计。
 * 没有任何条目被过滤时返回原文本（调用方据此复用原响应，避免白做一次
 * JSON 序列化 + new Response —— 后者还会丢掉 res.url / redirected）。
 * @param {string} url           请求 URL
 * @param {string} responseText  原始响应文本
 * @returns {string}             交给页面的响应文本
 */
function rewriteRecommendation(url, responseText) {
  try {
    var parsed = JSON.parse(responseText);
    if (!parsed || typeof parsed !== "object") return responseText;
    probeInterceptPayload(url, parsed);

    // 推荐流：data.item 数组（wbi/index/top/feed/rcmd、wbi/index/feed）
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

    // 相关推荐：data 本身是数组（archive/related）
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

    // 结构不认识：原样返回
    return responseText;
  } catch (e) {
    return responseText;
  }
}

/**
 * 安装网络拦截器（作用于页面上下文）。
 * 只会执行一次；命中 urlPatterns 且 NET_INTERCEPT.rewrite=true 时，
 * 用改写后的响应替换原始响应；未命中/未改写时原样返回，零影响。
 */
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
      // 不改写就不必读 body（res.clone().text() 对每个推荐响应都是一次额外解析）
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
