/*
 * 管理面板模块
 * -----------------------------------------------------------
 * 黑名单管理面板：五个页签的骨架、四个黑名单列表的公共渲染、列表搜索框。
 *
 * 四个列表（精确匹配 / 正则匹配 / 分类标签 / 视频标签）结构完全一致，
 * 因此渲染只有一份实现（refreshBlacklistList + 四个薄薄的配置包装），
 * 以前是 4 份复制粘贴。
 *
 * 插件配置页（开关/输入/下拉）在 ui/settings-panel.js；面板头部的统计明细在 ui/stats-display.js。
 */

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
