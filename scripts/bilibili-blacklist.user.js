// ==UserScript==
// Metadata block defining the script properties
// @name         Bilibili-BlackList
// @namespace     https://github.com/HeavenTTT/bilibili-blacklist
// @version      0.8.D
// @author       HeavenTTT
// @description  屏蔽指定 UP 主的视频推荐，支持精确匹配和正则表达式匹配
// @match        *://*.bilibili.com/*
// @grant        GM_setValue 
// @grant        GM_getValue 
// @grant        GM_addStyle   
// ==/UserScript==

(function () {
    'use strict';

    // 从存储中获取黑名单
    // Default exact match blacklist (case sensitive)
    let exactBlacklist = GM_getValue('exactBlacklist', ['绝区零','崩坏星穹铁道','崩坏3','原神','米哈游miHoYo']);
    // Default regex match blacklist
    let regexBlacklist = GM_getValue('regexBlacklist', ['王者荣耀.*','和平精英.*','PUBG.*','绝地求生.*','吃鸡.*']);

    // 保存黑名单到存储
    function saveBlacklists() {
        GM_setValue('exactBlacklist', exactBlacklist);
        GM_setValue('regexBlacklist', regexBlacklist);
    }

    // 创建黑名单管理面板
    function createBlacklistPanel() {
        // Create main panel container
        const panel = document.createElement('div');
        panel.id = 'bilibili-blacklist-panel';
        // Styling for the panel (centered modal)
        panel.style.position = 'fixed';
        panel.style.top = '50%';
        panel.style.left = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
        panel.style.width = '500px';
        panel.style.maxHeight = '80vh';
        panel.style.backgroundColor = '#fff';
        panel.style.borderRadius = '8px';
        panel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        panel.style.zIndex = '99999';
        panel.style.overflow = 'hidden';
        panel.style.display = 'none';
        panel.style.flexDirection = 'column';

        // 选项卡
        const tabContainer = document.createElement('div');
        tabContainer.style.display = 'flex';
        tabContainer.style.borderBottom = '1px solid #f1f2f3';

        // Exact match tab
        const exactTab = document.createElement('div');
        exactTab.textContent = '精确匹配';
        exactTab.style.padding = '12px 16px';
        exactTab.style.cursor = 'pointer';
        exactTab.style.fontWeight = '500';
        exactTab.style.borderBottom = '2px solid #fb7299'; // Pink underline for active tab

        // Regex match tab
        const regexTab = document.createElement('div');
        regexTab.textContent = '正则匹配';
        regexTab.style.padding = '12px 16px';
        regexTab.style.cursor = 'pointer';

        tabContainer.appendChild(exactTab);
        tabContainer.appendChild(regexTab);

        // Panel header
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

        // Close button
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

        // 内容区域
        const contentContainer = document.createElement('div');
        contentContainer.style.display = 'flex';
        contentContainer.style.flexDirection = 'column';
        contentContainer.style.flex = '1';
        contentContainer.style.overflow = 'hidden';

        // 精确匹配内容
        const exactContent = document.createElement('div');
        exactContent.style.padding = '16px';
        exactContent.style.overflowY = 'auto';
        exactContent.style.flex = '1';
        exactContent.style.display = 'block';

        // 正则匹配内容
        const regexContent = document.createElement('div');
        regexContent.style.padding = '16px';
        regexContent.style.overflowY = 'auto';
        regexContent.style.flex = '1';
        regexContent.style.display = 'none';

        // 添加新UP主的输入框
        const addExactContainer = document.createElement('div');
        addExactContainer.style.display = 'flex';
        addExactContainer.style.marginBottom = '16px';
        addExactContainer.style.gap = '8px';

        const exactInput = document.createElement('input');
        exactInput.type = 'text';
        exactInput.placeholder = '输入要屏蔽的UP主名称';
        exactInput.style.flex = '1';
        exactInput.style.padding = '8px';
        exactInput.style.border = '1px solid #ddd';
        exactInput.style.borderRadius = '4px';

        const addExactBtn = document.createElement('button');
        addExactBtn.textContent = '添加';
        addExactBtn.style.padding = '8px 16px';
        addExactBtn.style.background = '#fb7299'; // Bilibili pink color
        addExactBtn.style.color = '#fff';
        addExactBtn.style.border = 'none';
        addExactBtn.style.borderRadius = '4px';
        addExactBtn.style.cursor = 'pointer';
        addExactBtn.addEventListener('click', () => {
            const upName = exactInput.value.trim();
            if (upName && !exactBlacklist.includes(upName)) {
                exactBlacklist.push(upName);
                saveBlacklists();
                exactInput.value = '';
                updateExactList();
                BlockUp(); // Re-run blocking after update
            }
        });

        addExactContainer.appendChild(exactInput);
        addExactContainer.appendChild(addExactBtn);
        exactContent.appendChild(addExactContainer);

        // 添加正则表达式的输入框
        const addRegexContainer = document.createElement('div');
        addRegexContainer.style.display = 'flex';
        addRegexContainer.style.marginBottom = '16px';
        addRegexContainer.style.gap = '8px';

        const regexInput = document.createElement('input');
        regexInput.type = 'text';
        regexInput.placeholder = '输入正则表达式 (如: 小小.*Official)';
        regexInput.style.flex = '1';
        regexInput.style.padding = '8px';
        regexInput.style.border = '1px solid #ddd';
        regexInput.style.borderRadius = '4px';

        const addRegexBtn = document.createElement('button');
        addRegexBtn.textContent = '添加';
        addRegexBtn.style.padding = '8px 16px';
        addRegexBtn.style.background = '#fb7299';
        addRegexBtn.style.color = '#fff';
        addRegexBtn.style.border = 'none';
        addRegexBtn.style.borderRadius = '4px';
        addRegexBtn.style.cursor = 'pointer';
        addRegexBtn.addEventListener('click', () => {
            const regex = regexInput.value.trim();
            if (regex && !regexBlacklist.includes(regex)) {
                try {
                    new RegExp(regex); // Test if regex is valid
                    regexBlacklist.push(regex);
                    saveBlacklists();
                    regexInput.value = '';
                    updateRegexList();
                    BlockUp(); // Re-run blocking after update
                } catch (e) {
                    alert('无效的正则表达式: ' + e.message);
                }
            }
        });

        addRegexContainer.appendChild(regexInput);
        addRegexContainer.appendChild(addRegexBtn);
        regexContent.appendChild(addRegexContainer);

        // 精确匹配列表
        const exactList = document.createElement('ul');
        exactList.style.listStyle = 'none';
        exactList.style.padding = '0';
        exactList.style.margin = '0';

        // 正则匹配列表
        const regexList = document.createElement('ul');
        regexList.style.listStyle = 'none';
        regexList.style.padding = '0';
        regexList.style.margin = '0';

        // Update exact match list display
        function updateExactList() {
            exactList.innerHTML = '';
            exactBlacklist.forEach((upName, index) => {
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
                removeBtn.style.background = '#f56c6c'; // Red color
                removeBtn.style.color = '#fff';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '4px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    exactBlacklist.splice(index, 1);
                    saveBlacklists();
                    updateExactList();
                    BlockUp(); // Re-run blocking after update
                });

                item.appendChild(name);
                item.appendChild(removeBtn);
                exactList.appendChild(item);
            });

            // Show empty state if no items
            if (exactBlacklist.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '暂无精确匹配屏蔽UP主';
                empty.style.textAlign = 'center';
                empty.style.padding = '16px';
                empty.style.color = '#999';
                exactList.appendChild(empty);
            }
        }

        // Update regex match list display
        function updateRegexList() {
            regexList.innerHTML = '';
            regexBlacklist.forEach((regex, index) => {
                const item = document.createElement('li');
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.padding = '8px 0';
                item.style.borderBottom = '1px solid #f1f2f3';

                const regexText = document.createElement('span');
                regexText.textContent = regex;
                regexText.style.flex = '1';
                regexText.style.fontFamily = 'monospace'; // Monospace font for regex

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '移除';
                removeBtn.style.padding = '4px 8px';
                removeBtn.style.background = '#f56c6c';
                removeBtn.style.color = '#fff';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '4px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    regexBlacklist.splice(index, 1);
                    saveBlacklists();
                    updateRegexList();
                    BlockUp(); // Re-run blocking after update
                });

                item.appendChild(regexText);
                item.appendChild(removeBtn);
                regexList.appendChild(item);
            });

            // Show empty state if no items
            if (regexBlacklist.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '暂无正则匹配屏蔽规则';
                empty.style.textAlign = 'center';
                empty.style.padding = '16px';
                empty.style.color = '#999';
                regexList.appendChild(empty);
            }
        }

        // Initialize lists
        updateExactList();
        updateRegexList();

        exactContent.appendChild(exactList);
        regexContent.appendChild(regexList);

        contentContainer.appendChild(exactContent);
        contentContainer.appendChild(regexContent);

        panel.appendChild(tabContainer);
        panel.appendChild(header);
        panel.appendChild(contentContainer);

        // 选项卡切换
        exactTab.addEventListener('click', () => {
            exactTab.style.borderBottom = '2px solid #fb7299';
            regexTab.style.borderBottom = 'none';
            exactContent.style.display = 'block';
            regexContent.style.display = 'none';
        });

        regexTab.addEventListener('click', () => {
            regexTab.style.borderBottom = '2px solid #fb7299';
            exactTab.style.borderBottom = 'none';
            exactContent.style.display = 'none';
            regexContent.style.display = 'block';
        });

        document.body.appendChild(panel);
        return panel;
    }

    // Check if current page is a video page
    function isVideoPage() {
        if (window.location.pathname.startsWith('/video/')) {
            return true;
        } else {
            return false;
        }
    }

    // 在右侧导航栏添加黑名单管理按钮
    function addBlacklistManagerButton() {
        if (isVideoPage()) {
            //console.log('[Bilibili-BlackList] 视频页面不添加黑名单管理按钮');
            return;
        }
    
        const rightEntry = document.querySelector('.right-entry');
        if (!rightEntry || rightEntry.querySelector('#bilibili-blacklist-manager')) {
            //console.log('[Bilibili-BlackList] 黑名单管理按钮已存在或右侧导航栏不存在');
            return;
        }
        
        //console.log('[Bilibili-BlackList] 添加黑名单管理按钮');
        const li = document.createElement('li');
        li.id = 'bilibili-blacklist-manager';
        li.style.cursor = 'pointer';

        const btn = document.createElement('div');
        btn.className = 'right-entry-item';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';

        // Shield icon SVG
        const icon = document.createElement('div');
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
            </svg>
        `;
        icon.style.color = '#fb7299'; // Bilibili pink color

        const text = document.createElement('div');

        btn.appendChild(icon);
        btn.appendChild(text);
        li.appendChild(btn);

        // Insert button in the navigation
        if (rightEntry.children.length > 1) {
            rightEntry.insertBefore(li, rightEntry.children[1]);
        } else {
            rightEntry.appendChild(li);
        }

        // Create panel if it doesn't exist
        let panel = document.getElementById('bilibili-blacklist-panel');
        if (!panel) {
            panel = createBlacklistPanel();
        }

        // Show panel when button is clicked
        li.addEventListener('click', () => {
            panel.style.display = 'flex';
        });
    }

    // 检查是否匹配黑名单
    function isBlacklisted(upName) {
        // 检查精确匹配
        if (exactBlacklist.includes(upName)) {
            return true;
        }

        // 检查正则匹配
        for (const regex of regexBlacklist) {
            try {
                const regExp = new RegExp(regex);
                if (regExp.test(upName)) {
                    return true;
                }
            } catch (e) {
                console.error(`[Bilibili-BlackList] 无效的正则表达式: ${regex}`, e);
            }
        }

        return false;
    }

    // 添加UP主到精确黑名单
    function addToExactBlacklist(upName) {
        if (!exactBlacklist.includes(upName)) {
            exactBlacklist.push(upName);
            saveBlacklists();
            //console.log(`[Bilibili-BlackList] 已添加 ${upName} 到精确黑名单`);
            BlockUp(); // Re-run blocking after update
        }
    }

    // 创建屏蔽按钮 (appears when hovering over video cards)
    function createBlockButton(upName) {
        const btn = document.createElement('div');
        btn.className = 'bilibili-blacklist-block-btn';
        btn.innerHTML = '×';
        btn.title = '屏蔽此UP主';
        
        // Styling for the block button
        btn.style.position = 'absolute';
        btn.style.top = '5px';
        btn.style.left = '5px';
        btn.style.width = '40px';
        btn.style.height = '20px';
        btn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        btn.style.color = 'white';
        btn.style.borderRadius = '5%';
        btn.style.display = 'none';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '100';
        btn.style.fontSize = '16px';
        btn.style.fontWeight = 'bold';
        btn.style.transition = 'opacity 0.2s';
        
        // Add to blacklist when clicked
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            addToExactBlacklist(upName);
        });
        
        return btn;
    }

    // CSS selectors for finding UP names in different page layouts
    const selectors = [
        '.bili-video-card__info--owner span[title]', // Main page cards
        '.bili-video-card__text span[title]',       // Alternative card style
        '.video-page-card-small .upname',           // Small cards
    ];
    
    // 共用函数：查找UP主名称元素并提取名称
    function findUpNameElements(callback) {
        let foundElements = false;
        
        // Check all selectors for UP name elements
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                foundElements = true;
                const title = element.getAttribute('title') || element.textContent.trim();
                const upName = title.split(' ')[0]; // Get first part of title (before space)
                callback(element, upName);
            });
        });
        
        return foundElements;
    }
    
    // 为每个视频卡片添加屏蔽按钮
    function addBlockButtons() {
        document.querySelectorAll('.bili-video-card').forEach(videoCard => {
            // Skip if button already exists
            if (videoCard.querySelector('.bilibili-blacklist-block-btn')) {
                return;
            }
            
            // Find the video cover element
            const cover = videoCard.querySelector('.bili-video-card__wrap') || videoCard.querySelector('.card-box');
            if (!cover) return;
            
            // Make sure cover has relative positioning
            if (window.getComputedStyle(cover).position === 'static') {
                cover.style.position = 'relative';
            }
            
            // 使用共用函数查找UP主名称
            findUpNameElements((element, upName) => {
                // Make sure we're working with the current video card
                if (element.closest('.bili-video-card') === videoCard) {
                    const btn = createBlockButton(upName);
                    cover.appendChild(btn);
                    
                    // Show button on hover
                    videoCard.addEventListener('mouseenter', () => {
                        btn.style.display = 'flex';
                        setTimeout(() => {
                            btn.style.opacity = '1';
                        }, 10);
                    });
                    
                    // Hide button when not hovering
                    videoCard.addEventListener('mouseleave', () => {
                        btn.style.opacity = '0';
                        setTimeout(() => {
                            btn.style.display = 'none';
                        }, 500);
                    });
                }
            });
        });
    }
    
    // Main function to block videos from blacklisted UP
    function BlockUp() {
        const foundElements = findUpNameElements((element, upName) => {
            if (isBlacklisted(upName)) {
                // Find the closest video container element
                const container = element.closest('.feed-card') || 
                                 element.closest('.bili-video-card') || 
                                 element.closest('.video-page-card-small') || 
                                 element.closest('.video-card');
                
                // Remove the entire video card if matched
                if (container) {
                    container.remove();
                    //console.log(`[Bilibili-BlackList] 已屏蔽: ${upName}`);
                }
            }
        });
    
        if (!foundElements) {
            //console.log('[Bilibili-BlackList] 警告: 未找到任何UP主元素');
        }
    }
    function BlockAD() {
        // 屏蔽某些推广
        document.querySelectorAll('.floor-single-card').forEach(adCard => {
            adCard.remove();
        });
        //屏蔽直播推广
        document.querySelectorAll('.bili-live-card').forEach(adCard => {
            adCard.remove();
        });
    }
    function BlockVideoPageAd() {
        // 屏蔽右上角推广
        document.querySelectorAll('.video-card-ad-small').forEach(adCard => {
            adCard.remove();
        });
        //大推广
        document.querySelectorAll('.slide-ad-exp').forEach(adCard => {
            adCard.remove();
        });
        //游戏推广
        document.querySelectorAll('.video-page-game-card-small').forEach(adCard => {
            adCard.remove();
        });
       
        
    }
    // 初始化观察者 (watches for DOM changes)
    function initObserver() {
        const rootNode = document.getElementById('i_cecream') || // Bilibili's main container IDs
                        document.getElementById('app') ||
                        document.documentElement;
        
        if (rootNode) {
            observer.observe(rootNode, {
                childList: true,  // Watch for added/removed nodes
                subtree: true     // Watch all descendants
            });
            //console.log('[Bilibili-BlackList] 监听已启动');
        } else {
            // Retry if root node not found
            setTimeout(initObserver, 500);
        }
    }

    // MutationObserver to detect new content loaded dynamically
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldCheck = true;
            }
        });
        
        // Run blocking after new content is added
        if (shouldCheck) {
            setTimeout(() => {
                BlockUp();
                BlockAD();
                addBlockButtons();
                addBlacklistManagerButton();
                BlockVideoPageAd();
            }, 1000);
        }
    });

    // Main initialization function
    function init() {
        BlockUp(); // Initial blocking
        initObserver(); // Start watching for changes
        addBlacklistManagerButton(); // Add management button
        BlockAD();
       
        // Also check when scrolling (for infinite scroll pages)
        if(!isVideoPage()) {
            window.addEventListener('scroll', () => {
                setTimeout(() => {
                    BlockUp();
                    addBlockButtons();
                    BlockAD();
                    //addBlacklistManagerButton();
                }, 1000);
            });
        }else
        {
            
        }
    }

    // Run when DOM is ready
    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    }

    // 添加全局样式
    GM_addStyle(`
        /* Style for block button hover effect */
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
        /* Fix for video card layout */
        .bili-video-card__cover {
            contain: layout !important;
        }
        /* Ensure block button is clickable */
        .bilibili-blacklist-block-btn {
            pointer-events: auto !important;
        }
        /* Panel styling */
        #bilibili-blacklist-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        /* Button hover effects */
        #bilibili-blacklist-panel button {
            transition: background-color 0.2s;
        }
        #bilibili-blacklist-panel button:hover {
            opacity: 0.9;
        }
        /* Manager button hover effect */
        #bilibili-blacklist-manager:hover svg {
            transform: scale(1.1);
        }
        #bilibili-blacklist-manager svg {
            transition: transform 0.2s;
        }
        /* Input focus effect */
        #bilibili-blacklist-panel input:focus {
            outline: none;
            border-color: #fb7299 !important;
        }
    `);
})();