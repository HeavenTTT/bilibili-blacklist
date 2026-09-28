/*
 * 屏蔽类型注册表（单一真源）
 * -----------------------------------------------------------
 * info / ad / cm / tname / videoTag / vertical 六种屏蔽类型的**全部元数据只在这里定义一次**：
 *
 *   label          类型名（原因文案用："屏蔽原因: 广告"）
 *   panelLabel     面板统计明细里的行标签（缺省 = label）
 *   flag           控制该类型开关的配置键（globalPluginConfig 里的字段）
 *   displayModeKey 该类型的「显示方式」配置键（displayMode*，见 domain/settings 的校验）
 *   cancellable    「本卡放行」是否可用（点击原因按钮删除对应黑名单规则）
 *   valuePrefix    原因文案里具体内容的前缀（"UP: xxx" / "标签: xxx"）
 *
 * 为什么要有这张表：这些知识原本散落在 7 处 ——
 *   core.js 的 BLOCK_REASON_MAP / getEffectiveDisplayMode / hideVideoCard 计数 /
 *   decrementBlockCounter，storage.js 的 PER_TYPE_DISPLAY_KEYS，
 *   ui.js 的 BLOCK_STATS_GROUPS，interceptor.js 的 STREAM_REASON_TEXT。
 * 结果是「新增一种屏蔽类型」要改 7 个地方，漏一处就静默不一致。
 * 现在只需在 BLOCK_TYPES 里加一项 + 在 BLOCK_TYPE_ORDER 里排个位置。
 *
 * 模块顺序：本文件必须最先求值 —— core.js 在求值期就要用 createBlockCounters()。
 * 其余对外部的读取（globalPluginConfig / 黑名单数组）都发生在函数调用期，不在求值期。
 */

/** 正则命中 info 类型时的哨兵值：无法定位具体规则，因此不支持“本卡放行”。 */
const REGEX_BLOCK_VALUE = "__regex__";

const BLOCK_TYPES = {
  info: {
    label: "标题/UP主名",
    panelLabel: "UP/标题名",
    flag: "flagInfo",
    displayModeKey: "displayModeInfo",
    cancellable: true,
    valuePrefix: "UP: ",
  },
  ad: {
    label: "广告",
    flag: "flagAD",
    displayModeKey: "displayModeAD",
  },
  cm: {
    label: "软广",
    panelLabel: "CM 软广",
    flag: "flagCM",
    displayModeKey: "displayModeCM",
  },
  tname: {
    label: "分类标签",
    flag: "flagTName",
    displayModeKey: "displayModeTName",
    cancellable: true,
    valuePrefix: "标签: ",
  },
  videoTag: {
    label: "视频标签",
    flag: "flagVideoTag",
    displayModeKey: "displayModeVideoTag",
    cancellable: true,
    valuePrefix: "视频标签: ",
  },
  vertical: {
    label: "竖屏视频",
    panelLabel: "竖屏",
    flag: "flagVertical",
    displayModeKey: "displayModeVertical",
  },
};

/** 展示顺序（面板统计明细、持久化字段顺序都按它） */
const BLOCK_TYPE_ORDER = ["info", "ad", "cm", "tname", "videoTag", "vertical"];

/** 是否为已登记的屏蔽类型。 */
function isBlockType(type) {
  return Object.prototype.hasOwnProperty.call(BLOCK_TYPES, type);
}

/** 全部屏蔽类型（按展示顺序）。 */
function getBlockTypeKeys() {
  return BLOCK_TYPE_ORDER.slice();
}

/** 各屏蔽类型「显示方式」对应的配置键（storage 校验与 ui 面板共用）。 */
function getPerTypeDisplayKeys() {
  return BLOCK_TYPE_ORDER.map((type) => BLOCK_TYPES[type].displayModeKey);
}

/** 该屏蔽类型当前是否启用（由注册表里的 flag 决定，调用方不再写死配置键名）。 */
function isBlockTypeEnabled(type) {
  const def = BLOCK_TYPES[type];
  return !!def && !!globalPluginConfig[def.flag];
}

/**
 * 类型名文案。
 * @param {string} type
 * @param {boolean} [forPanel] 面板统计行用 panelLabel（缺省回退 label）。
 * @returns {string}
 */
function getBlockTypeLabel(type, forPanel) {
  const def = BLOCK_TYPES[type];
  if (!def) return type;
  return (forPanel && def.panelLabel) || def.label;
}

/**
 * 计算某屏蔽类型最终使用的显示模式（支持按类型覆盖全局）。
 * @param {string} type - 屏蔽类型：info/ad/tname/videoTag/cm/vertical
 * @returns {string} blur | kirby | hide
 */
function getEffectiveDisplayMode(type) {
  const def = BLOCK_TYPES[type];
  const per = def ? globalPluginConfig[def.displayModeKey] : null;
  if (per && per !== "inherit") return per;
  return globalPluginConfig.blockDisplayMode;
}

/**
 * 该原因是否支持“点击取消”（= 存在可删除的黑名单规则）。
 * 只支持 info 精确匹配、tname 与 videoTag：点取消会把对应规则从黑名单删除；
 * 正则无法定位具体规则（哨兵值），cm/竖屏/广告没有可删除的规则。
 * @param {string} type - 屏蔽类型。
 * @param {string|null} reasonValue - 具体内容。
 * @returns {boolean}
 */
function isReasonCancellable(type, reasonValue) {
  const def = BLOCK_TYPES[type];
  if (!def || !def.cancellable) return false;
  return !!reasonValue && reasonValue !== REGEX_BLOCK_VALUE;
}

/**
 * 生成卡片屏蔽原因的显示文案（要求：屏蔽原因按钮显示具体的屏蔽内容）。
 * - info 精确匹配：显示具体 UP 名；info 正则匹配：无法定位具体规则，写明原因（不支持取消）；
 * - tname / videoTag：显示具体标签名；
 * - 其余（cm/竖屏/广告）：显示类型文案（不支持取消）。
 * @param {string} type - 屏蔽类型。
 * @param {string|null} reasonValue - 具体内容（UP 名 / 标签名 / REGEX_BLOCK_VALUE）。
 * @returns {string}
 */
function buildBlockReasonText(type, reasonValue) {
  if (type === "info" && reasonValue === REGEX_BLOCK_VALUE) {
    return "屏蔽原因: 正则匹配(无法定位具体规则,请在面板移除对应正则)";
  }
  const def = BLOCK_TYPES[type];
  if (def && def.valuePrefix && reasonValue) {
    return `屏蔽原因: ${def.valuePrefix}${reasonValue}`;
  }
  return `屏蔽原因: ${(def && def.label) || type}`;
}

/**
 * 各屏蔽类型的计数（键与 BLOCK_TYPES 一一对应）。
 * 放在注册表旁边，是为了让「类型 ↔ 计数」的关系只有一处定义：
 * 之前它是 core.js 的 6 个独立变量 + 6 条自增 if + 6 条自减分支 + stats 映射 + 面板标签。
 */
function createBlockCounters() {
  const counters = {};
  BLOCK_TYPE_ORDER.forEach((type) => {
    counters[type] = 0;
  });
  return counters;
}
