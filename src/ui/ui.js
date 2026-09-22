/*
 * 界面模块
 * -----------------------------------------------------------
 * 顶栏入口 + 管理面板 + 遮挡层 / 屏蔽按钮 / 悬停临时显示。
 */
const KIRBY_FADE_DURATION_MS = 800;
// 各屏蔽类型独立显示行为的下拉选项
const DISPLAY_MODE_INHERIT_OPTIONS = [
  { value: "inherit", label: "继承全局" },
  { value: "blur", label: "模糊遮盖" },
  { value: "kirby", label: "模糊遮盖加卡比" },
  { value: "hide", label: "隐藏卡片" },
];
const hoverRevealBoundCards = new WeakSet();
const hoverRevealTimers = new WeakMap();
const kirbyFadeTimers = new WeakMap();

/**
 * 为UP主创建屏蔽按钮，显示在视频卡片上。
 * 说明：不再为每个按钮单独绑定点击事件，而是把 UP 名写入 data-up-name，
 * 由全局统一的 setupCardButtonDelegation() 做事件委托（捕获阶段），
 * 避免重复绑定、并在 B 站重渲染按钮后依然可用。
 * @param {string} upName - UP主名称。
 * @returns {HTMLDivElement} 创建的按钮元素。
 */
function createBlockUpButton(upName) {
  const button = document.createElement("div");
  button.className = "bilibili-blacklist-block-btn";
  button.textContent = "屏蔽";
  button.title = `屏蔽: ${upName}`;
  button.dataset.upName = upName || "";

  return button;
}

/**
 * 为标签名创建屏蔽按钮，显示在视频卡片上。
 * 说明：与屏蔽按钮一样，不再单独绑定点击事件，由统一事件委托处理。
 * @param {string} tagName - 标签名。
 * @returns {HTMLSpanElement} 创建的按钮元素。
 */
function createTNameBlockButton(tagName) {
  const button = document.createElement("span");
  button.className = "bilibili-blacklist-tname";
  button.textContent = tagName;
  button.title = `屏蔽: ${tagName}`;
  button.dataset.tagName = tagName || "";

  return button;
}

/**
 * 为视频标签创建屏蔽按钮，显示在视频卡片上。
 * 说明：与分类标签按钮一样使用事件委托，但单独的 class/data 字段避免混入分类黑名单。
 * @param {string} tagName - 视频标签名。
 * @returns {HTMLSpanElement} 创建的按钮元素。
 */
function createVideoTagBlockButton(tagName) {
  const button = document.createElement("span");
  button.className = "bilibili-blacklist-video-tag";
  button.textContent = tagName;
  button.title = `屏蔽视频标签: ${tagName}`;
  button.dataset.videoTag = tagName || "";
  return button;
}

// 已知的视频卡片根节点选择器，用于事件委托时从按钮反查所属卡片
const CARD_ROOT_SELECTORS_FOR_BUTTON = [
  ".bili-video-card",
  ".video-page-card-small",
  ".feed-card",
];

/**
 * 从被点击的屏蔽/标签按钮反查其所属的视频卡片元素。
 * 优先向上找已知的卡片根节点；找不到时退回容器宿主。
 * @param {HTMLElement} button - 被点击的按钮。
 * @returns {HTMLElement|null} 卡片元素。
 */
function findCardForButton(button) {
  const container = button.closest(".bilibili-blacklist-block-container");
  if (!container) return null;
  for (const sel of CARD_ROOT_SELECTORS_FOR_BUTTON) {
    const node = container.closest(sel);
    if (node) return node;
  }
  // 兜底：容器宿主通常是卡片本身或其内部元素
  return container.parentElement;
}

// 事件委托是否已安装（全局只装一次）
let cardButtonDelegationInstalled = false;

/**
 * 统一的事件委托：给所有“屏蔽”/“标签”按钮共用一个 document 监听器，
 * 不再为每个按钮单独 addEventListener（问题：部分卡片按钮失效/重复绑定/重渲染后失效）。
 * 用捕获阶段（capture=true）在 B 站自身事件处理之前触发，stopPropagation 阻止点击穿透。
 */
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

      // 屏蔽原因按钮：info(精确)/tname 类型点击后，从黑名单删除对应规则并刷新该卡片重新判定
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

