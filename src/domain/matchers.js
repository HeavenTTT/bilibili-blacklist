/*
 * 屏蔽判定（单一真源）
 * -----------------------------------------------------------
 * 「一张卡片的分类标签 / 视频标签 / 竖屏是否命中黑名单」这套规则，原来有**三套独立实现**：
 *   - src/core/video-data.js     —— 卡片判定（DOM 标签按钮 + 接口数据）
 *   - src/autoplay/autoplay.js   —— 自动连播判定（只吃接口数据）
 *   - src/network/interceptor.js —— 网络拦截判定（只吃未过期缓存）
 * 三处各写一遍 tname / tname_v2 / tid_v2 映射与宽高比比较，规则一改就得改三处，
 * 而且已经出现口径差异（autoplay 会自己发请求、interceptor 只吃缓存）。
 *
 * 现在统一到这里，并按**输入形态**分成两组，避免调用方各自再解释一遍数据：
 *   ...InCard(card) —— 输入是 DOM 卡片（读插件自己插的标签按钮）
 *   ...InData(data) —— 输入是 view / tag 接口的响应数据
 *
 * 依赖说明：本模块只做纯判定，不发请求、不写 DOM。用到的黑名单与配置都在调用期读取
 * （tagNameBlacklist / videoTagBlacklist / globalPluginConfig 由 storage.js 提供），
 * getEligibleVideoTags 由 core/video-data.js 提供（同一 IIFE 内的函数声明，已提升）。
 */

/**
 * 返回卡片上第一个命中分类黑名单的标签名。
 *
 * 对卡片标签组里的每个标签按钮逐个判定：
 *   标签文本本身在 tagNameBlacklist，或按 V2 映射出的名称在黑名单中 → 视为命中。
 * 返回的标签名用于：屏蔽原因按钮显示具体内容、以及“取消屏蔽”时从黑名单删除该规则。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} 命中的标签名，没有则返回 null。
 */
function matchTNameInCard(cardElement) {
  const tnameGroup = cardElement.querySelector(
    ".bilibili-blacklist-tname-group"
  );
  if (!tnameGroup) return null;
  const tnameElements = tnameGroup.querySelectorAll(
    ".bilibili-blacklist-tname"
  );
  for (const tnameElement of tnameElements) {
    const tname = tnameElement.textContent.trim();
    if (!tname) continue;
    let matched = null;
    if (tagNameBlacklist.includes(tname)) {
      matched = tname;
    } else {
      // 卡片上显示的是 V2 名时，按 V2 映射回名称再判断
      const name = getTagNameByV2(tname);
      if (name !== null && tagNameBlacklist.includes(name)) {
        matched = name;
      }
    }
    if (matched === null) continue;
    return matched;
  }
  return null;
}

/**
 * 检查卡片是否包含任何黑名单标签（放行感知）。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {boolean} 如果有任何标签被列入黑名单，则返回true，否则返回false。
 */
function isCardBlacklistedByTagName(cardElement) {
  return !!matchTNameInCard(cardElement);
}

/**
 * 返回卡片上第一个命中的视频标签黑名单项。
 * @param {HTMLElement} cardElement - 视频卡片元素。
 * @returns {string|null} 命中的视频标签名，没有则返回 null。
 */
function matchVideoTagInCard(cardElement) {
  const videoTagElements = cardElement.querySelectorAll(
    ".bilibili-blacklist-video-tag"
  );
  for (const videoTagElement of videoTagElements) {
    const tagName = (videoTagElement.textContent || "").trim();
    if (tagName && videoTagBlacklist.includes(tagName)) {
      return tagName;
    }
  }
  return null;
}

/**
 * 判断 view 接口数据是否命中“分类标签”黑名单（与卡片屏蔽逻辑一致）。
 * 依次看 tname / tname_v2 / tid_v2 映射出的名称。
 * @param {object} data - 一个视频的 view 接口数据。
 * @returns {boolean}
 */
function matchTNameInData(data) {
  if (!data) return false;
  const checkTname = (tname) => {
    if (!tname) return false;
    if (tagNameBlacklist.includes(tname)) return true;
    const mapped = getTagNameByV2(tname); // 若该名字是 V2 名，映射回主名再判断
    if (mapped !== null && tagNameBlacklist.includes(mapped)) return true;
    return false;
  };
  if (checkTname(data.tname)) return true;
  if (checkTname(data.tname_v2)) return true;
  if (data.tid_v2 !== undefined && data.tid_v2 !== null) {
    const obj = getTagNameById(data.tid_v2);
    if (obj) {
      if (checkTname(obj.name)) return true;
      if (obj.name_v2 && checkTname(obj.name_v2)) return true;
    }
  }
  return false;
}

/**
 * 返回 tag 接口数据里第一个命中的视频标签名（沿用 getEligibleVideoTags 的过滤规则：
 * 音乐 / 话题标签不参与匹配）。
 * @param {object} data - getBilibiliVideoTagApiData 返回的 { videoTags: [...] }。
 * @returns {string|null} 命中的标签名，没有则返回 null。
 */
function matchVideoTagInData(data) {
  if (!data) return null;
  const tags = getEligibleVideoTags(data);
  for (let i = 0; i < tags.length; i++) {
    if (videoTagBlacklist.indexOf(tags[i]) !== -1) return tags[i];
  }
  return null;
}

/**
 * 计算视频的**显示**宽高比（width / height）。
 *
 * B 站 view 接口的 `dimension` 给的是**编码**尺寸，不是显示方向：手机竖拍的视频常上报
 * `width > height` 且 `rotate = 1`（语义：顺时针旋转 90° 后显示）。例如
 * `{width:1920, height:1080, rotate:1}` 实际是竖屏视频，直接算 1920/1080 = 1.78 会被判成横屏
 * —— 于是「竖屏屏蔽」与「自动连播跳过」对这类视频双双失效（实测 BV12Q6TBwE1u 即为此形态）。
 * @param {object} data - 一个视频的 view 接口数据。
 * @returns {number|null} 显示宽高比；尺寸缺失时返回 null。
 */
function getDisplayAspectRatio(data) {
  const dimension = data && data.dimension;
  if (!dimension) return null;
  const width = Number(dimension.width);
  const height = Number(dimension.height);
  if (!width || !height) return null;
  const rotate = Math.abs(Number(dimension.rotate) || 0);
  // 1 = B 站文档里的「顺时针旋转 90°」；同时兼容直接给 90 / 270 的写法
  const swapped = rotate === 1 || rotate % 180 === 90;
  return swapped ? height / width : width / height;
}

/**
 * 判断视频是否为竖屏（与卡片屏蔽逻辑一致：**显示**宽高比 < 配置阈值）。
 * @param {object} data - 一个视频的 view 接口数据。
 * @returns {boolean}
 */
function isVerticalVideo(data) {
  const ratio = getDisplayAspectRatio(data);
  if (ratio === null) return false;
  return ratio < globalPluginConfig.verticalScaleThreshold;
}
