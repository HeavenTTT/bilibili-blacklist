/*
 * 遮盖层模块
 * -----------------------------------------------------------
 * 被屏蔽卡片的遮盖表现与交互：
 *   - 遮罩层（blur 纯模糊 / kirby 模糊加卡比），渐显渐隐；
 *   - 悬停临时显示（鼠标停留 N 秒后临时揭开，移开恢复）。
 *
 * 宿主选择有页面差异：分类页/动态页的「真实卡片」是内层元素，遮罩挂在外层会覆盖
 * 整条卡片（动态页还会盖住转发正文），因此 addDisplayOverlayToCard 里单独处理。
 * 渐隐时长来自 ui/styles.js 的 KIRBY_FADE_DURATION_MS（CSS transition 也用它）。
 */

/** 已绑定悬停行为的卡片（避免重复 addEventListener）。 */
const hoverRevealBoundCards = new WeakSet();
/** 每张卡片的悬停计时器（mouseleave 时取消）。 */
const hoverRevealTimers = new WeakMap();
/** 每个遮罩层的渐隐计时器（避免渐隐/渐显竞争）。 */
const kirbyFadeTimers = new WeakMap();

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
