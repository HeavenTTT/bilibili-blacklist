// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/yourname/
// @version      0.1
// @description  屏蔽指定 UP 主的视频推荐
// @match        *://*.bilibili.com/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    const blacklist = ['究刺_Official','时空小涵','CF辰辰','火影忍者萝卜','绝区零','崩坏星穹铁道','转生成为毛毛','鸣潮','俗小雅','蛋仔岛咚咚咩','小小的我_Official_5','小小的我_Official_6','小小的我_Official_7','小小的我_Official_8','小小的我_Official_9','小小的我_Official_10'];

    function BlockUp() {
        // 更通用的选择器，适应不同页面布局
        const selectors = [
            '.bili-video-card__info--owner', // 新版选择器
            '.bili-video-card__text span[title]', // 游戏区选择器
            //'.bili-video-card__info--owner span[title]' // 原始选择器
        ];

        let foundElements = false;
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                foundElements = true;
                const title = element.getAttribute('title') || 
                              element.textContent.trim();
                const upName = title.split(' ')[0]; // 处理可能的空格
                //console.log(`[Bilibili-BlackList] 检测到UP主: ${upName}`);
                if (blacklist.includes(upName)) {
                    const videoCard = element.closest('.bili-video-card') || 
                                    element.closest('.feed-card') || 
                                    element.closest('.video-card');
                    if (videoCard) {
                        videoCard.remove();
                        console.log(`[Bilibili-BlackList] 已屏蔽: ${upName}`);
                    }
                }
            });
        });

        if (!foundElements) {
            console.log('[Bilibili-BlackList] 警告: 未找到任何UP主元素');
        }
    }

    // 更可靠的观察者初始化
    function initObserver() {
        const rootNode = document.getElementById('i_cecream') || 
                        document.documentElement;
        
        if (rootNode) {
            observer.observe(rootNode, {
                childList: true,
                subtree: true
            });
            console.log('[Bilibili-BlackList] 监听已启动');
        } else {
            setTimeout(initObserver, 500);
        }
    }

    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldCheck = true;
            }
        });
        
        if (shouldCheck) {
            setTimeout(BlockUp, 1000); // 稍延迟确保DOM完全加载
        }
    });

    // 更全面的初始化
    function init() {
        BlockUp();
        initObserver();
        
        // 添加滚动事件监听，因为有些内容是滚动加载的
        window.addEventListener('scroll', () => {
            setTimeout(BlockUp, 1000);
        });
    }

    // 使用DOMContentLoaded而不是load，因为不需要等待所有资源
    document.addEventListener('DOMContentLoaded', init);
    // 也立即执行一次，以防DOM已经就绪
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    }
})();