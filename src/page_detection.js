// 页面检测和初始化模块
window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.PageDetection = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;
  const UIElements = window.BilibiliBlacklist.UIElements;

  // 检查当前页面是否为Bilibili主页
  function isCurrentPageMain() {
    return location.pathname === "/";
  }

  // 初始化主页特有的功能
  function initializeMainPage() {
    initializeObserver("feedchannel-main"); // 观察主页内容区域
    console.log("[bilibili-blacklist] 主页已加载🍓");
  }

  // 检查当前页面是否为Bilibili搜索结果页
  function isCurrentPageSearch() {
    return location.hostname === "search.bilibili.com";
  }

  // 初始化搜索页特有的功能
  function initializeSearchPage() {
    initializeObserver("i_cecream"); // 观察搜索结果内容区域
    console.log("[bilibili-blacklist] 搜索页已加载🍉");
  }

  // 检查当前页面是否为Bilibili视频播放页
  function isCurrentPageVideo() {
    return location.pathname.startsWith("/video/");
  }

  // 初始化视频播放页特有的功能
  function initializeVideoPage() {
    // **用户修改 2: 延迟 5 秒启动屏蔽功能**
    console.log("[bilibili-blacklist] 播放页已加载，将延迟 5 秒启动功能。🍇");

    // 延迟 5 秒执行核心功能
    setTimeout(() => {
      initializeObserver("right-container"); // 观察视频播放页右侧推荐区域

      // 首次手动扫描和广告屏蔽
      CoreFeatures.scanAndBlockVideoCards();
      blockVideoPageAds();

      console.log("[bilibili-blacklist] 视频播放页屏蔽功能已启动。");
    }, 5000); // 5000 毫秒 = 5 秒
  }

  // 检查当前页面是否为Bilibili分类页
  function isCurrentPageCategory() {
    return location.pathname.startsWith("/c/");
  }

  // 初始化分类页特有的功能
  function initializeCategoryPage() {
    initializeObserver("app"); // 观察整个app容器
    console.log("[bilibili-blacklist] 分类页已加载🍊");
  }

  // 检查当前页面是否为Bilibili用户空间页
  function isCurrentUserSpace() {
    return location.hostname === "space.bilibili.com";
  }

  // 初始化用户空间页特有的功能
  function initializeUserSpace() {
    console.log("[bilibili-blacklist] 用户空间已加载🍎");
    const upNameSelector = "#h-name, .nickname"; // UP主名称的选择器
    // 创建一个MutationObserver来等待UP主名称元素加载
    const observerForUpName = new MutationObserver((mutations, observer) => {
      const upNameElement = document.querySelector(upNameSelector);
      if (upNameElement) {
        observer.disconnect(); // 找到元素后停止观察
        addBlockButtonToUserSpace(upNameElement);
      }
    });

    observerForUpName.observe(document.body, {
      childList: true,
      subtree: true,
    });
    // 立即检查一次，如果元素已经存在则直接处理
    const initialUpNameElement = document.querySelector(upNameSelector);
    if (initialUpNameElement) {
      observerForUpName.disconnect();
      addBlockButtonToUserSpace(initialUpNameElement);
    }
  }

  // 在用户空间页面上的UP主名称元素添加屏蔽/取消屏蔽按钮
  function addBlockButtonToUserSpace(upNameElement) {
    const upName = upNameElement.textContent.trim();
    // 避免重复添加按钮
    if (upNameElement.querySelector(".bilibili-blacklist-up-block-btn")) {
      return;
    }

    // 调整UP主名称元素的样式，以便容纳按钮
    upNameElement.style.display = "inline-flex";
    upNameElement.style.alignItems = "center";

    const button = document.createElement("button");
    button.className = "bilibili-blacklist-up-block-btn";
    button.textContent = "屏蔽";
    button.style.color = "#fff";
    button.style.width = "100px";
    button.style.height = "30px";
    button.style.marginLeft = "10px";
    button.style.borderRadius = "5px";
    button.style.border = "1px solid #fb7299";

    // 刷新按钮状态和页面灰度效果
    const refreshButtonStatus = () => {
      const blocked = CoreFeatures.isBlacklisted(upName);
      if (blocked) {
        button.textContent = "已屏蔽";
        button.style.backgroundColor = "#dddddd";
        button.style.border = "1px solid #ccc";
        upNameElement.style.textDecoration = "line-through"; // 添加删除线
        document.body.classList.add("bilibili-blacklist-grayscale"); // 添加灰度滤镜
      } else {
        button.textContent = "屏蔽";
        button.style.backgroundColor = "#fb7299";
        button.style.border = "1px solid #fb7299";
        upNameElement.style.textDecoration = "none"; // 移除删除线
        document.body.classList.remove("bilibili-blacklist-grayscale"); // 移除灰度滤镜
      }
    };

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const blocked = CoreFeatures.isBlacklisted(upName);
      if (blocked) {
        CoreFeatures.removeFromExactBlacklist(upName);
      } else {
        CoreFeatures.addToExactBlacklist(upName);
      }
      refreshButtonStatus(); // 更新按钮状态
    });

    refreshButtonStatus(); // 设置按钮初始状态

    upNameElement.appendChild(button);
  }

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
        CoreFeatures.scanAndBlockVideoCards();
        if (isCurrentPageMain()) {
          blockMainPageAds(); // 主页广告屏蔽
        }
        if (isCurrentPageVideo()) {
          blockVideoPageAds(); // 视频页广告屏蔽
        }
        if (!document.getElementById("bilibili-blacklist-manager-button")) {
          UIElements.addBlacklistManagerButton(); // 确保管理按钮存在
        }
      }, StorageManager.globalPluginConfig.blockScanInterval);
    }
  });

  // 在指定容器上初始化MutationObserver
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
      CoreFeatures.observerRetryCount++;

      if (CoreFeatures.observerRetryCount > 10) {
        console.error("[bilibili-blacklist] 重试次数过多，停止重试。");
        return false;
      }
    }
  }

  // 监听页面可见性变化
  document.addEventListener("visibilitychange", () => {
    CoreFeatures.isPageCurrentlyActive = !document.hidden;
  });

  return {
    isCurrentPageMain,
    initializeMainPage,
    isCurrentPageSearch,
    initializeSearchPage,
    isCurrentPageVideo,
    initializeVideoPage,
    isCurrentPageCategory,
    initializeCategoryPage,
    isCurrentUserSpace,
    initializeUserSpace,
    addBlockButtonToUserSpace,
    initializeObserver
  };
})();