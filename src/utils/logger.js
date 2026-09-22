/*
 * 日志模块
 * -----------------------------------------------------------
 * 统一控制插件往控制台输出的**普通日志**（分两档），并保证错误/告警永远不被静音。
 *
 * 级别（globalPluginConfig.logLevel，面板「插件配置 → 网络与性能」可改）：
 *   "off"      完全关闭 —— 除错误与告警外，插件不输出任何日志（默认）
 *   "info"     关键信息 —— 分页初始化、用户触发的动作（自动连播跳转等）+ 错误与告警
 *   "verbose"  全部     —— 再加上缓存刷新、观察器重连、每次网络拦截等过程性细节
 *
 * 设计要点：
 *   - **错误与告警不受本开关影响**：所有 `console.error` / `console.warn` 调用点
 *     **保持原样、不经过本模块**，因此永远输出。这是刻意的 —— 出问题时不该因为
 *     "日志关了"而什么都看不到。
 *   - 分级函数在**每次调用时**读一遍级别，因此改配置立即生效，不需要刷新页面。
 *     （走 setter 绑定 console 方法虽然更快，但会让级别变更在下次刷新前不生效。）
 *   - 详细级走 console.debug：它在 DevTools 默认的 "Info" 级别下不显示，
 *     想看时把 Console 的级别切到 "Verbose" 即可，属于额外的一层过滤。
 *
 * ⚠️ 新增日志时请选对档位：只有"用户会关心发生了什么"的才用 blInfo，
 *   其余过程性细节一律 blVerbose —— 默认档位是 off，用户主动开日志时是来看重点的。
 *   新增错误/告警则直接用 console.error / console.warn，不要走本模块。
 */

// 级别取值表与默认值定义在 storage.js 的 defaultGlobalPluginConfig.logLevel
// （那里负责校验/修复非法取值）。本模块只负责"按级别决定要不要输出"。

/** 当前是否输出「关键信息」及以上（info / verbose） */
function isPluginLogEnabled() {
  return globalPluginConfig.logLevel !== "off";
}

/** 当前是否输出「全部」日志（仅 verbose） */
function isPluginVerboseLogEnabled() {
  return globalPluginConfig.logLevel === "verbose";
}

/**
 * 关键信息：分页初始化、脚本装载、用户可感知的动作结果。
 * @param {...*} args
 */
function blInfo(...args) {
  if (isPluginLogEnabled()) console.log(...args);
}

/**
 * 过程性细节：缓存刷新、观察器重连、每次网络拦截的过滤结果等。
 * @param {...*} args
 */
function blVerbose(...args) {
  if (isPluginVerboseLogEnabled()) console.debug(...args);
}
