/*
 * 卡片按钮模块
 * -----------------------------------------------------------
 * 视频卡片上的「屏蔽」按钮与分类/视频标签按钮，以及它们共用的
 * 统一事件委托（避免每按钮各自 addEventListener 导致失效/重复绑定）。
 *
 * 说明：本文件只负责**创建按钮元素**与**把点击映射回卡片**；
 * 真正的屏蔽动作（加黑名单、放行）在 core.js。
 */

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