/**
 * 解析右侧导航条的「导航项容器」。
 *
 * B 站顶栏改版后结构变为 `.right-entry > .right-entry__main > [导航项…]`：
 * `.right-entry` 仍在，但只剩外框，导航项搬进了 `.right-entry__main`。
 * 所以优先取新宿主；旧页面（A/B 未改版）再退回 `.right-entry`。
 * 返回 null 表示顶栏还没渲染出来。
 */
function resolveHeaderEntryHost() {
  return (
    document.querySelector(".right-entry__main") ||
    document.querySelector(".right-entry") ||
    null
  );
}

/**
 * 顶栏按钮挂载失败的自我重试（合并调度，幂等）。
 *
 * 只在「容器已出现但导航项还没渲染完」这一种情况下排一次重试。
 * 因为这种情况下 B 站**不一定会再触发 DOM 变更**，观察器的
 * `scheduleHeaderButtonRefresh()` 兜底可能等不到 mutation；只靠观察器
 * 会让按钮一直缺席。用 `waitForContainer` 轮询到导航项出现再挂。
 *
 * 刻意不在「容器还没出现」时排重试：那种情况观察器兜底会覆盖，
 * 而且视频页已有 5s 静默 + 等 `.right-entry`（最长 15s）+ 21s 强制启动那一套时序，
 * 再叠一层轮询只会加重 header 附近的渲染竞争。
 */
let headerButtonRetryScheduled = false;
function scheduleHeaderButtonRetry() {
  if (headerButtonRetryScheduled) return;
  headerButtonRetryScheduled = true;
  waitForContainer(".right-entry__main, .right-entry", () => {
    headerButtonRetryScheduled = false;
    addBlacklistManagerButton();
  }, 250, 15000);
}

/**
 * 将黑名单管理器按钮添加到右侧导航条。
 */
function addBlacklistManagerButton() {
  if (!globalPluginConfig.flagHeaderButton) return; // 油猴菜单可关闭顶部按钮
  // B 站顶栏改版后，导航项容器从 `.right-entry` 换成了 `.right-entry__main`
  // （`.right-entry` 只剩外框）。优先用新宿主，同时保留旧宿主兜底。
  const rightEntry = resolveHeaderEntryHost();
  if (!rightEntry) {
    console.warn("[🫥BlackList] 未找到右侧导航栏(.right-entry__main / .right-entry)");
    return;
  }
  // 幂等：已经挂过就直接返回，避免重复插入。
  if (rightEntry.querySelector("#bilibili-blacklist-manager-button")) return;
  // ⚠️ 视频页的 header 时序闸门（**有意设计，勿删**）。
  //
  // videoHeaderReady 由 pages.js 在「5s 静默 + 轮询到 .right-entry 出现」之后置为 true；
  // 在那之前，视频页的顶栏可能只是骨架，插进去的按钮会被随后的整块重渲染顶掉。
  // 关键点：这个闸门必须放在**这里面**，不能只在调用点判断 ——
  // 观察器的兜底重挂（scheduleHeaderButtonRefresh）也会调用本函数，
  // 而它的触发时机与 5s 静默期完全无关，光靠调用点过滤拦不住它。
  if (isCurrentPageVideo() && !videoHeaderReady) return;
  // 顶栏由 Vue 延迟渲染：容器存在 ≠ 导航项渲染完成，过早插入会被重渲染顶掉。
  // 注意**只等"有内容"**，不再用旧的「li 数量 > 6」经验值判断 —— 改版后导航项
  // 既不是 li、数量也变了，旧阈值会让本函数永远提前 return（按钮静默消失）。
  if (!rightEntry.querySelector("a, li, .right-entry__item")) {
    scheduleHeaderButtonRetry();
    return;
  }

  const listItem = document.createElement("li");
  listItem.id = "bilibili-blacklist-manager-button";
  listItem.className = "v-popover-wrap";

  const button = document.createElement("div");
  button.className = "right-entry-item";

  const icon = document.createElement("div");
  icon.className = "right-entry__outside";
  icon.innerHTML = getKirbySVG(); // 获取卡比SVG图标

  blockCountDisplayElement = document.createElement("span");
  blockCountDisplayElement.textContent = `0`;

  button.appendChild(icon);
  button.appendChild(blockCountDisplayElement);
  listItem.appendChild(button);

  // 将按钮插入到导航栏的特定位置（跟旧版一致：插到第 2 个导航项之前）
  if (rightEntry.children.length > 1) {
    rightEntry.insertBefore(listItem, rightEntry.children[1]);
  } else {
    rightEntry.appendChild(listItem);
  }

  // 点击按钮显示/隐藏管理面板
  listItem.addEventListener("click", () => {
    managerPanel.style.display =
      managerPanel.style.display === "flex" ? "none" : "flex";
  });
}

