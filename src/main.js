/*
 * 主入口模块
 * -----------------------------------------------------------
 * 页面功能初始化在 src/pages/pages.js（分页初始化 + 管理面板）。
 * 本文件负责：在文档已就绪而 DOMContentLoaded 事件已错过时，
 * 于全部模块求值完毕后立即初始化一次。
 */

// 当构建在 DOMContentLoaded 之后、load 之前被注入时
// （document.readyState === "interactive"/"complete"），上面的 DOMContentLoaded 监听已错过，
// 需要在全部模块求值完毕后立即初始化一次。
// 注意：必须放在本 IIFE 的最后。initializeScript() 会依赖 interceptor.js 的 NET_INTERCEPT、
// ads.js、autoplay.js 等在 pages.js 之后求值的模块；在 pages.js 段同步调用会因这些
// 变量尚未求值（NET_INTERCEPT 为 undefined）而抛错。这里所有模块已求值，可安全调用。
if (
  (document.readyState === "complete" || document.readyState === "interactive") &&
  typeof isfirstLoad !== "undefined" &&
  isfirstLoad
) {
  initializeScript();
}
