// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/yourname/
// @version      0.6
// @description  屏蔽指定 UP 主的视频推荐，并支持手动添加屏蔽和管理黑名单
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // 从存储中获取黑名单，如果没有则使用默认值
    let blacklist = GM_getValue('blacklist', ['究刺_Official','时空小涵','CF辰辰','火影忍者萝卜','绝区零','崩坏星穹铁道','转生成为毛毛','鸣潮','俗小雅','蛋仔岛咚咚咩','小小的我_Official_5','小小的我_Official_6','小小的我_Official_7','小小的我_Official_8','小小的我_Official_9','小小的我_Official_10']);

    // 保存黑名单到存储
    function saveBlacklist() {
        GM_setValue('blacklist', blacklist);
    }

    // 创建黑名单管理面板
    function createBlacklistPanel() {
        const panel = document.createElement('div');
        panel.id = 'bilibili-blacklist-panel';
        panel.style.position = 'fixed';
        panel.style.top = '50%';
        panel.style.left = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
        panel.style.width = '400px';
        panel.style.maxHeight = '80vh';
        panel.style.backgroundColor = '#fff';
        panel.style.borderRadius = '8px';
        panel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        panel.style.zIndex = '99999';
        panel.style.overflow = 'hidden';
        panel.style.display = 'none';
        panel.style.flexDirection = 'column';

        const header = document.createElement('div');
        header.style.padding = '16px';
        header.style.borderBottom = '1px solid #f1f2f3';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const title = document.createElement('h3');
        title.textContent = '已屏蔽UP主';
        title.style.margin = '0';
        title.style.fontSize = '16px';
        title.style.fontWeight = '500';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '20px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.padding = '0 8px';
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.style.padding = '16px';
        content.style.overflowY = 'auto';
        content.style.flex = '1';

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        function updateList() {
            list.innerHTML = '';
            blacklist.forEach((upName, index) => {
                const item = document.createElement('li');
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.padding = '8px 0';
                item.style.borderBottom = '1px solid #f1f2f3';

                const name = document.createElement('span');
                name.textContent = upName;
                name.style.flex = '1';

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '移除';
                removeBtn.style.padding = '4px 8px';
                removeBtn.style.background = '#f56c6c';
                removeBtn.style.color = '#fff';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '4px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    blacklist.splice(index, 1);
                    saveBlacklist();
                    updateList();
                    BlockUp(); // 重新检查页面
                });

                item.appendChild(name);
                item.appendChild(removeBtn);
                list.appendChild(item);
            });

            if (blacklist.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '暂无已屏蔽UP主';
                empty.style.textAlign = 'center';
                empty.style.padding = '16px';
                empty.style.color = '#999';
                list.appendChild(empty);
            }
        }

        updateList();
        content.appendChild(list);
        panel.appendChild(header);
        panel.appendChild(content);

        document.body.appendChild(panel);
        return panel;
    }

    // 在右侧导航栏添加黑名单管理按钮
    function addBlacklistManagerButton() {
        const rightEntry = document.querySelector('.right-entry');
        if (!rightEntry || rightEntry.querySelector('#bilibili-blacklist-manager')) {
            return;
        }

        const li = document.createElement('li');
        li.id = 'bilibili-blacklist-manager';
        li.style.cursor = 'pointer';
        li.style.marginBottom = '16px';

        const btn = document.createElement('div');
        btn.className = 'right-entry-item';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';

        const icon = document.createElement('div');
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
            </svg>
        `;
        icon.style.color = '#fb7299';

        const text = document.createElement('div');
        text.textContent = '屏蔽管理';
        text.style.fontSize = '12px';
        text.style.marginTop = '4px';

        btn.appendChild(icon);
        btn.appendChild(text);
        li.appendChild(btn);

        // 插入到第二个位置
        if (rightEntry.children.length > 1) {
            rightEntry.insertBefore(li, rightEntry.children[1]);
        } else {
            rightEntry.appendChild(li);
        }

        // 创建面板（如果不存在）
        let panel = document.getElementById('bilibili-blacklist-panel');
        if (!panel) {
            panel = createBlacklistPanel();
        }

        li.addEventListener('click', () => {
            panel.style.display = 'flex';
        });
    }

    // 添加UP主到黑名单
    function addToBlacklist(upName) {
        if (!blacklist.includes(upName)) {
            blacklist.push(upName);
            saveBlacklist();
            console.log(`[Bilibili-BlackList] 已添加 ${upName} 到黑名单`);
            BlockUp();
            
            // 更新面板（如果存在）
            const panel = document.getElementById('bilibili-blacklist-panel');
            if (panel) {
                const list = panel.querySelector('ul');
                if (list) {
                    const emptyMsg = list.querySelector('div');
                    if (emptyMsg) emptyMsg.remove();
                    
                    const item = document.createElement('li');
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'center';
                    item.style.padding = '8px 0';
                    item.style.borderBottom = '1px solid #f1f2f3';

                    const name = document.createElement('span');
                    name.textContent = upName;
                    name.style.flex = '1';

                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = '移除';
                    removeBtn.style.padding = '4px 8px';
                    removeBtn.style.background = '#f56c6c';
                    removeBtn.style.color = '#fff';
                    removeBtn.style.border = 'none';
                    removeBtn.style.borderRadius = '4px';
                    removeBtn.style.cursor = 'pointer';
                    removeBtn.addEventListener('click', () => {
                        const index = blacklist.indexOf(upName);
                        if (index !== -1) {
                            blacklist.splice(index, 1);
                            saveBlacklist();
                            item.remove();
                            BlockUp();
                            
                            if (list.children.length === 0) {
                                const empty = document.createElement('div');
                                empty.textContent = '暂无已屏蔽UP主';
                                empty.style.textAlign = 'center';
                                empty.style.padding = '16px';
                                empty.style.color = '#999';
                                list.appendChild(empty);
                            }
                        }
                    });

                    item.appendChild(name);
                    item.appendChild(removeBtn);
                    list.appendChild(item);
                }
            }
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
            
            // 确保封面容器有正确的定位上下文
            if (window.getComputedStyle(cover).position === 'static') {
                cover.style.position = 'relative';
            }
            
            const upNameElement = videoCard.querySelector('.bili-video-card__info--owner') || 
                                videoCard.querySelector('.bili-video-card__text span[title]');
            if (!upNameElement) return;
            
            const title = upNameElement.getAttribute('title') || upNameElement.textContent.trim();
            const upName = title.split(' ')[0];
            
            const btn = createBlockButton(upName);
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
            '.bili-video-card__info--owner',
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
                    const container = element.closest('.feed-card') || 
                                     element.closest('.bili-video-card') || 
                                     element.closest('.video-card');
                    
                    if (container) {
                        container.remove();
                        console.log(`[Bilibili-BlackList] 已屏蔽: ${upName}`);
                    }
                }
            });
        });

        addBlockButtons();

        if (!foundElements) {
            console.log('[Bilibili-BlackList] 警告: 未找到任何UP主元素');
        }
    }

    // 初始化观察者
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
                addBlacklistManagerButton();
            }, 1000);
        }
    });

    function init() {
        BlockUp();
        initObserver();
        addBlacklistManagerButton();
        
        window.addEventListener('scroll', () => {
            setTimeout(() => {
                BlockUp();
                addBlockButtons();
                addBlacklistManagerButton();
            }, 1000);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    }

    // 添加全局样式
    GM_addStyle(`
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
        /* 修复封面容器高度问题 */
        .bili-video-card__cover {
            contain: layout !important;
        }
        /* 确保屏蔽按钮不会影响布局 */
        .bilibili-blacklist-block-btn {
            pointer-events: auto !important;
        }
        /* 黑名单面板样式 */
        #bilibili-blacklist-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #bilibili-blacklist-panel button {
            transition: background-color 0.2s;
        }
        #bilibili-blacklist-panel button:hover {
            opacity: 0.9;
        }
        /* 右侧按钮样式 */
        #bilibili-blacklist-manager:hover svg {
            transform: scale(1.1);
        }
        #bilibili-blacklist-manager svg {
            transition: transform 0.2s;
        }
    `);
})();