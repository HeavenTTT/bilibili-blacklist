/*
 * 统计明细模块
 * -----------------------------------------------------------
 * 面板头部的「已屏蔽视频 N」角标与可展开的统计明细（三组共 18 行 + 7 日趋势柱）。
 *
 * 行定义（BLOCK_STATS_GROUPS）是面板 DOM 与数值刷新的**唯一真源**：
 * 面板创建时按它生成 DOM、刷新时按 key 只改数值文本，dev 自检也从它派生预期值。
 * 第一组的行来自 domain/block-types.js 的注册表，第二/三组的计数来自 core.js。
 */

/**
 * 面板头部「统计明细」的行定义（单一真源：创建时按此生成 DOM，刷新时按 key 只更新数值）。
 * 第一组是屏蔽原因明细（与 h3 的总数口径一致）；第二组是网络与请求统计
 * （网络拦截条数/响应次数，以及真实发出的接口请求次数 —— 便于对照是否触发限流）；
 * 第三组是**按天持久化**的累计与趋势（存储值 + 本页尚未刷盘的增量，见 core/stats.js）。
 * getText 会收到一个 ctx（含 summary / series），避免同一轮刷新里重复汇总。
 */
const BLOCK_STATS_GROUPS = [
  {
    title: "屏蔽原因明细",
    // 行由 domain/block-types.js 的注册表生成：标签取 panelLabel、数值取对应计数。
    // 新增一种屏蔽类型时这里无需改动，dev 自检也从本表派生预期值（不再写死 18 行/标签串）。
    rows: getBlockTypeKeys().map((type) => ({
      key: type,
      label: getBlockTypeLabel(type, true),
      getText: () => String(getBlockCounter(type)),
    })),
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

/**
 * 更新已屏蔽视频的显示计数与统计明细。
 *
 * 视频页在顶栏(.right-entry)尚未就绪时，**只跳过顶栏角标**（避免与 B 站 header
 * 渲染竞争导致 header 被顶掉）；面板标题与统计明细照常刷新 —— 它们与顶栏无关。
 * 早前这里是整个函数提前 return，导致顶栏超时兜底路径（最长 21s）下面板数字全冻结。
 * 计数变量本身始终更新，顶栏就绪后由 pages.js 补一次 refresh。
 * 高频调用（每次扫描 / 每张卡片提交 / 网络拦截改写），因此这里只改数值文本，不重建 DOM。
 */
function refreshBlockCountDisplay() {
  const headerNotReady = isCurrentPageVideo() && !videoHeaderReady;
  if (!headerNotReady && blockCountDisplayElement) {
    blockCountDisplayElement.textContent = `${blockedVideoCards.size}`;
  }
  if (blockCountTitleElement) {
    blockCountTitleElement.textContent = `已屏蔽视频 ${blockedVideoCards.size}`;
  }
  if (!blockStatsValueElements) return;
  // 明细收起时不写这些数值（refreshBlockCountDisplay 是高频调用，且汇总要走存储）；
  // 展开按钮的点击处理会立刻补一次刷新。
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
  // 7 日趋势柱：高度按当周最大值归一，为 0 的日子画一条浅色底线
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
