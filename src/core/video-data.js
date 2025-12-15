function loadVideoDataModule() {
  /**
   * 获取视频卡片的链接。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {string|null} 视频链接，如果未找到则返回null。
   */
  function getCardHrefLink(cardElement) {
    const hrefLink = cardElement.querySelector("a");
    if (hrefLink) {
      return hrefLink.getAttribute("href");
    }
    return null;
  }

  function checkLinkCM(link) {
    if (!link) return false;
    // 如果是cm.bilibili.com的链接，且启用了CM广告屏蔽，则隐藏卡片
    if (link.match(/cm.bilibili.com/) && globalPluginConfig.flagCM) {
      return true;
    }
    return false;
  }
  /**
   * 从视频卡片的链接中提取BV ID。
   * 还处理cm.bilibili.com广告的屏蔽。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {string|null} BV ID，如果未找到/被屏蔽则返回null。
   */
  function getLinkBvId(link) {
    try {
      if (!link) {
        return null;
      } else {
        const bv = link.match(/BV\w+/);
        return bv ? bv[0] : null;
      }
    } catch (e) {
      return null;
    }
  }

  /**
   * 使用BV ID从Bilibili API获取视频信息。
   * @param {string} bvid - 视频的BV ID。
   * @returns {Promise<object|null>} 解析为视频数据或null的Promise。
   */
  async function getBilibiliVideoApiData(bvid) {
    if (!bvid || bvid.length >= 24) {
      return null;
    }
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.code === 0) {
        return json.data;
      } else {
        return null;
      }
    } catch (error) {
      console.error("[bilibili-blacklist] API 请求失败:", error);
    }
  }
  // 12-14-2025 临时修复-api.bilibili.com/x/web-interface/view获取的json TName 为空
  async function getBilibiliSearchVideoApiData(bvid) {
    if (!bvid || bvid.length >= 24) {
      return null;
    }
    const url = `https://api.bilibili.com/x/web-interface/wbi/search/type?category_id=&search_type=video&__refresh__=true&keyword=${bvid}`;
    try {
      const response = await fetch(url);
      const json = await response.json();
      console.log('s1');
      console.log(json);
      if (json.code === 0) {
        return json.data;
      } else {
        return null;
      }
    } catch (error) {
      console.error("[bilibili-blacklist] Search API 请求失败:", error);
    }
  }
  /**
   * 检查卡片是否包含任何黑名单标签。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {boolean} 如果有任何标签被列入黑名单，则返回true，否则返回false。
   */
  function isCardBlacklistedByTagName(cardElement) {
    const tnameGroup = cardElement.querySelector(
      ".bilibili-blacklist-tname-group"
    );
    if (tnameGroup) {
      const tnameElements = tnameGroup.querySelectorAll(
        ".bilibili-blacklist-tname"
      );
      for (const tnameElement of tnameElements) {
        const tname = tnameElement.textContent.trim();
        if (tagNameBlacklist.includes(tname)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 处理视频卡片队列进行屏蔽。
   */
  async function processVideoCardQueue() {
    if (isVideoCardQueueProcessing) return;
    isVideoCardQueueProcessing = true;

    while (videoCardProcessQueue.size > 0) {
      // 如果页面不可见，则暂停处理
      if (!isPageCurrentlyActive) {
        await sleep(1000);
        continue;
      }

      const iterator = videoCardProcessQueue.values();
      const card = iterator.next().value;
      videoCardProcessQueue.delete(card);

      if (!card || processedVideoCards.has(card)) {
        continue;
      }

      let shouldHide = false;
      let blockType = "none";
      // 如果启用了标签屏蔽且当前卡片未被隐藏
      const link = getCardHrefLink(card);
      if (checkLinkCM(link)) {
        shouldHide = true;
        blockType = "cm";
      }
      const { upName, videoTitle } = getVideoCardInfo(card);
      if (upName && videoTitle && !shouldHide) {
        // 如果UP主名称或标题在黑名单中，且启用了信息屏蔽
        if (isBlacklisted(upName, videoTitle) && globalPluginConfig.flagInfo) {
          shouldHide = true;
          blockType = "info";
        }
      } else {
        // 如果无法获取UP主名称和标题，但卡片已被隐藏或有Kirby覆盖，则也认为应该隐藏
        if (
          getRealVideoCardElement(card).style.display === "none" &&
          !globalPluginConfig.flagKirby
        ) {
          shouldHide = true;
        } else if (
          getRealVideoCardElement(card).querySelector(
            "#bilibili-blacklist-kirby"
          )
        ) {
          shouldHide = true;
        }
      }

      if (
        (globalPluginConfig.flagTName || globalPluginConfig.flagVertical) &&
        !shouldHide
      ) {
        const bvId = getLinkBvId(link);
        // 如果存在BV ID且卡片尚未添加标签组
        if (bvId && !card.querySelector(".bilibili-blacklist-tname-group")) {
          const data = await getBilibiliVideoApiData(bvId);
          if (data) {
            const container = card.querySelector(
              ".bilibili-blacklist-block-container"
            );
            if (container) {
              const tnameGroup = document.createElement("div");
              tnameGroup.className = "bilibili-blacklist-tname-group";
              let hasTname = false;

              if (data.tname) {
                const btn = createTNameBlockButton(data.tname, card);
                tnameGroup.appendChild(btn);
                hasTname = true;
              }
              if (data.tname_v2) {
                const tnameElement = createTNameBlockButton(
                  data.tname_v2,
                  card
                );
                tnameGroup.appendChild(tnameElement);
                hasTname = true;
              }
              if (hasTname) {
                container.appendChild(tnameGroup);
              }
            }

            if (isCardBlacklistedByTagName(card)) {
              shouldHide = true;
              blockType = "tname";
            }
            // 如果启用了垂直视频屏蔽
            if (
              data.dimension.width &&
              data.dimension.height &&
              !shouldHide &&
              globalPluginConfig.flagVertical
            ) {
              const dimension = data.dimension.width / data.dimension.height;
              if (dimension < globalPluginConfig.verticalScaleThreshold) {
                shouldHide = true;
                blockType = "vertical";
              }
            }
          }
        }
      }

      if (shouldHide) {
        hideVideoCard(card, blockType);
      } else {
        const realCardToDisplay = getRealVideoCardElement(card);
        if (blockedVideoCards.has(realCardToDisplay)) {
          blockedVideoCards.delete(realCardToDisplay);
        }
        if (globalPluginConfig.flagKirby) {
          removeKirbyOverlay(card);
        }
        realCardToDisplay.style.display = "block";
      }

      processedVideoCards.add(card); // 标记卡片已处理

      await sleep(globalPluginConfig.processQueueInterval || 100);
    }
    isVideoCardQueueProcessing = false;
    refreshBlockCountDisplay();
  }

  // 异步等待函数
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}