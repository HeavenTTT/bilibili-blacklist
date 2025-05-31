// ==UserScript==
// @name         bilibili-blacklist-rewrite
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      2025-05-31
// @description  哔哩哔哩黑名单
// @description  屏蔽指定UP主的视频推荐，支持精确匹配和正则表达式匹配
// @author       TT
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @require      https://github.com/HeavenTTT/bilibili-blacklist/raw/refs/heads/main/scripts/bilibili-blacklist-rewrite.user.js
// ==/UserScript==
(function () {
  "use strict";
  // 从存储中获取黑名单
  // 默认精确匹配黑名单（区分大小写）
  let exactBlacklist = GM_getValue("exactBlacklist", [
    "绝区零",
    "崩坏星穹铁道",
    "崩坏3",
    "原神",
    "米哈游miHoYo",
  ]);
  // 默认正则匹配黑名单
  let regexBlacklist = GM_getValue("regexBlacklist", [
    "王者荣耀.*",
    "和平精英.*",
    "PUBG.*",
    "绝地求生.*",
    "吃鸡.*",
  ]);
  // 新增标题正则黑名单
  let titleRegexBlacklist = GM_getValue("titleRegexBlacklist", ["原神.*"]);
  // 保存黑名单到存储
  function saveBlacklists() {
    GM_setValue("exactBlacklist", exactBlacklist);
    GM_setValue("regexBlacklist", regexBlacklist);
    GM_setValue("titleRegexBlacklist", titleRegexBlacklist);
  }
  //#region 核心功能 - 屏蔽视频卡片
  let isShowAll = false; // 是否显示全部视频卡片
  let blockCount = 0; // 屏蔽的视频卡片数量
  //let blockedCards = []; // 存储已屏蔽的视频卡片
  // 视频卡片选择器
  const selectorVideoCards = [
    ".feed-card", // 旧版卡片样式
    ".bili-video-card", // 新版卡片样式
    ".video-page-card-small", // 播放页小卡片
  ];
  /// 查找所有视频卡片
  function querySelectorAllVideoCard() {
    return selectorVideoCards.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    ); // 使用flatMap将所有选择器匹配到的元素合并为一个数组
  }

  function BlockCard() {
    const cards = querySelectorAllVideoCard();
    console.log("检测到视频卡片数量:", cards.length);
    cards.forEach((card) => {
      // 获取视频信息
      GetVideoInfo(card, (upName, title) => {
        //console.log(`UP主名称: ${upName}, 视频标题: ${title}`);
        if (upName && title) {
          // 如果UP主名称和视频标题都存在
          if (!card.querySelector(".bilibili-blacklist-block-btn")) {
            // 创建屏蔽按钮
            const blockButton = createBlockButton(upName);
            card.appendChild(blockButton); // 将按钮添加到卡片中
            console.log(`已添加屏蔽按钮: ${upName}`);
          }

          // 检查是否在黑名单中
          if (isBlacklisted(upName, title)) {
            // 如果在黑名单中，则隐藏卡片
            if (!isShowAll) {
              card.style.display = "none"; // 隐藏卡片
              blockCount++; // 增加屏蔽计数
              //blockedCards.push(card); // 将卡片添加到已屏蔽列表
              console.log(`已屏蔽视频: ${title} (UP主: ${upName})`);
            }
          }
        }
      });
    });
  }

  const selectorUpName = [
    ".bili-video-card__info--author", // 主页
    ".bili-video-card__author", // 分类页面--> span title
    ".name", // 播放页面
  ];
  const selectorTitle = [
    ".bili-video-card__info--tit", // 主页
    ".bili-video-card__title", // 分类页面--> span title
    ".title", // 播放页面
  ];
  //获取视频信息 -UP主名称 -视频标题
  function GetVideoInfo(card, callback) {
    let flag = false; // 标志位，表示是否找到视频信息
    let upName = "";
    let title = "";
    if (card.style.display === "none") return false; // 如果卡片已经被隐藏，则跳过
    const upNameElement = card.querySelectorAll(selectorUpName.join(", ")); // 使用逗号分隔的选择器
    if (upNameElement.length > 0) {
      //TODO:处理分类页面的span title
      upName = upNameElement[0].textContent.trim(); // 获取第一个匹配到的元素的内容，并去除首尾空格
    }
    const titleElement = card.querySelectorAll(selectorTitle.join(", ")); // 使用逗号分隔的选择器
    if (titleElement.length > 0) {
      //TODO:处理分类页面的span title
      title = titleElement[0].textContent.trim(); // 获取第一个匹配到的元素的内容，并去除首尾空格
    }
    if (upName && title) {
      flag = true;
      callback(upName, title);
    }
    return flag;
  }
  function isBlacklisted(upName, title) {
    //TODO:判断是否在黑名单中
    if (exactBlacklist.includes(upName)) {
      console.log(`精确匹配黑名单: ${upName}`);
      return true; // 精确匹配黑名单
    }
    if (regexBlacklist.some((regex) => new RegExp(regex).test(upName))) {
      console.log(`正则匹配黑名单: ${upName}`);
      return true; // 正则匹配黑名单
    }
    if (titleRegexBlacklist.some((regex) => new RegExp(regex).test(title))) {
      console.log(`新增标题正则黑名单: ${title}`);
      return true; // 新增标题正则黑名单
    }
    return false; // 不在黑名单中
  }
  //#endregion
  //#region 页面修改
  //创建屏蔽按钮（悬停在视频卡片上时显示）
  function createBlockButton(upName) {
    const btn = document.createElement("div");
    btn.className = "bilibili-blacklist-block-btn";
    btn.innerHTML = "×";
    btn.title = "屏蔽此UP主";

    // 屏蔽按钮样式
    btn.style.position = "absolute";
    btn.style.top = "5px";
    btn.style.left = "5px";
    btn.style.width = "40px";
    btn.style.height = "20px";
    btn.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    btn.style.color = "white";
    btn.style.borderRadius = "5%";
    btn.style.display = "none";
    btn.style.justifyContent = "center";
    btn.style.alignItems = "center";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "100";
    btn.style.fontSize = "16px";
    btn.style.fontWeight = "bold";
    btn.style.transition = "opacity 0.2s";

    // 点击时添加到黑名单
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // 防止事件冒泡
      addToExactBlacklist(upName);
    });

    return btn;
  }
  // 添加全局样式
  GM_addStyle(`
        /* 屏蔽按钮悬停效果 */
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
        /* 修复视频卡片布局 */
        .bili-video-card__cover {
            contain: layout !important;
        }
        /* 确保屏蔽按钮可点击 */
        .bilibili-blacklist-block-btn {
            pointer-events: auto !important;
        }
        /* 面板样式 */
        #bilibili-blacklist-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        /* 按钮悬停效果 */
        #bilibili-blacklist-panel button {
            transition: background-color 0.2s;
        }
        #bilibili-blacklist-panel button:hover {
            opacity: 0.9;
        }
        /* 管理按钮悬停效果 */
        #bilibili-blacklist-manager:hover svg {
            transform: scale(1.1);
        }
        #bilibili-blacklist-manager svg {
            transition: transform 0.2s;
        }
        /* 输入框聚焦效果 */
        #bilibili-blacklist-panel input:focus {
            outline: none;
            border-color: #fb7299 !important;
        }
    `);
  //#endregion
  //##########################

  //#region 观察者
  // MutationObserver 检测动态加载的新内容（仅当节点可见时才触发）
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        // 检查新增节点是否可见（有宽度或高度）
        shouldCheck = Array.from(mutation.addedNodes).some((node) => {
          // 仅检查元素节点（跳过文本节点、注释等）
          if (node.nodeType !== Node.ELEMENT_NODE) return false;

          // 检查元素或其子元素是否可见
          const hasVisibleContent =
            node.offsetWidth > 0 ||
            node.offsetHeight > 0 ||
            node.querySelector("[offsetWidth], [offsetHeight]");

          return hasVisibleContent;
        });
      }
    });

    // 如果有可见的新内容，延迟 1 秒后执行屏蔽（确保 DOM 完全渲染）
    if (shouldCheck) {
      setTimeout(() => {
        BlockCard();
      }, 1000);
    }
  });

  // 初始化观察者（监视 DOM 变化）
  let observerError = 0;
  function initObserver(container) {
    const rootNode =
      document.getElementById(container) || // B站的主容器 ID
      document.documentElement; // 回退到整个文档

    if (rootNode) {
      observer.observe(rootNode, {
        childList: true, // 监视添加/移除的节点
        subtree: true, // 监视所有后代
      });
      return true;
    } else {
      // 如果没找到根节点则重试
      setTimeout(() => initObserver(container), 500);
      console.warn("未找到根节点，正在重试...");
      observerError++;

      if (observerError > 10) {
        console.error("重试次数过多，停止重试。");
        return false;
      }
    }
  }
  //#endregion
  //#region 初始化函数
  function init() {
    if (isMainPage()) {
      initMainPage(); // 初始化主页
    } else if (isSearchPage()) {
      initSearchPage(); // 初始化搜索页
    } else if (isVideoPage()) {
      initVideoPage(); // 初始化播放页
    }else if (isCategoryPage()) {
      initCategoryPage(); // 初始化分类页
    } 
     else {
      console.log("功能未启用");
    }
    BlockCard(); // 初始化时立即执行屏蔽
    saveBlacklists(); // 初始化时保存黑名单
    console.log("BiliBili黑名单脚本已加载🥔");
  }
  // 监听页面加载完成事件
  document.addEventListener("DOMContentLoaded", init);
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    init();
  }
  // 检查当前页面是否为B站主页
  function isMainPage() {
    return location.pathname === "/";
  }

  function initMainPage() {
    initObserver("i_cecream"); // 传入B站主页的主容器ID
    console.log("主页已加载🍓");
  }
  /// ----主页结束----
  /// -----搜索页----
  function isSearchPage() {
    //页面链接 https://search.bilibili.com/all?keyword=xxx
    // 通过检查路径名是否以 "/search" 开头来判断是否为搜索页
    return location.hostname === "search.bilibili.com";
  }
  function initSearchPage() {
    initObserver("i_cecream"); // 传入B站搜索页的主容器ID
    console.log("搜索页已加载🍉");
  }
  /// --- 搜索页结束---
  /// --- 播放页 ---
  function isVideoPage() {
    // 页面链接 https://www.bilibili.com/video/BV1xxxxxx
    // 通过检查路径名是否以 "/video/" 开头来判断是否为视频页
    return location.pathname.startsWith("/video/");
  }
  function initVideoPage() {
    initObserver("app"); // 传入B站播放页的主容器ID
    console.log("播放页已加载🍇");
  }
  /// ---- 播放页结束 ---
  /// ---- 分类页 ----
    function isCategoryPage() {
        // 页面链接 https://www.bilibili.com/c/xxxxxx
        // 通过检查路径名是否以 "/c/" 开头来判断是否为分类页
        return location.pathname.startsWith("/c/");
    }
    function initCategoryPage() {
        initObserver("app"); // 传入B站分类页的主容器ID
        console.log("分类页已加载🍊");
    }
  /// --- 分类页结束 ---
  //#endregion
})();