/**
 * 通过油猴菜单切换顶部管理按钮的显示/隐藏。
 *
 * ⚠️ 这里必须**双向**都生效，不能只写 style.display：
 * `addBlacklistManagerButton()` 的存在性判断用的是 `querySelector(...)`（只看"在不在 DOM 里"，
 * 不看是否被我隐藏），所以一旦按钮被 `display:none` 留在 DOM 里，它就会一直提前 return，
 * 那个元素将永远停在隐藏状态 —— 表现就是「菜单能关、但再也开不回来」。
 * 因此关闭时**把元素摘掉**，让后续 `addBlacklistManagerButton()` 能重新创建。
 * 注意：另一个调用点 `addBlacklistManagerButton()` 内部虽然也会读同一个标志，
 * 但它只负责「隐藏」，绝不能让它去移除元素，否则会被高频调用的兜底逻辑反复摘除/重建。
 */
function toggleHeaderButtonVisibility() {
  const btn = document.querySelector("#bilibili-blacklist-manager-button");
  if (globalPluginConfig.flagHeaderButton) {
    // 打开：元素在就显示（并清掉可能残留的行内 display），不在就补建一个。
    if (btn) {
      btn.style.display = "";
    } else {
      addBlacklistManagerButton();
    }
  } else if (btn) {
    // 关闭：连元素一起摘掉（只 display:none 的话就再也开不回来了，见上）。
    btn.remove();
  }
}

/**
 * 注册 Tampermonkey 菜单项（需 @grant GM_registerMenuCommand）。
 *
 * ⚠️ 这里的 console 输出是**排查用的一手证据，不要删**：
 * `GM_registerMenuCommand` 由油猴按脚本的 @grant 注入。1.2.4 只声明了 3 个 grant，
 * 2.0.0 才加入它 —— 而 Tampermonkey 在「脚本被更新」时**不会自动重新批准新增的 @grant**，
 * 表现就是菜单里既没有我们的项、页面上也毫无提示（旧实现在这里静默 return，
 * 完全无从判断）。所以缺授权时明确报出来，并给出可执行的解决办法。
 */
function initTampermonkeyMenu() {
  if (typeof GM_registerMenuCommand !== "function") {
    console.warn(
      "[🫥BlackList] 当前未获得 GM_registerMenuCommand 授权，油猴菜单里的" +
        "「显示/隐藏顶部管理按钮」「打开黑名单管理面板」不会出现。" +
        "这是油猴在脚本更新后没有重新批准新增 @grant 导致的（不是脚本错误）：" +
        "请在 Tampermonkey 里删除本脚本后重新安装一次（或在该脚本的设置里重新确认权限）。"
    );
    return;
  }
  GM_registerMenuCommand("显示/隐藏顶部管理按钮", () => {
    globalPluginConfig.flagHeaderButton = !globalPluginConfig.flagHeaderButton;
    saveGlobalConfigToStorage();
    toggleHeaderButtonVisibility();
  });
  GM_registerMenuCommand("打开黑名单管理面板", () => {
    // 按需创建：面板通常在 initializeScript() 里就建好了，但「不支持的页面」
    // （如 /bangumi/、/account/*）会在那之前就 return，此时 managerPanel 还是
    // undefined —— 旧写法会让这个菜单项**静默什么都不做**。这里补建一次，
    // 让菜单在任何页面上都能打开面板（createBlacklistPanel 自身幂等）。
    if (!managerPanel) createBlacklistPanel();
    if (managerPanel) managerPanel.style.display = "flex";
  });
  blInfo(
    "[🫥BlackList] 已注册油猴菜单：显示/隐藏顶部管理按钮、打开黑名单管理面板"
  );
}

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

