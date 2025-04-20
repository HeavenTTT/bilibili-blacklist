
(function () {
    'use strict';
  
    console.log('[Bilibili-BlackList] 脚本已加载 ✅');
  
    // 示例：屏蔽包含某些关键词的推荐卡片
    const blacklistKeywords = ['某个关键词', '抽奖', '恰饭'];
  
    function hideBlacklistedContent() {
      const cards = document.querySelectorAll('.bili-video-card, .feed-card');
      cards.forEach(card => {
        const text = card.innerText;
        if (blacklistKeywords.some(keyword => text.includes(keyword))) {
          card.style.display = 'none';
          console.log('[Bilibili-BlackList] 屏蔽内容：', text.slice(0, 30));
        }
      });
    }
  
    // 使用 MutationObserver 监听动态内容加载
    const observer = new MutationObserver(() => {
      hideBlacklistedContent();
    });
  
    observer.observe(document.body, { childList: true, subtree: true });
  
    // 初始执行
    hideBlacklistedContent();
  })();
  