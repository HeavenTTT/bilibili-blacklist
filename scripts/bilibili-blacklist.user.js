// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/yourname/
// @version      0.4
// @description  屏蔽指定 UP 主的视频推荐，并支持手动添加屏蔽
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // 从存储中获取黑名单，如果没有则使用默认值
    let blacklist = GM_getValue('blacklist', ['究刺_Official','时空小涵','CF辰辰','火影忍者萝卜','绝区零','崩坏星穹铁道','转生成为毛毛','鸣潮','俗小雅','蛋仔岛咚咚咩','小小的我_Official_5','小小的我_Official_6','小小的我_Official_7','小小的我_Official_8','小小的我_Official_9','小小的我_Official_10']);

    // 保存黑名单到存储
    function saveBlacklist() {
        GM_setValue('blacklist', blacklist);
    }

    // 添加UP主到黑名单
    function addToBlacklist(upName) {
        if (!blacklist.includes(upName)) {
            blacklist.push(upName);
            saveBlacklist();
            console.log(`[Bilibili-BlackList] 已添加 ${upName} 到黑名单`);
            // 立即屏蔽所有该UP的视频
            BlockUp();
        }
    }

    // 创建屏蔽按钮
    function createBlockButton(upName) {
        const btn = document.createElement('div');
        btn.className = 'bilibili-blacklist-block-btn';
        btn.innerHTML = '×';
        btn.title = '屏蔽此UP主';
        
        // 基础样式
        btn.style.position = 'absolute';
        btn.style.top = '5px';
        btn.style.left = '5px';
        btn.style.width = '20px';
        btn.style.height = '20px';
        btn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        btn.style.color = 'white';
        btn.style.borderRadius = '50%';
        btn.style.display = 'none';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '100';
        btn.style.fontSize = '16px';
        btn.style.fontWeight = 'bold';
        btn.style.transition = 'opacity 0.2s';
        
        // 点击事件
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToBlacklist(upName);
        });
        
        return btn;
    }

    // 为每个视频卡片添加屏蔽按钮
    function addBlockButtons() {
        document.querySelectorAll('.bili-video-card').forEach(videoCard => {
            if (videoCard.querySelector('.bilibili-blacklist-block-btn')) {
                return;
            }
            
            const cover = videoCard.querySelector('.bili-video-card__cover');
            if (!cover) return;
            
            const upNameElement = videoCard.querySelector('.bili-video-card__info--owner') || 
                                videoCard.querySelector('.bili-video-card__text span[title]');
            if (!upNameElement) return;
            
            const title = upNameElement.getAttribute('title') || upNameElement.textContent.trim();
            const upName = title.split(' ')[0];
            
            const btn = createBlockButton(upName);
            cover.style.position = 'relative';
            cover.appendChild(btn);
            
            videoCard.addEventListener('mouseenter', () => {
                btn.style.display = 'flex';
                setTimeout(() => {
                    btn.style.opacity = '1';
                }, 10);
            });
            
            videoCard.addEventListener('mouseleave', () => {
                btn.style.opacity = '0';
                setTimeout(() => {
                    btn.style.display = 'none';
                }, 200);
            });
        });
    }

    function BlockUp() {
        const selectors = [
            '.bili-video-card__info--owner span[title]',
            '.bili-video-card__text span[title]',
        ];

        let foundElements = false;
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                foundElements = true;
                const title = element.getAttribute('title') || 
                              element.textContent.trim();
                const upName = title.split(' ')[0];
                
                if (blacklist.includes(upName)) {
                    // 查找最近的feed-card或bili-video-card容器
                    const container = element.closest('.feed-card') || 
                                     element.closest('.bili-video-card') || 
                                     element.closest('.video-card');
                    
                    if (container) {
                        // 直接移除整个容器元素
                        container.remove();
                        console.log(`[Bilibili-BlackList] 已屏蔽: ${upName}`);
                    }
                }
            });
        });

        // 添加屏蔽按钮
        addBlockButtons();

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
            setTimeout(() => {
                BlockUp();
                addBlockButtons();
            }, 1000);
        }
    });

    // 更全面的初始化
    function init() {
        BlockUp();
        initObserver();
        
        window.addEventListener('scroll', () => {
            setTimeout(() => {
                BlockUp();
                addBlockButtons();
            }, 1000);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    }

    // 添加全局样式
    const style = document.createElement('style');
    style.textContent = `
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
    `;
    document.head.appendChild(style);
})();