// 辅助函数：创建通用按钮
function createPanelButton(text, bgColor, onClick) {
  const button = document.createElement("button");
  button.className = "bilibili-blacklist-panel-btn";
  button.textContent = text;
  button.style.background = bgColor;
  button.addEventListener("click", onClick);
  return button;
}

// 辅助函数：为黑名单面板创建列表项
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

/**
 * 读取列表搜索框的关键词（小写、去空白）。
 * @param {string} selector - 搜索输入框选择器。
 * @returns {string}
 */
function getListSearchKeyword(selector) {
  const el = document.querySelector(selector);
  return el ? (el.value || "").trim().toLowerCase() : "";
}

/**
 * 为屏蔽列表创建搜索输入框。
 * @param {string} id - 输入框 id。
 * @param {string} placeholder - 占位提示。
 * @param {Function} onInput - 输入回调（一般直接刷新对应列表）。
 * @returns {HTMLInputElement}
 */
function createListSearchInput(id, placeholder, onInput) {
  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.placeholder = placeholder;
  input.className = "bilibili-blacklist-search-input";
  input.addEventListener("input", onInput);
  return input;
}

/**
 * 四个黑名单列表页签的公共渲染：清空 → 按搜索框关键字过滤 → 逐条渲染 →
 * 倒序（最新添加的在顶部）→ 空态占位。
 *
 * 精确匹配 / 正则匹配 / 分类标签 / 视频标签 四个列表结构完全一致，
 * 以前是 4 份复制粘贴（改一处容易漏三处），统一走这里。
 * @param {object} cfg - 列表配置。
 * @param {string} cfg.listId - 列表容器 id（不含 #）。
 * @param {string} cfg.searchId - 搜索框 id（不含 #）。
 * @param {() => Array} cfg.getList - 返回当前黑名单数组。
 * @param {HTMLElement|null} cfg.cachedElement - 已缓存的列表元素（可能为 null）。
 * @param {string} cfg.emptyText - 黑名单为空时的占位文案。
 * @param {(item: any) => void} cfg.onRemove - 点击「移除」时的回调。
 * @returns {HTMLElement|null} 列表元素；面板未创建/容器不存在时返回 null。
 */
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
  // 反转列表顺序，使最新添加的显示在顶部
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

/**
 * 刷新面板中的精确匹配黑名单显示。
 */
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

/**
 * 刷新面板中的正则匹配黑名单显示。
 */
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

/**
 * 刷新面板中的标签名黑名单显示。
 */
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

/**
 * 刷新面板中的视频标签黑名单显示。
 */
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

