/*
 * 样式模块
 * -----------------------------------------------------------
 * 插件全部 CSS，由 GM_addStyle 在脚本求值期一次性注入。
 *
 * 为什么单独成文件：原来它与面板/遮盖层/图标挤在同一个 2200 行的 ui.js 里，
 * 占了近 600 行，既难以定位也把 JS 的 diff 淹没。
 *
 * ⚠️ 维护提示：
 *   - 模板字面量内部会被构建器原样写进产物（含 CSS 注释），不受去注释影响；
 *   - 卡比遮罩的 transition 时长在下面直接插值 KIRBY_FADE_DURATION_MS，
 *     因此 JS 计时器与 CSS 动画只可能有一个来源。
 */

/** 卡比遮罩渐隐/渐显时长（毫秒）；CSS 的 transition 时长由下面的插值生成。 */
const KIRBY_FADE_DURATION_MS = 800;

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

  /* ===== 灰度效果：空间页「已屏蔽 UP」整页黑白 =====
   * 由 pages.js 的 addBlockButtonToUserSpace 按屏蔽状态给 document.body 增删。
   * 2.0.1 曾移除过这条规则（理由是 favlist/合集页里与该 UP 无关的视频也被灰掉），
   * 现已按需求恢复；不要因为同样的理由再次删除 —— 那会让空间页完全没有整体视觉提示。
   * 若要去掉副作用，请改成全屏 backdrop-filter 遮罩层，而不是删掉这条规则。 */
  .bilibili-blacklist-grayscale {
    filter: grayscale(95%);
  }
`);
