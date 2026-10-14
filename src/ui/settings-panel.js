/*
 * 插件配置页模块
 * -----------------------------------------------------------
 * 管理面板第 5 个页签「插件配置」：分组标题 + 各类设置控件（开关 / 数字输入 / 下拉）
 * + 缓存与统计的清除入口 + 免责声明。
 *
 * 与配置真源的关系（这是本文件最需要注意的一点）：
 *   - 取值范围不写死在这里，来自 data/settings.js 的 SETTING_CONSTRAINTS（与加载校验同一份）；
 *   - 下拉取值集合来自 SETTING_ENUMS，本文件只提供中文文案（SETTING_ENUM_LABELS）；
 *   - 默认值与迁移在 data/settings.js 的 normalizeGlobalConfig。
 * 这样面板不可能出现「能存但运行期非法」「能选但校验不认」的漂移。
 */

// 各屏蔽类型独立显示行为的下拉选项：取值集合来自 data/settings.js 的 SETTING_ENUMS
// （加载校验用的也是它），中文文案留在展示层。
const DISPLAY_MODE_LABELS = {
  inherit: "继承全局",
  blur: "模糊遮盖",
  kirby: "模糊遮盖加卡比",
  hide: "隐藏卡片",
};
const DISPLAY_MODE_INHERIT_OPTIONS = getDisplayModeDomain().map((value) => ({
  value: value,
  label: DISPLAY_MODE_LABELS[value],
}));
// 枚举型配置的中文文案（取值集合同样来自 SETTING_ENUMS）
const SETTING_ENUM_LABELS = {
  flagSkipBlockedAutoplay: {
    skip: "切换为未屏蔽视频",
    stop: "停止播放",
    off: "不处理(默认)",
  },
  logLevel: {
    off: "完全关闭(默认)",
    info: "关键信息",
    verbose: "全部",
  },
};

// 「面板半透明滤镜」当前这批控件的引用。配置页每次 refreshConfigSettings 都会整块重建，
// 这里始终指向最新实例，好让开关切换/拖动时就地更新禁用态与百分比文本，而不必重建配置页。
let panelGlassRangeInput = null;
let panelGlassValueLabel = null;
let panelGlassResetButton = null;

/**
 * 把数值配置的透明度格式化成面板上的百分比文本（0.85 → "85%"）。
 * 先乘 100 再 Math.round：0.05 步进的小数二进制表示并不精确（0.85 * 100 = 84.999…），
 * 直接拼接会显示出 "84.99999999999999%" 这种噪声。
 * @param {number} value
 * @returns {string}
 */
function formatPanelGlassOpacity(value) {
  return Math.round(Number(value) * 100) + "%";
}

/**
 * 面板滤镜相关设置变化后的统一收敛点：开关与滑块/重置按钮共用同一份逻辑，
 * 保证「改动立即生效」与「控件状态同步」两件事只写一遍，不会改一处漏一处。
 */
function onPanelGlassSettingChanged() {
  applyPanelGlassStyle();
  refreshPanelGlassControls();
}

/**
 * 按当前配置刷新面板滤镜控件：滑块/重置按钮的禁用状态、滑块位置与百分比文本。
 *
 * 只读 globalPluginConfig、不写回配置，也不碰面板本身（外观生效归 applyPanelGlassStyle），
 * 所以可以在配置页重建后、开关切换后、拖动过程中安全地反复调用。
 */
function refreshPanelGlassControls() {
  const enabled = !!globalPluginConfig.flagPanelGlass;
  const opacity = clampSetting(
    globalPluginConfig.panelGlassOpacity,
    "panelGlassOpacity"
  );

  if (panelGlassRangeInput) {
    panelGlassRangeInput.disabled = !enabled;
    panelGlassRangeInput.value = String(opacity);
    // 禁用时把「为什么拖不动」写在 title 上，而不是只置灰让用户自己猜
    panelGlassRangeInput.title = enabled ? "" : "先开启面板半透明滤镜再拖动";
  }
  if (panelGlassValueLabel) {
    panelGlassValueLabel.textContent = formatPanelGlassOpacity(opacity);
  }
  if (panelGlassResetButton) {
    panelGlassResetButton.disabled = !enabled;
    panelGlassResetButton.title = enabled
      ? "恢复为默认透明度"
      : "先开启面板半透明滤镜再重置";
  }
}

/**
 * 由 SETTING_ENUMS + SETTING_ENUM_LABELS 生成下拉选项。
 * 面板因此不可能出现“能选、但加载校验不认”的取值。
 * @param {string} configKey
 * @returns {Array<{value: string, label: string}>}
 */
function createEnumOptions(configKey) {
  const labels = SETTING_ENUM_LABELS[configKey] || {};
  return SETTING_ENUMS[configKey].map((value) => ({
    value: value,
    label: labels[value] || value,
  }));
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
    // 面板滤镜开关：立即作用到面板本身，并同步滑块/重置按钮的可用状态
    if (configKey === "flagPanelGlass") {
      onPanelGlassSettingChanged();
    }
  });

  refreshButtonAppearance(); // 初始化按钮外观

  container.appendChild(label);
  container.appendChild(button);

  return container;
}
/**
 * 辅助函数：为设置创建数字输入行。
 *
 * 取值范围**不在这里写死**：从 data/settings.js 的 SETTING_CONSTRAINTS 读 —— 与加载时的
 * clampSetting 是同一份。此前面板自己写 min/max（blockScanInterval 无上界、
 * verticalScaleThreshold 允许 0），能把运行期非法的值存进存储。
 * 范围提示也由约束表生成，避免标题文案里的范围描述与实际校验漂移。
 * @param {string} labelText
 * @param {string} configKey 取值必须存在于 SETTING_CONSTRAINTS。
 * @param {string|null} [title] 说明文案（无需再写范围）。
 */