// 辅助函数：为设置创建切换按钮
function createSettingToggleButton(labelText, configKey, title = null) {
  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-toggle";
  container.title = title; // 设置鼠标悬停提示

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

  refreshButtonAppearance(); // 初始化按钮外观

  container.appendChild(label);
  container.appendChild(button);

  return container;
}
// 辅助函数：为设置创建输入文本
function createSettingInput(
  labelText,
  configKey,
  title = null,
  constraints = {}
) {
  // 卡片扫描间隔设置
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

// 辅助函数：为设置创建下拉选择框
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

  // 按当前配置值选中对应项
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

/**
 * 刷新面板中的配置设置显示。
 */
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

  // 临时开关按钮
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

  // ===== 分组 1：屏蔽类型开关 =====
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

  // ===== 分组 2：分类数据与缓存 =====
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

  // 标签缓存数量显示与清除按钮
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

  // 累计屏蔽统计（面板头部「累计与趋势」那组的数据）显示与清除
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

  // 自动连播遇到被屏蔽视频的处理方式
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

  // ===== 分组 3：显示方式 =====
  const displayTitle = document.createElement("h4");
  displayTitle.textContent = "显示方式";
  configListElement.appendChild(displayTitle);

  // 全局模式用「不含继承」的三个选项（由 DISPLAY_MODE_INHERIT_OPTIONS 派生，避免再抄一遍）
  const DISPLAY_MODE_OPTIONS = DISPLAY_MODE_INHERIT_OPTIONS.filter(
    (opt) => opt.value !== "inherit"
  );
  // 全局 + 每种屏蔽类型的独立行为（继承全局）：结构一致，用数组循环生成
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

  // ===== 分组 4：交互 =====
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

  // ===== 分组 5：网络与性能 =====
  const netTitle = document.createElement("h4");
  netTitle.textContent = "网络与性能";
  configListElement.appendChild(netTitle);

  // 插件日志级别（见 src/utils/logger.js）。错误与告警不受此项影响，永远输出。
  configListElement.appendChild(
    createSettingSelect(
      "插件日志:",
      "logLevel",
      "控制插件往浏览器控制台输出的普通日志。错误与告警不受影响，永远输出。" +
        "「完全关闭」= 除错误告警外不输出任何日志（默认）；" +
        "「关键信息」= 分页初始化、自动连播跳转等用户能感知的动作；" +
        "「全部」= 再加上缓存刷新、观察器重连、每次网络拦截等过程性细节" +
        "（详细级走 console.debug，DevTools 需把级别切到 Verbose 才看得到）。改后立即生效。",
      [
        { value: "off", label: "完全关闭(默认)" },
        { value: "info", label: "关键信息" },
        { value: "verbose", label: "全部" },
      ]
    )
  );
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

  // 免责声明 + AI 作者（展示在插件配置页底部，随插件一起可见）
  const disclaimer = document.createElement("div");
  disclaimer.className = "bilibili-blacklist-disclaimer";
  disclaimer.textContent =
    "免责声明：本插件由 AI（DeepSeek Harness）自动编写，并非人工逐行开发；" +
    "使用前请自行评估风险。作者：DeepSeek Harness (AI)。";
  configListElement.appendChild(disclaimer);
}

/**
 * 刷新黑名单管理面板中的所有标签页。
 */
function refreshAllPanelTabs() {
  refreshExactMatchList();
  refreshRegexMatchList();
  refreshTagNameList();
  refreshVideoTagList();
  refreshConfigSettings();
}

/**
 * 检查黑名单管理面板是否已创建并存在于DOM中。
 * 如果找到，则设置全局 `managerPanel` 引用。
 * @returns {boolean} 如果面板存在则返回true，否则返回false。
 */
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

/**
 * 创建黑名单管理面板。
 */
function createBlacklistPanel() {
  if (isBlacklistPanelCreated()) {
    return;
  }
  managerPanel = document.createElement("div");
  managerPanel.id = "bilibili-blacklist-manager-panel"; // 确保ID唯一

  // 创建标签容器
  const tabContainer = document.createElement("div");
  tabContainer.className = "bilibili-blacklist-tabs";

  // 创建各个标签页的内容区域
  const exactContent = document.createElement("div");
  exactContent.className = "bilibili-blacklist-panel-content";
  exactContent.style.display = "block"; // 默认显示精确匹配

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

  // 定义标签页数据
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
  header.className = "bilibili-blacklist-panel-header";

  blockCountTitleElement = document.createElement("h3");
  blockCountTitleElement.title =
    "总数 = UP/标题名 + 广告 + CM 软广 + 分类标签 + 视频标签 + 竖屏";

  // 标题 + 统计明细：DOM 只在这里创建一次，之后 refreshBlockCountDisplay 只改数值文本
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
    // 累计组的 7 日趋势柱（DOM 也只在建面板时创建一次）
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
  // 明细默认收起（展开状态由头部左侧的展开按钮切换，见下）
  statsContainer.style.display = isBlockStatsExpanded ? "" : "none";

  // 操作按钮组（放在标题右侧）：[展开/收起统计明细] [关闭面板]
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
    // 收起期间跳过数值刷新，展开时补一次最新的
    if (isBlockStatsExpanded) refreshBlockCountDisplay();
  });
  refreshToggleState();

  // 关闭按钮：圆形底色 + 白色 X 图标（比原来的文本「×」更大更明显）
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

  // 精确匹配添加输入框和按钮
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

  // 正则匹配添加输入框和按钮
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

  // 视频标签添加输入框和按钮
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

  // 创建列表元素
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

  refreshAllPanelTabs(); // 初始化所有标签页内容
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

  // 首次创建后立即刷新计数标题，避免第一次打开面板时标题为空
  refreshBlockCountDisplay();

  return managerPanel;
}

