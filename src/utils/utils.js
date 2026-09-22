/*
 * 工具模块
 * -----------------------------------------------------------
 * 分类标签（tname）本地映射的获取与增量缓存更新。
 */
// 分区表增量更新节流窗口：channelKv（视频页内嵌，tagListLastTime / GM "tLastTime"）
// 与 feed（popular/ranking 接口，tagFeedLastTime / GM "tFeedLastTime"）**各用一个 12 小时节流变量**。
const TNAME_LIST_UPDATE_INTERVAL = 12 * 60 * 60 * 1000; // 12 小时

// 从Video page 获取 本地资源
function getTNameListFromVideoPage() {
  try {
    var channelKv = unsafeWindow.__INITIAL_STATE__.channelKv;
    if (!channelKv) return [];

    var result = [];

    // 遍历主频道
    if (Array.isArray(channelKv)) {
      channelKv.forEach(element => {
        // if (!element.channelId || !element.name) {
        //result.push({ id: element.channelId, tname: element.name });

        // }

        // 遍历子频道(sub)
        var subList = element.sub;
        if (Array.isArray(subList)) {
          subList.forEach(subelement => {
            if (element.channelId && element.name && subelement.tid && subelement.name) {
              result.push({ id: subelement.tid, name: element.name, name_v2: subelement.name });
            }
          });
        }
      });
    }
    return result;
  } catch (e) {
    console.error('[🫥BlackList] 获取频道数据失败:', e);
    return [];
  }
}

/**
 * 把新分区条目合并进 tagNameList（按 id 去重；name / name_v2 变化时更新）。
 * 与 channelKv 条目结构一致：{ id: v2 子分区 tid, name: 主分区名, name_v2: 子分区名 }。
 * @param {Array<{id: number, name: string, name_v2: string}>} newList
 * @returns {number} 新增/变更的条目数。
 */
function mergeTNameListItems(newList) {
  const existingMap = new Map();
  tagNameList.forEach(item => existingMap.set(String(item.id), item));

  let updated = 0;
  for (const item of newList) {
    const id = String(item.id);
    const name = item.name;
    const name_v2 = item.name_v2;
    if (!existingMap.has(id)) {
      // 新增条目（同一对象同时入数组与索引表，避免重复 id 时只更新到索引表那份）
      const record = { id: item.id, name, name_v2 };
      tagNameList.push(record);
      existingMap.set(id, record);
      updated++;
    } else {
      // 已存在，检查名称是否一致，若不一致则更新
      const existing = existingMap.get(id);
      if (existing.name !== name || existing.name_v2 !== name_v2) {
        existing.name = name;
        existing.name_v2 = name_v2;
        updated++;
      }
    }
  }
  return updated;
}

// 增量更新 Tname list（channelKv 来源，12 小时一次）
function updateTNameList() {
  if (tagNameList.length >= 1000) tagNameList = []; //防止过大时卡顿，清空重建
  if (tagNameList.length === 0) tagListLastTime = 0; //确保初始为空时进行更新

  const now = Date.now();
  if (now - tagListLastTime < TNAME_LIST_UPDATE_INTERVAL) {
    console.log('[🫥BlackList] 标签名列表最近已更新，跳过本次更新。');
    return;
  }

  const newList = getTNameListFromVideoPage();
  if (newList.length === 0) {
    console.warn('[🫥BlackList] 未能获取到新的标签名列表。');
    return;
  }

  console.log('[🫥BlackList] 获取到 ' + newList.length + ' 个标签名，开始合并更新。');

  const updated = mergeTNameListItems(newList);

  if (updated) {
    saveTagNameListWithTimestamp();
    tagListLastTime = now; // 更新局部变量以保持同步
    console.log('[🫥BlackList] 分区表已更新（新增/变更 ' + updated + ' 条）并保存。');
  } else {
    console.log('[🫥BlackList] 标签名列表无变化，仅更新时间戳。');
    // 即使没有变化，也更新最后更新时间，避免频繁检查
    GM_setValue("tLastTime", now);
    tagListLastTime = now; // 更新局部变量以保持同步
  }
}

/**
 * 从 popular / ranking feed 接口收集分区条目（含 channelKv 里还没有的新分区，
 * 如 tid_v2=2207 随拍·综合）。两个接口都检查 code，任一失败只跳过该接口。
 * @returns {Promise<Array<{id: number, name: string, name_v2: string}>>}
 */
async function fetchTNameListFromFeed() {
  const result = [];
  const seenIds = new Set();
  const urls = [
    "https://api.bilibili.com/x/web-interface/popular?ps=20",
    "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0",
  ];

  for (const url of urls) {
    let controller = null;
    let timer = null;
    try {
      controller =
        typeof AbortController === "function" ? new AbortController() : null;
      timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      const response = await fetch(
        url,
        controller ? { signal: controller.signal } : undefined
      );
      const json = await response.json();
      if (json.code !== 0 || !json.data || !Array.isArray(json.data.list)) {
        console.warn('[🫥BlackList] feed 接口返回异常: ' + url + ' code=' + json.code);
        continue;
      }
      for (const item of json.data.list) {
        const tidv2 = item.tidv2;
        const tnamev2 = item.tnamev2;
        if (tidv2 === undefined || tidv2 === null || !tnamev2) continue;
        if (seenIds.has(String(tidv2))) continue;
        seenIds.add(String(tidv2));
        result.push({
          id: tidv2,
          name: String(item.pid_name_v2 || tnamev2),
          name_v2: String(tnamev2),
        });
      }
    } catch (error) {
      console.error('[🫥BlackList] feed 接口请求失败: ' + url, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return result;
}

/**
 * feed 增量更新（popular / ranking）。与 channelKv 更新**分开**计时：
 * 各自都有独立的 12 小时节流时间戳（tLastTime / tFeedLastTime）。
 * 调用时机由 video-data.js 在处理队列为空时触发；内部自动按 12 小时节流，可安全多次调用。
 */
async function updateTNameListFromFeed() {
  try {
    if (tagNameList.length >= 1000) tagNameList = []; //防止过大时卡顿，清空重建
    if (tagNameList.length === 0) tagFeedLastTime = 0; //确保初始为空时进行更新

    const now = Date.now();
    if (now - tagFeedLastTime < TNAME_LIST_UPDATE_INTERVAL) {
      return; // feed 12 小时内已更新过，跳过
    }

    const newList = await fetchTNameListFromFeed();
    if (newList.length === 0) {
      console.warn('[🫥BlackList] feed 接口未返回可用的分区数据，本次不更新时间戳。');
      return;
    }

    console.log(
      '[🫥BlackList] feed 接口获取到 ' + newList.length + ' 个分区条目，开始合并更新。'
    );
    const updated = mergeTNameListItems(newList);
    if (updated) {
      saveTagNameListOnly();
      tagFeedLastTime = now;
      console.log('[🫥BlackList] feed 增量更新分区表（新增/变更 ' + updated + ' 条）并保存。');
    } else {
      GM_setValue("tFeedLastTime", now);
      tagFeedLastTime = now;
      console.log('[🫥BlackList] feed 分区表无变化，仅更新时间戳。');
    }
  } catch (error) {
    console.error('[🫥BlackList] feed 增量更新分区表失败:', error);
  }
}