function createSettingInput(labelText, configKey, title = null) {
  const { min = 0, max = null, step = null } = SETTING_CONSTRAINTS[configKey] || {};
  const rangeText = max === null ? `不小于 ${min}` : `${min} ~ ${max}`;

  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-input-row";
  container.title = (title ? title : "") + `（有效范围：${rangeText}）`;

  const label = document.createElement("span");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "bilibili-blacklist-number-input";
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
 * 辅助函数：为设置创建滑块行（真 `<input type="range">`）。
 *
 * 与 createSettingInput 一样**不在这里写死取值**：min/max/step 全部来自
 * data/settings.js 的 SETTING_CONSTRAINTS（与加载时的 clampSetting 是同一份真源）。
 * 事件语义按拖动体验拆开：`input` 只改内存配置并立即生效（拖动时 input 事件极密集，
 * 每次都 GM_setValue 属于高频写存储），`change`（松手/键盘确认）才落盘。
 * @param {string} labelText
 * @param {string} configKey 取值必须存在于 SETTING_CONSTRAINTS。
 * @param {string|null} [title] 说明文案（无需再写范围）。
 * @returns {HTMLElement} 包装元素：内含「label + 滑块 + 百分比」行与「重置」按钮行。
 */
function createSettingRangeSlider(labelText, configKey, title = null) {
  const { min, max, step } = SETTING_CONSTRAINTS[configKey];

  const wrapper = document.createElement("div");
  wrapper.className = "bilibili-blacklist-panel-glass-controls";

  const container = document.createElement("div");
  container.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-setting-input-row";
  container.title = title;

  const label = document.createElement("span");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "range";
  input.className = "bilibili-blacklist-panel-opacity-range";
  input.min = `${min}`;
  input.max = `${max}`;
  input.step = `${step}`;
  input.value = String(clampSetting(globalPluginConfig[configKey], configKey));

  const valueLabel = document.createElement("span");
  valueLabel.className = "bilibili-blacklist-panel-opacity-value";

  input.addEventListener("input", () => {
    globalPluginConfig[configKey] = Number(input.value);
    onPanelGlassSettingChanged(); // 拖动中实时生效（顺带刷新百分比文本）
  });
  // 松手才落盘：拖动过程会连发 input，写存储留到 change
  input.addEventListener("change", () => {
    saveGlobalConfigToStorage();
  });

  container.appendChild(label);
  container.appendChild(input);
  container.appendChild(valueLabel);

  // 重置按钮另起一行：滑块行保持「label + 控件 + 数值」的既有结构（同 createSettingInput）
  const resetButton = document.createElement("button");
  resetButton.className =
    "bilibili-blacklist-config-btn bilibili-blacklist-panel-glass-reset";
  resetButton.textContent = "重置";
  resetButton.addEventListener("click", () => {
    globalPluginConfig[configKey] = defaultGlobalPluginConfig[configKey];
    saveGlobalConfigToStorage();
    onPanelGlassSettingChanged();
  });

  const resetContainer = document.createElement("div");
  resetContainer.className =
    "bilibili-blacklist-panel-row bilibili-blacklist-panel-glass-reset-row";
  resetContainer.appendChild(resetButton);

  wrapper.appendChild(container);
  wrapper.appendChild(resetContainer);

  // 面板透明度滑块要与「面板半透明滤镜」开关联动（禁用/百分比/重置），
  // 因此把刚创建的这批控件登记为“当前实例”，并立刻按当前配置初始化一次外观；
  // 配置页每次重建都会重新登记，绝不会指向上一次的废弃节点。
  if (configKey === "panelGlassOpacity") {
    panelGlassRangeInput = input;
    panelGlassValueLabel = valueLabel;
    panelGlassResetButton = resetButton;
    refreshPanelGlassControls();
  }

  return wrapper;
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
      createEnumOptions("flagSkipBlockedAutoplay")
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

  // ===== 分组 4：外观与滤镜（只影响管理面板自身的观感）=====
  const glassTitle = document.createElement("h4");
  glassTitle.textContent = "外观与滤镜";
  configListElement.appendChild(glassTitle);

  configListElement.appendChild(
    createSettingToggleButton(
      "面板半透明滤镜",
      "flagPanelGlass",
      "开启后管理面板半透明、透出页面内容并叠加背景模糊；关闭则完全不透明（默认关闭）。"
    )
  );
  configListElement.appendChild(
    createSettingRangeSlider(
      "面板透明度:",
      "panelGlassOpacity",
      "管理面板的不透明度：0.2（最透，再低就看不清内容）~ 1（完全不透明）。拖动中实时生效，松手后保存。"
    )
  );

  // ===== 分组 5：交互 =====
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
      "鼠标在被遮挡的卡片上停留多久后临时显示。"
    )
  );

  // ===== 分组 6：网络与性能 =====
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
      createEnumOptions("logLevel")
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
      "视频宽度/高度小于该阈值时判定为竖屏。建议值 0.7。"
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
