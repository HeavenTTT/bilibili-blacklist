function loadUtilsModule() {
  // 这里可以放置一些通用的工具函数
  // 目前脚本中没有独立的工具函数，所以这个模块暂时为空
  // 如果后续有需要可以添加更多工具函数
  function getVideoPageState() {
    try {
      var channelKv = unsafeWindow.__INITIAL_STATE__.channelKv;
      if (!channelKv) return [];
      
      var result = [];
      
      // 遍历主频道
      if (Array.isArray(channelKv)) {
        channelKv.forEach(element => {
          if (element.channelId && element.name) {
            result.push({id: element.channelId, tname: element.name});
          }
          
          // 遍历子频道(sub)
          var subList = element.sub;
          if (Array.isArray(subList)) {
            subList.forEach(subelement => {
              if (subelement.tid && subelement.name) {
                result.push({id: subelement.tid, tname: subelement.name});
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
}
