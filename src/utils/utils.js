function loadUtilsModule() {
  /// 12-16-2025 临时修复B站API无法获取Tname 问题，使用tid + 保存在本地的列表实现
  // 从Video page 获取 本地资源
  function getTNameListFormVideoPage() {
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
                result.push({ id: subelement.tid, name: element.name ,name_v2: subelement.name });
                console.log("add :",subelement.tid, element.name,subelement.name);
              }
            });
          }
        });
      }
      return result;
    } catch (e) {
      console.error("[bilibili-blacklist] 获取频道数据失败:", e);
      return [];
    }
  }
  // 增量更新 Tname list //24小时一次
  function updateTNameList()
  {
    tagNameList=[]; // 清空现有列表
    // 检查距离上次更新时间是否超过24小时（86400000毫秒）
    const now = Date.now();
    if (now - tagListLastTime < 86400000) {
      console.log("[bilibili-blacklist] 标签名列表最近已更新，跳过本次更新。");
      return;
    }

    const newList = getTNameListFormVideoPage();
    if (newList.length === 0) {
      console.warn("[bilibili-blacklist] 未能获取到新的标签名列表。");
      return;
    }

    console.log(`[bilibili-blacklist] 获取到 ${newList.length} 个标签名，开始合并更新。`);

    // 构建现有标签的映射以便快速查找（基于id）
    const existingMap = new Map();
    tagNameList.forEach(item => existingMap.set(String(item.id), item));

    let updated = false;
    for (const item of newList) {
      const id = String(item.id);
      const name = item.name; // 注意：getTNameListFormVideoPage 返回的是 tname 属性
      const name_v2 = item.name_v2;
      if (!existingMap.has(id)) {
        // 新增条目
        tagNameList.push({ id: item.id, name , name_v2 });
        existingMap.set(id, { id: item.id, name, name_v2 });
        updated = true;
      } else {
        // 已存在，检查名称是否一致，若不一致则更新
        const existing = existingMap.get(id);
        if (existing.name !== name) {
          existing.name = name;
          updated = true;
        }
      }
    }

    if (updated) {
      saveTagNameListToStorage();
      tagListLastTime = now; // 更新局部变量以保持同步
      console.log("[bilibili-blacklist] 标签名列表已更新并保存。");
    } else {
      console.log("[bilibili-blacklist] 标签名列表无变化，仅更新时间戳。");
      // 即使没有变化，也更新最后更新时间，避免频繁检查
      GM_setValue("tLastTime", now);
      tagListLastTime = now; // 更新局部变量以保持同步
    }
  }
}
