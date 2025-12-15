function loadUtilsModule() {
  // 这里可以放置一些通用的工具函数
  // 目前脚本中没有独立的工具函数，所以这个模块暂时为空
  // 如果后续有需要可以添加更多工具函数
  function getVideoPageState() {
    //var initialState = unsafeWindow.__INITIAL_STATE__.channelKv; // 更改 'static' 为更具描述性的 'initialState'
    var channelKv = window.__INITIAL_STATE__.channelKv; // 更改 'static' 为更具描述性的 'initialState'
    //if (!channelKv) return;
    //if (channelKv.length == 0) return;
    channelKv.forEach(element => {
      console.log("Id ",element.channelId," = ",element.name);
      var subList = element.sub;
      subList.forEach(subelement => {
        console.log("sub Id ",subelement.tid," = ",subelement.name);
      });
    });

  }
}
