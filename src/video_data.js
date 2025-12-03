// 视频数据获取模块
window.BilibiliBlacklist = window.BilibiliBlacklist || {};
window.BilibiliBlacklist.VideoDataFetcher = (function() {
  const StorageManager = window.BilibiliBlacklist.StorageManager;
  const CoreFeatures = window.BilibiliBlacklist.CoreFeatures;

  // 获取视频卡片的链接
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
    if (link.match(/cm.bilibili.com/) && StorageManager.globalPluginConfig.flagCM) {
      return true;
    }
    return false;
  }
  
  // 从视频卡片的链接中提取BV ID
  // 还处理cm.bilibili.com广告的屏蔽
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

  // 使用BV ID从Bilibili API获取视频信息
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

  // 检查卡片是否包含任何黑名单标签
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
        if (StorageManager.tagNameBlacklist.includes(tname)) {
          return true;
        }
      }
    }
    return false;
  }

  return {
    getCardHrefLink,
    checkLinkCM,
    getLinkBvId,
    getBilibiliVideoApiData,
    isCardBlacklistedByTagName
  };
})();