/**
 * 为插件添加全局CSS样式。
 */
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

/**
 * 返回面板关闭按钮的 X 图标 SVG（配合 CSS 的圆形底色，颜色用 currentColor）。
 * @returns {string} SVG字符串。
 */
function getCloseIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none" />
      </svg>
  `;
}

/**
 * 返回面板统计明细「展开/收起」按钮的箭头图标 SVG（收起时朝下，展开时由 CSS 旋转 180°）。
 * @returns {string} SVG字符串。
 */
function getChevronIconSVG() {
  return `
      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M6 9 L12 15 L18 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
  `;
}

/**
 * 返回卡比图标的SVG代码。
 * @returns {string} SVG字符串。
 */
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

/**
 * 渐显卡比覆盖层（鼠标移开后恢复遮挡）。
 * @param {HTMLElement} overlay - 卡比覆盖层元素。
 */
function fadeInKirbyOverlay(overlay) {
  if (!overlay) return;
  const pendingTimer = kirbyFadeTimers.get(overlay);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    kirbyFadeTimers.delete(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "0";
  void overlay.offsetHeight; // 强制重排以触发过渡动画
  overlay.style.opacity = "1";
}

/**
 * 渐隐卡比覆盖层（悬停临时显示视频）。
 * @param {HTMLElement} overlay - 卡比覆盖层元素。
 */
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

/**
 * 取消卡比覆盖层的渐隐/渐显计时器。
 * @param {HTMLElement} overlay - 卡比覆盖层元素。
 */
function cancelKirbyFade(overlay) {
  if (!overlay) return;
  const pendingTimer = kirbyFadeTimers.get(overlay);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    kirbyFadeTimers.delete(overlay);
  }
}

/**
 * 恢复所有被悬停临时显示的视频遮罩。
 */
function restoreAllBlockedVideoOverlays() {
  if (isShowAllVideos) return;
  pruneDisconnectedBlockedCards(); // 只对仍在文档里的卡片做淡入（避免对已移除节点白做同步布局）
  blockedVideoCards.forEach((card) => {
    const overlay = card.querySelector("#bilibili-blacklist-kirby");
    if (overlay) {
      card.style.visibility = "visible";
      fadeInKirbyOverlay(overlay);
    }
  });
}

/**
 * 为被遮挡的视频卡片绑定悬停临时显示行为。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
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
    // 若正在渐隐，先取消，避免悬停期间遮罩消失
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

/**
 * 为视频卡片添加显示遮罩（模糊遮盖或模糊遮盖加卡比）。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @param {string} mode - "blur" | "kirby"
 */
function addDisplayOverlayToCard(cardElement, mode) {
  bindHoverRevealToCard(cardElement);
  // 如果已经有遮罩层，则不重复添加
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

  // 遮罩宿主：分类页/动态页的"真实卡片"是内层元素（内层 .bili-video-card / .bili-dyn-card-video），
  // 挂在外层会导致遮罩尺寸覆盖整条卡片（动态页还会盖住转发正文）。
  const hostElement = isCurrentPageCategory()
    ? cardElement.querySelector(".bili-video-card") || cardElement
    : isCurrentPageDynamic()
      ? cardElement.querySelector(".bili-dyn-card-video") || cardElement
      : cardElement;

  // 确保宿主元素有position属性以便子元素绝对定位
  const hostStyle = getComputedStyle(hostElement);
  if (hostStyle.position === "static" || !hostStyle.position) {
    hostElement.style.position = "relative";
  }

  hostElement.appendChild(kirbyWrapper);
}

/**
 * 从视频卡片中移除卡比覆盖层。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 */
function removeKirbyOverlay(cardElement) {
  const kirbyWrapper = cardElement.querySelector("#bilibili-blacklist-kirby");
  if (kirbyWrapper) {
    kirbyWrapper.remove();
  }
}
