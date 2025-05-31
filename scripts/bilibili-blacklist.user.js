// ==UserScript==
// 元数据块定义脚本属性
// @name         Bilibili-BlackList
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      0.9.0
// @author       HeavenTTT
// @description  屏蔽指定UP主的视频推荐，支持精确匹配和正则表达式匹配
// @match        *://*.bilibili.com/*
// @grant        GM_setValue 
// @grant        GM_getValue 
// @grant        GM_addStyle
// @updateURL    https://github.com/HeavenTTT/bilibili-blacklist/raw/refs/heads/main/scripts/bilibili-blacklist.user.js
// @downloadURL  https://github.com/HeavenTTT/bilibili-blacklist/raw/refs/heads/main/scripts/bilibili-blacklist.user.js
// ==/UserScript==

(function () {
    'use strict';

    // 从存储中获取黑名单
    // 默认精确匹配黑名单（区分大小写）
    let exactBlacklist = GM_getValue('exactBlacklist', ['绝区零','崩坏星穹铁道','崩坏3','原神','米哈游miHoYo']);
    // 默认正则匹配黑名单
    let regexBlacklist = GM_getValue('regexBlacklist', ['王者荣耀.*','和平精英.*','PUBG.*','绝地求生.*','吃鸡.*']);
    // 新增标题正则黑名单
    let titleRegexBlacklist = GM_getValue('titleRegexBlacklist', ['原神.*']); 
    // 保存黑名单到存储
    function saveBlacklists() {
        GM_setValue('exactBlacklist', exactBlacklist);
        GM_setValue('regexBlacklist', regexBlacklist);
        GM_setValue('titleRegexBlacklist', titleRegexBlacklist);
    }

    // 创建黑名单管理面板
    function createBlacklistPanel() {
        // 创建主面板容器
        const panel = document.createElement('div');
        panel.id = 'bilibili-blacklist-panel';
        // 面板样式（居中模态框）
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

        // 精确匹配选项卡
        const exactTab = document.createElement('div');
        exactTab.textContent = '精确匹配';
        exactTab.style.padding = '12px 16px';
        exactTab.style.cursor = 'pointer';
        exactTab.style.fontWeight = '500';
        exactTab.style.borderBottom = '2px solid #fb7299'; // 活动选项卡的粉色下划线

        // 正则匹配选项卡
        const regexTab = document.createElement('div');
        regexTab.textContent = '正则匹配';
        regexTab.style.padding = '12px 16px';
        regexTab.style.cursor = 'pointer';

        tabContainer.appendChild(exactTab);
        tabContainer.appendChild(regexTab);

        // 面板头部
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

        // 关闭按钮
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
        addExactBtn.style.background = '#fb7299'; // B站粉色
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
                BlockUp(); // 更新后重新执行屏蔽
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
                    new RegExp(regex); // 测试正则表达式是否有效
                    regexBlacklist.push(regex);
                    saveBlacklists();
                    regexInput.value = '';
                    updateRegexList();
                    BlockUp(); // 更新后重新执行屏蔽
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

        // 更新精确匹配列表显示
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
                removeBtn.style.background = '#f56c6c'; // 红色
                removeBtn.style.color = '#fff';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '4px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.addEventListener('click', () => {
                    exactBlacklist.splice(index, 1);
                    saveBlacklists();
                    updateExactList();
                    BlockUp(); // 更新后重新执行屏蔽
                });

                item.appendChild(name);
                item.appendChild(removeBtn);
                exactList.appendChild(item);
            });

            // 如果没有项目则显示空状态
            if (exactBlacklist.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '暂无精确匹配屏蔽UP主';
                empty.style.textAlign = 'center';
                empty.style.padding = '16px';
                empty.style.color = '#999';
                exactList.appendChild(empty);
            }
        }

        // 更新正则匹配列表显示
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
                regexText.style.fontFamily = 'monospace'; // 正则表达式使用等宽字体

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
                    BlockUp(); // 更新后重新执行屏蔽
                });

                item.appendChild(regexText);
                item.appendChild(removeBtn);
                regexList.appendChild(item);
            });

            // 如果没有项目则显示空状态
            if (regexBlacklist.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = '暂无正则匹配屏蔽规则';
                empty.style.textAlign = 'center';
                empty.style.padding = '16px';
                empty.style.color = '#999';
                regexList.appendChild(empty);
            }
        }

        // 初始化列表
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

    // 检查当前页面是否为视频页面
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
            return;
        }
    
        const rightEntry = document.querySelector('.right-entry');
        if (!rightEntry || rightEntry.querySelector('#bilibili-blacklist-manager')) {
            return;
        }
        
        const li = document.createElement('li');
        li.id = 'bilibili-blacklist-manager';
        li.style.cursor = 'pointer';

        const btn = document.createElement('div');
        btn.className = 'right-entry-item';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';

        // 盾牌图标SVG
        const icon = document.createElement('div');
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
            </svg>
        `;
        icon.style.color = '#fb7299'; // B站粉色

        const text = document.createElement('div');

        btn.appendChild(icon);
        btn.appendChild(text);
        li.appendChild(btn);

        // 在导航中插入按钮
        if (rightEntry.children.length > 1) {
            rightEntry.insertBefore(li, rightEntry.children[1]);
        } else {
            rightEntry.appendChild(li);
        }

        // 如果面板不存在则创建
        let panel = document.getElementById('bilibili-blacklist-panel');
        if (!panel) {
            panel = createBlacklistPanel();
        }

        // 点击按钮时显示面板
        li.addEventListener('click', () => {
            // 更新面板标题显示当前页面已屏蔽数量
            const titleElement = panel.querySelector('h3');
            if (titleElement) {
                titleElement.textContent = `已屏蔽视频 (${blockedVideoCount})`;
            }
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
            BlockUp(); // 更新后重新执行屏蔽
        }
    }

    // 创建屏蔽按钮（悬停在视频卡片上时显示）
    function createBlockButton(upName) {
        const btn = document.createElement('div');
        btn.className = 'bilibili-blacklist-block-btn';
        btn.innerHTML = '×';
        btn.title = '屏蔽此UP主';
        
        // 屏蔽按钮样式
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
        
        // 点击时添加到黑名单
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止事件冒泡
            addToExactBlacklist(upName);
        });
        
        return btn;
    }

    // 查找UP主名称元素的不同页面布局的CSS选择器
    const selectors = [
        '.bili-video-card__info--owner span[title]', // 主页卡片
        '.bili-video-card__text span[title]',       // 替代卡片样式
        '.video-page-card-small .upname',           // 小卡片
    ];
    
    // 共用函数：查找UP主名称元素并提取名称
    function findUpNameElements(callback) {
        let foundElements = false;
        
        // 检查所有选择器的UP主名称元素
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                foundElements = true;
                const title = element.getAttribute('title') || element.textContent.trim();
                const upName = title.split(' ')[0]; // 获取标题的第一部分（空格前）
                callback(element, upName);
            });
        });
        
        return foundElements;
    }
    
    // 为每个视频卡片添加屏蔽按钮
    function addBlockButtons() {
        document.querySelectorAll('.bili-video-card').forEach(videoCard => {
            // 如果按钮已存在则跳过
            if (videoCard.querySelector('.bilibili-blacklist-block-btn')) {
                return;
            }
            
            // 查找视频封面元素
            const cover = videoCard.querySelector('.bili-video-card__wrap') || videoCard.querySelector('.card-box');
            if (!cover) return;
            
            // 确保封面有相对定位
            if (window.getComputedStyle(cover).position === 'static') {
                cover.style.position = 'relative';
            }
            
            // 使用共用函数查找UP主名称
            findUpNameElements((element, upName) => {
                // 确保我们处理的是当前视频卡片
                if (element.closest('.bili-video-card') === videoCard) {
                    const btn = createBlockButton(upName);
                    cover.appendChild(btn);
                    
                    // 悬停时显示按钮
                    videoCard.addEventListener('mouseenter', () => {
                        btn.style.display = 'flex';
                        setTimeout(() => {
                            btn.style.opacity = '1';
                        }, 10);
                    });
                    
                    // 不悬停时隐藏按钮
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
    let blockedVideoCount = 0; // 在函数外部初始化计数器
    // 主函数：屏蔽黑名单UP主的视频
    function BlockUp() {
        const foundElements = findUpNameElements((element, upName) => {
            if (isBlacklisted(upName)) {
                // 查找最近的视频容器元素
                const container = element.closest('.feed-card') || 
                                 element.closest('.bili-video-card') || 
                                 element.closest('.video-page-card-small') || 
                                 element.closest('.video-card');
                
                // 如果匹配则移除整个视频卡片
                if (container) {
                    container.remove();
                    blockedVideoCount++; // 增加计数
                }
            }
        });
    
        if (!foundElements) {
            console.log('[Bilibili-BlackList] 警告: 未找到任何UP主元素');
        }
    }

    // 屏蔽广告
    function BlockAD() {
        // 屏蔽某些推广
        document.querySelectorAll('.floor-single-card').forEach(adCard => {
            adCard.remove();
        });
        // 屏蔽直播推广
        document.querySelectorAll('.bili-live-card').forEach(adCard => {
            adCard.remove();
        });
    }

    // 屏蔽视频页面广告（使用数组优化）
    function BlockVideoPageAd() {
        const adSelectors = [
            '.video-card-ad-small',          // 右上角推广
            '.slide-ad-exp',                 // 大推广
            '.video-page-game-card-small',   // 游戏推广
            '.activity-m-v1',                // 活动推广
            '.video-page-special-card-small', // 特殊卡片推广
            '.ad-floor-exp'                  // 广告地板
        ];
        
        adSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(adCard => {
                adCard.remove();
            });
        });
    }

    // 初始化观察者（监视DOM变化）
    function initObserver() {
        const rootNode = document.getElementById('i_cecream') || // B站的主容器ID
                        document.getElementById('app') ||
                        document.documentElement;
        
        if (rootNode) {
            observer.observe(rootNode, {
                childList: true,  // 监视添加/移除的节点
                subtree: true     // 监视所有后代
            });
        } else {
            // 如果没找到根节点则重试
            setTimeout(initObserver, 500);
        }
    }

    // MutationObserver检测动态加载的新内容
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldCheck = true;
            }
        });
        
        // 添加新内容后执行屏蔽
        if (shouldCheck) {
            setTimeout(() => {
                BlockUp();
                BlockAD();
                addBlockButtons();
                addBlacklistManagerButton();
                BlockVideoPageAd();
                 // 如果需要实时显示在按钮上，可以在这里更新按钮文本
                 const managerButton = document.getElementById('bilibili-blacklist-manager');
                 if (managerButton) {
                     const textDiv = managerButton.querySelector('.right-entry-item > div:last-child');
                     if (textDiv) {
                         textDiv.textContent = `${blockedVideoCount}`;
                     }
                 }
            }, 1000);
        }
    });

    // 主初始化函数
    function init() {
        BlockUp(); // 初始屏蔽
        initObserver(); // 开始监视变化
        addBlacklistManagerButton(); // 添加管理按钮
        BlockAD();
       
        // 滚动时也检查（针对无限滚动页面）
        if(!isVideoPage()) {
            window.addEventListener('scroll', () => {
                setTimeout(() => {
                    BlockUp();
                    addBlockButtons();
                    BlockAD();
                    // 如果需要实时显示在按钮上，可以在这里更新按钮文本
                    const managerButton = document.getElementById('bilibili-blacklist-manager');
                    if (managerButton) {
                        const textDiv = managerButton.querySelector('.right-entry-item > div:last-child');
                        if (textDiv) {
                            textDiv.textContent = `${blockedVideoCount}`;
                        }
                    }
                }, 1000);
            });
        }
    }

    // DOM准备就绪时运行

    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        init();
    }

    // 添加全局样式
    GM_addStyle(`
        /* 屏蔽按钮悬停效果 */
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
        /* 修复视频卡片布局 */
        .bili-video-card__cover {
            contain: layout !important;
        }
        /* 确保屏蔽按钮可点击 */
        .bilibili-blacklist-block-btn {
            pointer-events: auto !important;
        }
        /* 面板样式 */
        #bilibili-blacklist-panel {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        /* 按钮悬停效果 */
        #bilibili-blacklist-panel button {
            transition: background-color 0.2s;
        }
        #bilibili-blacklist-panel button:hover {
            opacity: 0.9;
        }
        /* 管理按钮悬停效果 */
        #bilibili-blacklist-manager:hover svg {
            transform: scale(1.1);
        }
        #bilibili-blacklist-manager svg {
            transition: transform 0.2s;
        }
        /* 输入框聚焦效果 */
        #bilibili-blacklist-panel input:focus {
            outline: none;
            border-color: #fb7299 !important;
        }
    `);
})();