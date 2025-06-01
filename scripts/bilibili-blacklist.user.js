// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      1.0.4
// @author       HeavenTTT
// @description  屏蔽指定UP主的视频推荐，支持精确匹配和正则表达式匹配
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.user.js
// @downloadURL https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.user.js
// @updateURL https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.meta.js
// ==/UserScript==

(function () {
    "use strict";
    // 从存储中获取黑名单
    // 默认精确匹配黑名单（区分大小写）
    let exactBlacklist = GM_getValue("exactBlacklist", [
        "绝区零",
        "崩坏星穹铁道",
        "崩坏3",
        "原神",
        "米哈游miHoYo",
    ]);
    // 默认正则匹配黑名单
    let regexBlacklist = GM_getValue("regexBlacklist", [
        "王者荣耀",
        "和平精英",
        "PUBG",
        "绝地求生",
        "吃鸡",
    ]);
    // 保存黑名单到存储
    function saveBlacklists() {
        GM_setValue("exactBlacklist", exactBlacklist);
        GM_setValue("regexBlacklist", regexBlacklist);
    }
    //#region 核心功能 - 屏蔽视频卡片
    let isShowAll = false; // 是否显示全部视频卡片
    let blockCount = 0; // 屏蔽的视频卡片数量
    let isBlocking = false; // 是否正在执行屏蔽操作
    let lastBlockTime = 0; // 上次执行屏蔽的时间戳
    let blockedCards = []; // 存储已屏蔽的视频卡片元素
    let processedCards = new WeakSet(); // 记录已处理过的卡片(避免重复处理)

    // 视频卡片选择器
    const selectorVideoCards = [
        ".feed-card", // 旧版卡片样式
        ".bili-video-card", // 新版卡片样式
        ".video-page-card-small", // 播放页小卡片
    ];
    /// 查找所有视频卡片
    function querySelectorAllVideoCard() {
        return selectorVideoCards.flatMap((selector) =>
            Array.from(document.querySelectorAll(selector))
        ); // 使用flatMap将所有选择器匹配到的元素合并为一个数组
    }

    function BlockCard(force = false) {
        const now = Date.now();
        // 节流控制：1秒内只执行一次 force参数用于强制执行
        if (!force) {
            if (isBlocking || now - lastBlockTime < 1000) {
                return;
            }
        }
        isBlocking = true;
        lastBlockTime = now;
        try {
            const cards = querySelectorAllVideoCard();
            //console.log("检测到视频卡片数量:", cards.length);
            let newblockCount = 0;
            cards.forEach((card) => {
                if (processedCards.has(card)) {
                    return; // 如果卡片已经处理过，则跳过
                }
                // 获取视频信息
                GetVideoInfo(card, (upName, title) => {
                    //console.log(`UP主名称: ${upName}, 视频标题: ${title}`);
                    if (upName && title) {
                        processedCards.add(card); // 将卡片标记为已处理
                        // 如果UP主名称和视频标题都存在
                        if (!card.querySelector(".bilibili-blacklist-block-btn")) {
                            // 创建屏蔽按钮
                            if (!isVideoPage()) {
                                const blockButton = createBlockButton(upName);
                                card.appendChild(blockButton); // 将按钮添加到卡片中
                            } else {
                                if (isInit) {
                                    const blockButton = createBlockButton(upName);
                                    card.querySelector(".card-box").style.position = "relative"; // 确保信息容器有相对定位
                                    card.querySelector(".card-box").appendChild(blockButton); // 将按钮添加到卡片信息中
                                    //card.appendChild(blockButton); // 将按钮添加到卡片中
                                }
                            }
                        }
                        // 检查是否在黑名单中
                        if (isBlacklisted(upName, title)) {
                            // 如果在黑名单中，则隐藏卡片
                            if (!blockedCards.includes(card)) {
                                blockedCards.push(card); // 将卡片添加到已屏蔽列表
                                newblockCount++; // 增加新屏蔽计数
                            }
                            if (!isShowAll) {
                                card.style.display = "none"; // 隐藏卡片
                            }
                        }
                    }
                });
            });
            blockCount = blockedCards.length;
            updateBlockCountDisplay();
        } finally {
            isBlocking = false; // 重置屏蔽状态
        }
    }
    // 更新屏蔽计数显示
    function updateBlockCountDisplay() {
        if (blockCountDiv) {
            blockCountDiv.textContent = `${blockCount}`;
        }
        // 更新面板标题（如果面板已打开）
        const panel = document.getElementById('bilibili-blacklist-panel');
        if (panel) {
            const titleElement = panel.querySelector('h3');
            if (titleElement) {
                titleElement.textContent = `已屏蔽视频 (${blockCount})`;
            }
        }
    }
    // 暂时取消屏蔽/恢复屏蔽功能
    function toggleShowAll() {
        isShowAll = !isShowAll;
        if (isShowAll) {
            // 显示所有被屏蔽的卡片
            blockedCards.forEach(card => {
                card.style.display = "block";
            });
            //blockCount = 0;
        } else {
            // 重新隐藏之前屏蔽的卡片
            blockedCards.forEach(card => {
                card.style.display = "none";
            });
            blockCount = blockedCards.length;
        }
        btnTempUnblock.textContent = isShowAll ? '恢复屏蔽' : '取消屏蔽';
        updateBlockCountDisplay();
    }
    const selectorUpName = [
        ".bili-video-card__info--author", // 主页
        ".bili-video-card__author", // 分类页面--> span title
        ".name", // 播放页面
    ];
    const selectorTitle = [
        ".bili-video-card__info--tit", // 主页
        ".bili-video-card__title", // 分类页面--> span title
        ".title", // 播放页面
    ];
    //获取视频信息 -UP主名称 -视频标题
    function GetVideoInfo(card, callback) {
        let flag = false; // 标志位，表示是否找到视频信息
        let upName = "";
        let title = "";
        if (card.style.display === "none") return false; // 如果卡片已经被隐藏，则跳过
        const upNameElement = card.querySelectorAll(selectorUpName.join(", ")); // 使用逗号分隔的选择器
        if (upNameElement.length > 0) {
            upName = upNameElement[0].textContent.trim(); // 获取第一个匹配到的元素的内容，并去除首尾空格
            //处理分类页面的UP主名称
            if (isCategoryPage()) {
                upName = upName.split(" · ")[0].trim();
                //console.log(`分类页面UP主名称: ${upName}`);
            }
        }
        const titleElement = card.querySelectorAll(selectorTitle.join(", ")); // 使用逗号分隔的选择器
        if (titleElement.length > 0) {
            title = titleElement[0].textContent.trim(); // 获取第一个匹配到的元素的内容，并去除首尾空格
        }
        if (upName && title) {
            flag = true;
            callback(upName, title);
        }
        return flag;
    }
    function isBlacklisted(upName, title) {
        if (exactBlacklist.includes(upName)) {
            return true; // 精确匹配黑名单
        }
        if (regexBlacklist.some((regex) => new RegExp(regex).test(upName))) {
            return true; // 正则匹配黑名单
        }
        if (regexBlacklist.some((regex) => new RegExp(regex).test(title))) {
            return true; // 新增标题正则黑名单
        }
        return false; // 不在黑名单中
    }
    /// 添加UP主到精确黑名单并刷新页面
    function addToExactBlacklistAndRefresh(upName) {
        try {
            if (!upName) return;
            if (!exactBlacklist.includes(upName)) {
                exactBlacklist.push(upName);
                saveBlacklists();
                updateExactList();
                BlockCard(true);
            }
        } catch (e) {
            console.error("添加黑名单出错:", e);
        }
    }
    //#endregion

    //#region 页面修改
    //创建屏蔽按钮（悬停在视频卡片上时显示）
    function createBlockButton(upName) {
        const btn = document.createElement("div");
        btn.className = "bilibili-blacklist-block-btn";
        btn.innerHTML = "×";
        btn.title = `屏蔽: ${upName}`;

        // 屏蔽按钮样式
        btn.style.position = "absolute";
        btn.style.top = "5px";
        btn.style.left = "5px";
        btn.style.width = "35px";
        btn.style.height = "20px";
        btn.style.backgroundColor = "#fb7299dd";
        btn.style.color = "white";
        btn.style.borderRadius = "5%";
        btn.style.display = "none";
        btn.style.justifyContent = "center";
        btn.style.alignItems = "center";
        btn.style.cursor = "pointer";
        btn.style.zIndex = "100";
        btn.style.fontSize = "16px";
        btn.style.fontWeight = "bold";
        btn.style.transition = "opacity 0.2s";

        // 点击时添加到黑名单
        btn.addEventListener("click", (e) => {
            e.stopPropagation(); // 防止事件冒泡
            addToExactBlacklistAndRefresh(upName);// 使用公共函数
        });

        return btn;
    }
    // 在右侧导航栏添加黑名单管理按钮
    let blockCountDiv = null;
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
        li.className = 'v-popover-wrap';

        const btn = document.createElement('div');
        btn.className = 'right-entry-item';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';

        // 盾牌图标SVG
        const icon = document.createElement('div');
        icon.className = 'right-entry__outside';
        icon.innerHTML = getKirbySVG();
        //icon.style.color = '#fb7299'; // B站粉色
        icon.style.marginBottom = '-5px';
        blockCountDiv = document.createElement('span');
        //const text = document.createElement('div');
        blockCountDiv.textContent = `0`;
        btn.appendChild(icon);
        btn.appendChild(blockCountDiv);
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
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
                //updateBlockCountDisplay(); // 更新屏蔽计数显示
            } else {
                panel.style.display = 'none';
            }

        });
    }
    // 创建黑名单管理面板
    let btnTempUnblock = null; // 暂时取消屏蔽按钮
    let exactList; // 精确匹配列表
    function updateExactList() {
        if (!exactList) return; // 安全检查

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
                BlockCard(true); // 更新后重新执行屏蔽
            });

            item.appendChild(name);
            item.appendChild(removeBtn);
            exactList.appendChild(item);
        });

        if (exactBlacklist.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = '暂无精确匹配屏蔽UP主';
            empty.style.textAlign = 'center';
            empty.style.padding = '16px';
            empty.style.color = '#999';
            exactList.appendChild(empty);
        }
    }
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
        regexTab.textContent = '正则匹配(Up/标题)';
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

        // 暂时取消屏蔽
        btnTempUnblock = document.createElement('button');
        btnTempUnblock.textContent = isShowAll ? '恢复屏蔽' : '取消屏蔽';
        btnTempUnblock.style.padding = '8px 16px';
        btnTempUnblock.style.border = 'none';
        btnTempUnblock.style.borderRadius = '4px';
        btnTempUnblock.style.backgroundColor = '#fb7299';
        btnTempUnblock.style.color = '#fff';
        btnTempUnblock.style.cursor = 'pointer';
        btnTempUnblock.style.marginRight = '8px';
        btnTempUnblock.addEventListener('click', toggleShowAll);
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
        header.appendChild(btnTempUnblock);
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
            if (upName) {
                addToExactBlacklistAndRefresh(upName); // 使用公共函数
                exactInput.value = ''; // 清空输入框
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
                    BlockCard(true); // 更新后重新执行屏蔽
                } catch (e) {
                    alert('无效的正则表达式: ' + e.message);
                }
            }
        });

        addRegexContainer.appendChild(regexInput);
        addRegexContainer.appendChild(addRegexBtn);
        regexContent.appendChild(addRegexContainer);

        // 精确匹配列表
        exactList = document.createElement('ul');
        exactList.style.listStyle = 'none';
        exactList.style.padding = '0';
        exactList.style.margin = '0';

        // 正则匹配列表
        const regexList = document.createElement('ul');
        regexList.style.listStyle = 'none';
        regexList.style.padding = '0';
        regexList.style.margin = '0';

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
                    BlockCard(true); // 更新后重新执行屏蔽
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
    // 添加全局样式
    GM_addStyle(`
        /* 屏蔽按钮悬停效果 */
        .bili-video-card:hover .bilibili-blacklist-block-btn {
            display: flex !important;
            opacity: 1 !important;
        }
        /* 屏蔽按钮悬停效果 - 支持card-box内的按钮 */
        .card-box:hover .bilibili-blacklist-block-btn {
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
    //可爱的卡比图标
    function getKirbySVG() {
        return `
        <svg width="35" height="35" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"  >
            <ellipse cx="70" cy="160" rx="30" ry="15" fill="#cc3333" />
            <ellipse cx="130" cy="160" rx="30" ry="15" fill="#cc3333" />
            <ellipse cx="50" cy="120" rx="20" ry="20" fill="#ffb6c1" />
            <ellipse cx="150" cy="120" rx="20" ry="20" fill="#ffb6c1" />
            <circle cx="100" cy="110" r="60" fill="#ffb6c1" />
            <ellipse cx="80" cy="90" rx="10" ry="22" fill="blue" />
            <ellipse cx="80" cy="88" rx="10" ry="15" fill="black" />
            <ellipse cx="80" cy="82" rx="8" ry="12" fill="#ffffff" />
            <ellipse cx="80" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
            <ellipse cx="120" cy="90" rx="10" ry="22" fill="blue" />
            <ellipse cx="120" cy="88" rx="10" ry="15" fill="black" />
            <ellipse cx="120" cy="82" rx="8" ry="12" fill="#ffffff" />
            <ellipse cx="120" cy="90" rx="10" ry="22" fill="#00000000" stroke="#000000" strokeWidth="4" />
            <ellipse cx="60" cy="110" rx="8" ry="5" fill="#ff4466" />
            <ellipse cx="140" cy="110" rx="8" ry="5" fill="#ff4466" />
            <path d="M 90 118 Q 100 125, 110 118" stroke="black" strokeWidth="3" fill="transparent" />
        </svg>
    `;
    }
    //#endregion
    //##########################

    //#region 观察者
    // MutationObserver 检测动态加载的新内容（仅当节点可见时才触发）
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        if (isVideoPage()) {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    // 检查新增节点是否可见（有宽度或高度）
                    shouldCheck = Array.from(mutation.addedNodes).some((node) => {
                        // 仅检查元素节点（跳过文本节点、注释等）
                        if (node.nodeType !== Node.ELEMENT_NODE) return false;

                        // 检查元素或其子元素是否可见
                        const hasVisibleContent =
                            node.offsetWidth > 0 ||
                            node.offsetHeight > 0 ||
                            node.querySelector("[offsetWidth], [offsetHeight]");

                        return hasVisibleContent;
                    });
                }
            });
        } else {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                }
            });
        }

        // 如果有可见的新内容，延迟 1 秒后执行屏蔽（确保 DOM 完全渲染）
        if (shouldCheck) {
            processedCards = new WeakSet(); // 重置已处理卡片集合
            setTimeout(() => {
                BlockCard();
                addBlacklistManagerButton(); // 确保每次都添加黑名单管理按钮
                if (isMainPage()) {
                    BlockAD(); // 屏蔽页面广告
                }
                if (isVideoPage()) {
                    BlockVideoPageAd(); // 屏蔽视频页面广告
                }
            }, 1000);
        }
    });

    // 初始化观察者（监视 DOM 变化）
    let observerError = 0;
    function initObserver(container) {
        const rootNode =
            document.getElementById(container) || // B站的主容器 ID
            document.documentElement; // 回退到整个文档

        if (rootNode) {
            observer.observe(rootNode, {
                childList: true, // 监视添加/移除的节点
                subtree: true, // 监视所有后代
            });
            return true;
        } else {
            // 如果没找到根节点则重试
            setTimeout(() => initObserver(container), 500);
            console.warn("未找到根节点，正在重试...");
            observerError++;

            if (observerError > 10) {
                console.error("重试次数过多，停止重试。");
                return false;
            }
        }
    }
    //#endregion
    //#region 初始化函数

    let isInit = false; // 是否已经初始化
    function init() {
        // 重置状态
        isBlocking = false;
        lastBlockTime = 0;
        blockedCards = [];
        processedCards = new WeakSet();
        if (isMainPage()) {
            initMainPage(); // 初始化主页
            BlockAD(); // 屏蔽主页广告
        } else if (isSearchPage()) {
            initSearchPage(); // 初始化搜索页
        } else if (isVideoPage()) {
            initVideoPage(); // 初始化播放页
            //BlockVideoPageAd(); // 屏蔽视频页面广告
        } else if (isCategoryPage()) {
            initCategoryPage(); // 初始化分类页
        } else {
            //console.log("🥚");
        }
        BlockCard(); // 初始化时立即执行屏蔽
        addBlacklistManagerButton(); // 添加黑名单管理按钮
        isInit = true; // 标记为已初始化
        console.log("BiliBili黑名单脚本已加载🥔");
    }
    // 监听页面加载完成事件
    document.addEventListener("DOMContentLoaded", init);
    if (
        document.readyState === "interactive" ||
        document.readyState === "complete"
    ) {
        init();
    }
    // 检查当前页面是否为B站主页
    function isMainPage() {
        return location.pathname === "/";
    }

    function initMainPage() {
        initObserver("i_cecream"); // 传入B站主页的主容器ID
        console.log("主页已加载🍓");
    }
    /// ----主页结束----
    /// -----搜索页----
    function isSearchPage() {
        //页面链接 https://search.bilibili.com/all?keyword=xxx
        // 通过检查路径名是否以 "/search" 开头来判断是否为搜索页
        return location.hostname === "search.bilibili.com";
    }
    function initSearchPage() {
        initObserver("i_cecream"); // 传入B站搜索页的主容器ID
        console.log("搜索页已加载🍉");
    }
    /// --- 搜索页结束---
    /// --- 播放页 ---
    function isVideoPage() {
        // 页面链接 https://www.bilibili.com/video/BV1xxxxxx
        // 通过检查路径名是否以 "/video/" 开头来判断是否为视频页
        return location.pathname.startsWith("/video/");
    }
    function initVideoPage() {
        initObserver("app"); // 传入B站播放页的主容器ID
        console.log("播放页已加载🍇");
    }
    /// ---- 播放页结束 ---
    /// ---- 分类页 ----
    function isCategoryPage() {
        // 页面链接 https://www.bilibili.com/c/xxxxxx
        // 通过检查路径名是否以 "/c/" 开头来判断是否为分类页
        return location.pathname.startsWith("/c/");
    }
    function initCategoryPage() {
        initObserver("app"); // 传入B站分类页的主容器ID
        console.log("分类页已加载🍊");
    }
    /// --- 分类页结束 ---
    //#endregion

    //#region 额外功能-屏蔽广告
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
            '.video-card-ad-small', // 右上角推广
            '.slide-ad-exp', // 大推广
            '.video-page-game-card-small', // 游戏推广
            '.activity-m-v1', // 活动推广
            '.video-page-special-card-small', // 特殊卡片推广
            '.ad-floor-exp' // 广告地板
        ];

        adSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(adCard => {
                adCard.remove();
            });
        });
    }
    //#endregion
})();
