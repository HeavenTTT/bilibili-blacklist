/*
 * 屏蔽统计持久化模块
 * -----------------------------------------------------------
 * 面板头部的计数器是"本页内存值"，刷新即归零。这里把它们按天沉淀到 GM 存储，
 * 供面板显示「今日 / 近 7 天 / 累计」与 7 日趋势柱。
 *
 * 设计要点：
 *   - **差值刷盘**：只写"自上次刷盘以来的增量"，因此不需要在 9 个计数点上各埋一次存储调用，
 *     而且"取消屏蔽/恢复显示"造成的负增量也能正确回退；
 *   - 只在真的有变化时才写存储（每 5s、切到后台、页面卸载、打开面板时各尝试一次）；
 *   - 只保留最近 30 天明细 + 一份 all-time 汇总，存储体积极小；
 *   - 面板显示的是"存储值 + 尚未刷盘的增量"，所以数字永远是实时的。
 */
const BLOCK_STATS_STORAGE_KEY = "blockStats";
const BLOCK_STATS_KEEP_DAYS = 30;
const BLOCK_STATS_FLUSH_INTERVAL_MS = 5000;
/** 落盘字段（与 core.js 的内存计数器一一对应） */
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

/** { days: { "YYYY-MM-DD": {…} }, total: {…} } */
let blockStatsStore = null;
/** 上次刷盘时的内存计数快照（初值全 0 → 本页从加载起的增量都会入账） */
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

/**
 * 当天日期键（本地时区 YYYY-MM-DD）。
 * @param {Date} [date]
 * @returns {string}
 */
function getBlockStatsDayKey(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 最近 N 天的日期键（从旧到新，含今天）。
 * @param {number} days
 * @returns {string[]}
 */
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

/** 当前内存里的各项计数 */
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

/** 屏蔽类计数之和（不含网络拦截/判定数） */
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

/** 只保留最近 BLOCK_STATS_KEEP_DAYS 天明细 */
function pruneBlockStatsDays(store) {
  const keys = Object.keys(store.days).sort();
  while (keys.length > BLOCK_STATS_KEEP_DAYS) {
    delete store.days[keys.shift()];
  }
}

/**
 * 把"自上次刷盘以来的增量"记进当天桶与累计桶。没有变化时直接返回（可高频调用）。
 * @returns {boolean} 是否真的写入了存储。
 */
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

/**
 * 汇总，供面板显示「今日 / 近 7 天 / 累计」。
 * 返回值已把"尚未刷盘的增量"计入，因此与面板上的本页计数一致。
 * @returns {{today: object, last7: object, total: object}}
 */
function getBlockStatsSummary() {
  flushBlockStats(); // 先落一次，保证差值口径一致（无变化时是空操作）
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

/**
 * 最近 N 天的每日序列（趋势柱用）。
 * @param {number} days
 * @returns {Array<{key: string, blocks: number, intercepted: number}>}
 */
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

/** 清除累计统计（含当天明细）；清除后本页增量从零开始重新累计 */
function clearBlockStats() {
  flushBlockStats(); // 先把已有增量算进旧数据，避免清除后又被算一次
  blockStatsStore = { days: {}, total: {} };
  blockStatsSnapshot = getCurrentBlockStatsValues();
  try {
    GM_setValue(BLOCK_STATS_STORAGE_KEY, blockStatsStore);
  } catch (e) {
    console.error("[🫥BlackList] 清除统计失败:", e);
  }
}

/**
 * 启动定时刷盘 + 切后台/卸载时兜底刷盘。幂等，由 initializeScript 调用一次。
 */
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
