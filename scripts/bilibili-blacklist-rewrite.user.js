// ==UserScript==
// @name         Bilibili BlackList -rw
// @namespace    none
// @version      2025-05-31
// @description  哔哩哔哩黑名单
// @author       TT
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         none
// @grant        none
// @require http://localhost:5173/scripts/bilibili-blacklist-rewrite.user.js?t=20250531
// ==/UserScript==
(function () {
  "use strict";
  //#region 核心功能
  // 视频卡片选择器
  const selectorVideoCards = [
    ".feed-card", // 旧版卡片样式
    ".bili-video-card", // 新版卡片样式
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
        // console.log(`UP主名称: ${upName}, 视频标题: ${title}`);
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
  function GetVideoInfo(card, callback) {
    // 获取视频信息 -UP主名称 -视频标题
    let flag = false; // 标志位，表示是否找到视频信息
    let upName = "";
    let title = "";
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
      initMainPage();
    } else {
      console.log("功能未启用");
    }
    BlockCard(); // 初始化时立即执行屏蔽
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

  //#endregion
  //#region 黑名单

  //#endregion
})();
