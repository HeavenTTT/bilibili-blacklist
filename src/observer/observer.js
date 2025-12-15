function loadObserverModule() {
  // 监听页面可见性变化
  document.addEventListener("visibilitychange", () => {
    isPageCurrentlyActive = !document.hidden;
  });

  // 监听窗口焦点获取 (用户请求停用)
  /*
  window.addEventListener("focus", () => {
    isPageCurrentlyActive = true;
  });
  */

  // 监听窗口焦点失去 (用户请求停用)
  /*
  window.addEventListener("blur", () => {
    isPageCurrentlyActive = false;
  });
  */

  // MutationObserver 检测动态加载的新内容
  const contentObserver = new MutationObserver((mutations) => {
    let shouldCheck = false;
    // 对视频播放页进行优化，只在实际添加了可见元素时触发扫描
    if (isCurrentPageVideo()) {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            // 检查节点是否有实际的尺寸，避免不必要的扫描
            const hasVisibleContent =
              node.offsetWidth > 0 ||
              node.offsetHeight > 0 ||
              node.querySelector("[offsetWidth], [offsetHeight]");
            return hasVisibleContent;
          });
        }
        getVideoPageState();
      });
    } else {
      // 其他页面只要有节点添加就触发
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
        }
      });
    }

    if (shouldCheck) {
      // 使用setTimeout延迟扫描，避免短时间内多次触发

      setTimeout(() => {
        scanAndBlockVideoCards();
        if (isCurrentPageMain()) {
          blockMainPageAds(); // 主页广告屏蔽
        }
        if (isCurrentPageVideo()) {
          blockVideoPageAds(); // 视频页广告屏蔽
        }
        if (!document.getElementById("bilibili-blacklist-manager-button")) {
          addBlacklistManagerButton(); // 确保管理按钮存在
        }
      }, globalPluginConfig.blockScanInterval);
    }
  });

  /**
   * 在指定容器上初始化MutationObserver。
   * @param {string} containerIdOrSelector - 要观察的容器的ID或CSS选择器。
   * @returns {boolean} 如果观察器成功初始化则返回true，否则返回false。
   */
  function initializeObserver(containerIdOrSelector) {
    const rootNode =
      document.getElementById(containerIdOrSelector) ||
      document.querySelector(containerIdOrSelector) ||
      document.documentElement; // 默认观察整个文档

    if (rootNode) {
      contentObserver.observe(rootNode, {
        childList: true,
        subtree: true,
      });
      return true;
    } else {
      // 如果未找到根节点，则进行重试
      setTimeout(() => initializeObserver(containerIdOrSelector), 500);
      console.warn("[bilibili-blacklist] 未找到根节点，正在重试...");
      observerRetryCount++;

      if (observerRetryCount > 10) {
        console.error("[bilibili-blacklist] 重试次数过多，停止重试。");
        return false;
      }
    }
  }
}