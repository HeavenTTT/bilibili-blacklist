function loadUiModule() {
  /**
   * 为UP主创建屏蔽按钮，显示在视频卡片上。
   * @param {string} upName - UP主名称。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {HTMLDivElement} 创建的按钮元素。
   */
  function createBlockUpButton(upName, cardElement) {
    const button = document.createElement("div");
    button.className = "bilibili-blacklist-block-btn";
    button.innerHTML = "屏蔽";
    button.title = `屏蔽: ${upName}`;

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡，防止触发视频点击事件
      addToExactBlacklist(upName, cardElement);
    });

    return button;
  }

  /**
   * 为标签名创建屏蔽按钮，显示在视频卡片上。
   * @param {string} tagName - 标签名。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   * @returns {HTMLSpanElement} 创建的按钮元素。
   */
  function createTNameBlockButton(tagName, cardElement) {
    const button = document.createElement("span");
    button.className = "bilibili-blacklist-tname";
    button.innerHTML = `${tagName}`;
    button.title = `屏蔽: ${tagName}`;

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      addToTagNameBlacklist(tagName, cardElement);
    });

    return button;
  }

  /**
   * 将黑名单管理器按钮添加到右侧导航条。
   */
  function addBlacklistManagerButton() {
    const rightEntry = document.querySelector(".right-entry");
    if (!rightEntry) {
      console.warn("[bilibili-blacklist] 未找到右侧导航栏");
      return;
    } else if (
      !rightEntry.querySelector("#bilibili-blacklist-manager-button")
    ) {
      const listItem = document.createElement("li");
      listItem.id = "bilibili-blacklist-manager-button";
      listItem.style.cursor = "pointer";
      listItem.className = "v-popover-wrap";

      const button = document.createElement("div");
      button.className = "right-entry-item";
      button.style.display = "flex";
      button.style.flexDirection = "column";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";

      const icon = document.createElement("div");
      icon.className = "right-entry__outside";
      icon.innerHTML = getKirbySVG(); // 获取卡比SVG图标
      icon.style.marginBottom = "-5px";

      blockCountDisplayElement = document.createElement("span");
      blockCountDisplayElement.textContent = `0`;

      button.appendChild(icon);
      button.appendChild(blockCountDisplayElement);
      listItem.appendChild(button);

      // 将按钮插入到导航栏的特定位置
      if (rightEntry.children.length > 1) {
        rightEntry.insertBefore(listItem, rightEntry.children[1]);
      } else {
        rightEntry.appendChild(listItem);
      }

      // 点击按钮显示/隐藏管理面板
      listItem.addEventListener("click", () => {
        if (managerPanel.style.display === "none") {
          managerPanel.style.display = "flex";
        } else {
          managerPanel.style.display = "none";
        }
      });
    }
  }

  /**
   * 更新已屏蔽视频的显示计数。
   */
  function refreshBlockCountDisplay() {
    if (blockCountDisplayElement) {
      blockCountDisplayElement.textContent = `${blockedVideoCards.size}`;
    }
    countBlockInfo;
    if (blockCountTitleElement) {
      blockCountTitleElement.textContent = `已屏蔽视频 (${blockedVideoCards.size} = ${countBlockInfo} + ${countBlockAD} + ${countBlockCM} + ${countBlockTName})`;
    }
  }

  // 辅助函数：创建通用按钮
  function createPanelButton(text, bgColor, onClick) {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.padding = "4px 8px";
    button.style.background = bgColor;
    button.style.color = "#fff";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);
    return button;
  }

  // 辅助函数：为黑名单面板创建列表项
  function createBlacklistListItem(contentText, onRemoveClick) {
    const item = document.createElement("li");
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.padding = "8px 0";
    item.style.borderBottom = "1px solid #f1f2f3";

    const content = document.createElement("span");
    content.textContent = contentText;
    content.style.flex = "1";
    const removeBtn = createPanelButton("移除", "#f56c6c", onRemoveClick);

    item.appendChild(content);
    item.appendChild(removeBtn);
    return item;
  }

  /**
   * 刷新面板中的精确匹配黑名单显示。
   */
  function refreshExactMatchList() {
    if (!exactMatchListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      exactMatchListElement = document.querySelector(
        "#bilibili-blacklist-exact-list"
      );
      if (!exactMatchListElement) {
        console.warn("[Bilibili-Blacklist] exactMatchListElement 未定义");
        return;
      }
    }
    exactMatchListElement.innerHTML = "";
    exactMatchBlacklist.forEach((upName) => {
      const item = createBlacklistListItem(upName, () => {
        removeFromExactBlacklist(upName);
      });
      exactMatchListElement.appendChild(item);
    });
    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(exactMatchListElement.children)
      .reverse()
      .forEach((item) => exactMatchListElement.appendChild(item));

    if (exactMatchBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无精确匹配屏蔽UP主";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      exactMatchListElement.appendChild(empty);
    }
  }

  /**
   * 刷新面板中的正则匹配黑名单显示。
   */
  function refreshRegexMatchList() {
    if (!regexMatchListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      regexMatchListElement = document.querySelector(
        "#bilibili-blacklist-regex-list"
      );
      if (!regexMatchListElement) {
        console.warn("[Bilibili-Blacklist] regexMatchListElement 未定义");
        return;
      }
    }
    regexMatchListElement.innerHTML = "";

    regexMatchBlacklist.forEach((regex, index) => {
      const item = createBlacklistListItem(regex, () => {
        regexMatchBlacklist.splice(index, 1);
        saveBlacklistsToStorage();
        refreshRegexMatchList();
      });
      regexMatchListElement.appendChild(item);
    });

    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(regexMatchListElement.children)
      .reverse()
      .forEach((item) => regexMatchListElement.appendChild(item));

    if (regexMatchBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无正则匹配屏蔽规则";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      regexMatchListElement.appendChild(empty);
    }
  }

  /**
   * 刷新面板中的标签名黑名单显示。
   */
  function refreshTagNameList() {
    if (!tagNameListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      tagNameListElement = document.querySelector(
        "#bilibili-blacklist-tname-list"
      );
      if (!tagNameListElement) {
        console.warn("[Bilibili-Blacklist] tagNameListElement 未定义");
        return;
      }
    }
    tagNameListElement.innerHTML = "";

    tagNameBlacklist.forEach((tagName) => {
      const item = createBlacklistListItem(tagName, () => {
        removeFromTagNameBlacklist(tagName);
      });
      tagNameListElement.appendChild(item);
    });
    // 反转列表顺序，使最新添加的显示在顶部
    Array.from(tagNameListElement.children)
      .reverse()
      .forEach((item) => tagNameListElement.appendChild(item));

    if (tagNameBlacklist.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "暂无标签屏蔽规则";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      empty.style.color = "#999";
      tagNameListElement.appendChild(empty);
    }
  }

  // 辅助函数：为设置创建切换按钮
  function createSettingToggleButton(labelText, configKey, title = null) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.marginBottom = "8px";
    container.style.gap = "8px";
    container.title = title; // 设置鼠标悬停提示

    const label = document.createElement("span");
    label.textContent = labelText;
    label.style.flex = "1";

    const button = document.createElement("button");
    button.style.padding = "6px 12px";
    button.style.border = "none";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.color = "#fff";

    function refreshButtonAppearance() {
      button.textContent = globalPluginConfig[configKey] ? "开启" : "关闭";
      button.style.backgroundColor = globalPluginConfig[configKey]
        ? "#fb7299"
        : "#909399";
    }

    button.addEventListener("click", () => {
      globalPluginConfig[configKey] = !globalPluginConfig[configKey];
      refreshButtonAppearance();
      saveGlobalConfigToStorage();
    });

    refreshButtonAppearance(); // 初始化按钮外观

    container.appendChild(label);
    container.appendChild(button);

    return container;
  }
  // 辅助函数：为设置创建输入文本
  function createSettingInput(labelText, configKey, title = null) {
    // 卡片扫描间隔设置
    const Container = document.createElement("div");
    Container.style.display = "flex";
    Container.style.alignItems = "center";
    Container.style.marginTop = "16px";
    Container.style.gap = "8px";
    Container.title = title;

    const Label = document.createElement("span");
    Label.textContent = labelText;
    Label.style.flex = "1";

    const Input = document.createElement("input");
    Input.type = "number";
    Input.min = "0";
    Input.value = globalPluginConfig[configKey];
    Input.style.width = "100px";
    Input.style.padding = "6px";
    Input.style.border = "1px solid #ddd";
    Input.style.borderRadius = "4px";

    const Button = document.createElement("button");
    Button.textContent = "保存";
    Button.style.padding = "6px 12px";
    Button.style.backgroundColor = "#fb7299";
    Button.style.color = "#fff";
    Button.style.border = "none";
    Button.style.borderRadius = "4px";
    Button.style.cursor = "pointer";

    Button.addEventListener("click", () => {
      const val = parseFloat(Input.value, 10);
      if (!isNaN(val) && val >= 0) {
        globalPluginConfig[configKey] = val;
        saveGlobalConfigToStorage();
      } else {
        alert("请输入有效的非负数字！");
      }
    });
    Container.appendChild(Label);
    Container.appendChild(Input);
    Container.appendChild(Button);

    return Container;
  }
  /**
   * 刷新面板中的配置设置显示。
   */
  function refreshConfigSettings() {
    if (!configListElement) {
      if (!isBlacklistPanelCreated()) {
        return;
      }
      configListElement = document.querySelector(
        "#bilibili-blacklist-config-list"
      );
      if (!configListElement) {
        console.warn("[Bilibili-Blacklist] configListElement 未定义");
        return;
      }
    }
    configListElement.innerHTML = "";

    // 临时开关按钮
    const tempToggleContainer = document.createElement("div");
    tempToggleContainer.style.display = "flex";
    tempToggleContainer.style.alignItems = "center";
    tempToggleContainer.style.marginBottom = "8px";
    tempToggleContainer.style.gap = "8px";
    tempToggleContainer.style.margin = "20px 0";

    const tempToggleLabel = document.createElement("span");
    tempToggleLabel.textContent = "临时开关";
    tempToggleLabel.style.flex = "1";

    tempUnblockButton = document.createElement("button");
    tempUnblockButton.textContent = isShowAllVideos ? "恢复屏蔽" : "取消屏蔽";
    tempUnblockButton.style.background = isShowAllVideos
      ? "#dddddd"
      : "#fb7299";
    tempUnblockButton.style.padding = "6px 12px";
    tempUnblockButton.style.border = "none";
    tempUnblockButton.style.cursor = "pointer";
    tempUnblockButton.style.color = "#fff";
    tempUnblockButton.addEventListener("click", toggleShowAllBlockedVideos);

    tempToggleContainer.appendChild(tempToggleLabel);
    tempToggleContainer.appendChild(tempUnblockButton);
    configListElement.appendChild(tempToggleContainer);

    const title = document.createElement("h4");
    title.textContent = "全局配置开关(部分功能刷新后生效)";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "12px";
    configListElement.appendChild(title);

    // 添加配置切换按钮
    configListElement.appendChild(
      createSettingToggleButton(
        "屏蔽标题/Up主名",
        "flagInfo",
        "屏蔽标题/Up主名"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "屏蔽分类标签",
        "flagTName",
        "通过请求API获取分类标签"
      )
    );

    // 标签缓存数量显示与清除按钮
    const tagNameListControlContainer = document.createElement("div");
    tagNameListControlContainer.style.display = "flex";
    tagNameListControlContainer.style.alignItems = "center";
    tagNameListControlContainer.style.marginBottom = "8px";
    tagNameListControlContainer.style.gap = "8px";
    tagNameListControlContainer.title = "打开视频播放页面可刷新";

    const tagNameListLabel = document.createElement("span");
    tagNameListLabel.textContent = `分类标签缓存数量: ${tagNameList.length}`;
    tagNameListLabel.style.flex = "1";

    const clearTagNameListButton = document.createElement("button");
    clearTagNameListButton.textContent = "清除";
    clearTagNameListButton.style.padding = "6px 12px";
    clearTagNameListButton.style.backgroundColor = "#f56c6c";
    clearTagNameListButton.style.color = "#fff";
    clearTagNameListButton.style.border = "none";
    clearTagNameListButton.style.borderRadius = "4px";
    clearTagNameListButton.style.cursor = "pointer";
    clearTagNameListButton.addEventListener("click", () => {
      if (confirm("确定要清除分类标签缓存吗？这不会影响已屏蔽的标签，但会使得下次需要重新从API获取标签信息。")) {
        tagNameList.length = 0;
        if (typeof saveTagNameListToStorage === "function") {
          saveTagNameListToStorage();
        } else {
          GM_setValue("tagNameList", []);
          GM_setValue("tLastTime", 0);
        }
        tagNameListLabel.textContent = `分类标签缓存数量: 0`;
      }
    });

    tagNameListControlContainer.appendChild(tagNameListLabel);
    tagNameListControlContainer.appendChild(clearTagNameListButton);
    configListElement.appendChild(tagNameListControlContainer);

    configListElement.appendChild(
      createSettingToggleButton(
        "屏蔽竖屏视频",
        "flagVertical",
        "通过请求API获取视频分辨率"
      )
    );
    configListElement.appendChild(
      createSettingToggleButton("屏蔽主页推荐", "flagAD", "直播/广告/分区推送")
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "屏蔽主页视频软广",
        "flagCM",
        "cm.bilibili.com软广"
      )
    );

    //分割线
    const hr = document.createElement("hr");
    hr.style.margin = "12px 0";
    hr.style.border = "none";
    hr.style.borderTop = "2px solid #ddd";
    configListElement.appendChild(hr);

    configListElement.appendChild(
      createSettingToggleButton("遮挡被屏蔽视频", "flagKirby", "更加温和的方式")
    );
    configListElement.appendChild(
      createSettingToggleButton(
        "加载时立即隐藏卡片",
        "flagHideOnLoad",
        "新卡片加载出来时是否立即隐藏，待处理完成后再决定显示或继续屏蔽。关闭此功能可能会导致卡片先显示后隐藏的闪烁。"
      )
    );

    configListElement.appendChild(
      createSettingInput(
        "卡片扫描间隔 (ms):",
        "blockScanInterval",
        "扫描新卡片的间隔时间，单位 ms。值越小，新卡片隐藏越快，但可能会增加CPU负担。建议值 200ms。"
      )
    );

    configListElement.appendChild(
      createSettingInput(
        "视频信息API请求间隔 (ms):",
        "processQueueInterval",
        "每个视频获取分类标签/视频分辨率时的API请求间隔时间，单位 ms。间隔时间越长，越不容易触发B站API限速。建议值 200ms。"
      )
    );
    configListElement.appendChild(
      createSettingInput(
        "竖屏视频比例阈值:",
        "verticalScaleThreshold",
        "获取的视频API信息后，判断视频是否为竖屏（长 除于 宽）的阈值。建议值 0.7。"
      )
    );
  }

  /**
   * 刷新黑名单管理面板中的所有标签页。
   */
  function refreshAllPanelTabs() {
    refreshExactMatchList();
    refreshRegexMatchList();
    refreshTagNameList();
    refreshConfigSettings();
  }

  /**
   * 检查黑名单管理面板是否已创建并存在于DOM中。
   * 如果找到，则设置全局 `managerPanel` 引用。
   * @returns {boolean} 如果面板存在则返回true，否则返回false。
   */
  function isBlacklistPanelCreated() {
    const panelInDom = document.querySelector(
      "#bilibili-blacklist-manager-panel"
    );
    if (panelInDom) {
      if (!managerPanel) {
        managerPanel = panelInDom;
      }
      return true;
    }
    return false;
  }

  /**
   * 创建黑名单管理面板。
   */
  function createBlacklistPanel() {
    if (isBlacklistPanelCreated()) {
      return;
    }
    managerPanel = document.createElement("div");
    managerPanel.id = "bilibili-blacklist-manager-panel"; // 确保ID唯一

    // 设置面板样式
    managerPanel.style.position = "fixed";
    managerPanel.style.top = "50%";
    managerPanel.style.left = "50%";
    managerPanel.style.transform = "translate(-50%, -50%)";
    managerPanel.style.width = "500px";
    managerPanel.style.maxHeight = "80vh";
    managerPanel.style.backgroundColor = "#fff";
    managerPanel.style.borderRadius = "8px";
    managerPanel.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    managerPanel.style.zIndex = "99999";
    managerPanel.style.overflow = "hidden";
    managerPanel.style.display = "none"; // 默认隐藏
    managerPanel.style.flexDirection = "column";
    managerPanel.style.backgroundColor = "#ffffffee"; // 半透明背景

    // 创建标签容器
    const tabContainer = document.createElement("div");
    tabContainer.style.display = "flex";
    tabContainer.style.borderBottom = "1px solid #f1f2f3";

    // 创建各个标签页的内容区域
    const exactContent = document.createElement("div");
    exactContent.style.padding = "16px";
    exactContent.style.overflowY = "auto";
    exactContent.style.flex = "1";
    exactContent.style.display = "block"; // 默认显示精确匹配

    const regexContent = document.createElement("div");
    regexContent.style.padding = "16px";
    regexContent.style.overflowY = "auto";
    regexContent.style.flex = "1";
    regexContent.style.display = "none";

    const tnameContent = document.createElement("div");
    tnameContent.style.padding = "16px";
    tnameContent.style.overflowY = "auto";
    tnameContent.style.flex = "1";
    tnameContent.style.display = "none";

    const configContent = document.createElement("div");
    configContent.style.padding = "16px";
    configContent.style.overflowY = "auto";
    configContent.style.flex = "1";
    configContent.style.display = "none";

    // 定义标签页数据
    const tabs = [
      { name: "精确匹配(Up名字)", content: exactContent },
      { name: "正则匹配(Up/标题)", content: regexContent },
      { name: "屏蔽分类", content: tnameContent },
      { name: "插件配置", content: configContent },
    ];
    tabs.forEach((tabData) => {
      const tab = document.createElement("div");
      tab.textContent = tabData.name;
      tab.style.padding = "12px 16px";
      tab.style.cursor = "pointer";
      tab.style.fontWeight = "500";
      tab.style.borderBottom =
        tabData.content.style.display === "block"
          ? "2px solid #fb7299"
          : "none";

      // 标签点击事件，切换内容显示
      tab.addEventListener("click", () => {
        tabs.forEach(({ tab: t, content: c }) => {
          t.style.borderBottom = "none";
          c.style.display = "none";
        });
        tab.style.borderBottom = "2px solid #fb7299";
        tabData.content.style.display = "block";
      });

      tabData.tab = tab; // 保存对标签元素的引用
      tabContainer.appendChild(tab);
    });

    // 创建面板头部
    const header = document.createElement("div");
    header.style.padding = "16px";
    header.style.borderBottom = "1px solid #f1f2f3";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    blockCountTitleElement = document.createElement("h3");
    blockCountTitleElement.style.margin = "0";
    blockCountTitleElement.style.fontWeight = "500";
    blockCountTitleElement.title = "总数 =(UP/标题 + 广告 + CM + 分类/竖屏)";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "0 8px";
    closeBtn.addEventListener("click", () => {
      managerPanel.style.display = "none";
    });

    header.appendChild(blockCountTitleElement);
    header.appendChild(closeBtn);

    const contentContainer = document.createElement("div");
    contentContainer.style.display = "flex";
    contentContainer.style.flexDirection = "column";
    contentContainer.style.flex = "1";
    contentContainer.style.overflow = "hidden";

    // 精确匹配添加输入框和按钮
    const addExactContainer = document.createElement("div");
    addExactContainer.style.display = "flex";
    addExactContainer.style.marginBottom = "16px";
    addExactContainer.style.gap = "8px";

    const exactInput = document.createElement("input");
    exactInput.type = "text";
    exactInput.placeholder = "输入要屏蔽的UP主名称";
    exactInput.style.flex = "1";
    exactInput.style.padding = "8px";
    exactInput.style.border = "1px solid #ddd";
    exactInput.style.borderRadius = "4px";

    const addExactBtn = document.createElement("button");
    addExactBtn.textContent = "添加";
    addExactBtn.style.padding = "8px 16px";
    addExactBtn.style.background = "#fb7299";
    addExactBtn.style.color = "#fff";
    addExactBtn.style.border = "none";
    addExactBtn.style.borderRadius = "4px";
    addExactBtn.style.cursor = "pointer";
    addExactBtn.addEventListener("click", () => {
      const upName = exactInput.value.trim();
      if (upName) {
        addToExactBlacklist(upName);
        exactInput.value = "";
      }
    });
    addExactContainer.appendChild(exactInput);
    addExactContainer.appendChild(addExactBtn);
    exactContent.appendChild(addExactContainer);

    // 正则匹配添加输入框和按钮
    const addRegexContainer = document.createElement("div");
    addRegexContainer.style.display = "flex";
    addRegexContainer.style.marginBottom = "16px";
    addRegexContainer.style.gap = "8px";

    const regexInput = document.createElement("input");
    regexInput.type = "text";
    regexInput.placeholder = "输入正则表达式 (如: 小小.*Official)";
    regexInput.style.flex = "1";
    regexInput.style.padding = "8px";
    regexInput.style.border = "1px solid #ddd";
    regexInput.style.borderRadius = "4px";

    const addRegexBtn = document.createElement("button");
    addRegexBtn.textContent = "添加";
    addRegexBtn.style.padding = "8px 16px";
    addRegexBtn.style.background = "#fb7299";
    addRegexBtn.style.color = "#fff";
    addRegexBtn.style.border = "none";
    addRegexBtn.style.borderRadius = "4px";
    addRegexBtn.style.cursor = "pointer";
    addRegexBtn.addEventListener("click", () => {
      const regex = regexInput.value.trim();
      if (regex && !regexMatchBlacklist.includes(regex)) {
        try {
          new RegExp(regex); // 验证正则表达式
          regexMatchBlacklist.push(regex);
          saveBlacklistsToStorage();
          regexInput.value = "";
          refreshRegexMatchList();
        } catch (e) {
          alert("无效的正则表达式: " + e.message);
        }
      }
    });
    addRegexContainer.appendChild(regexInput);
    addRegexContainer.appendChild(addRegexBtn);
    regexContent.appendChild(addRegexContainer);

    // 创建列表元素
    exactMatchListElement = document.createElement("ul");
    exactMatchListElement.id = "bilibili-blacklist-exact-list";
    exactMatchListElement.style.listStyle = "none";
    exactMatchListElement.style.padding = "0";
    exactMatchListElement.style.margin = "0";

    regexMatchListElement = document.createElement("ul");
    regexMatchListElement.id = "bilibili-blacklist-regex-list";
    regexMatchListElement.style.listStyle = "none";
    regexMatchListElement.style.padding = "0";
    regexMatchListElement.style.margin = "0";

    tagNameListElement = document.createElement("ul");
    tagNameListElement.id = "bilibili-blacklist-tname-list";
    tagNameListElement.style.listStyle = "none";
    tagNameListElement.style.padding = "0";
    tagNameListElement.style.margin = "0";

    configListElement = document.createElement("ul");
    configListElement.id = "bilibili-blacklist-config-list";
    configListElement.style.listStyle = "none";
    configListElement.style.padding = "0";
    configListElement.style.margin = "0";

    refreshAllPanelTabs(); // 初始化所有标签页内容
    exactContent.appendChild(exactMatchListElement);
    regexContent.appendChild(regexMatchListElement);
    tnameContent.appendChild(tagNameListElement);
    configContent.appendChild(configListElement);

    contentContainer.appendChild(exactContent);
    contentContainer.appendChild(regexContent);
    contentContainer.appendChild(tnameContent);
    contentContainer.appendChild(configContent);

    managerPanel.appendChild(tabContainer);
    managerPanel.appendChild(header);
    managerPanel.appendChild(contentContainer);

    document.body.appendChild(managerPanel);
    return managerPanel;
  }

  /**
   * 为插件添加全局CSS样式。
   */
  GM_addStyle(`
        .bilibili-blacklist-block-container {
          display: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 20px;
          margin-top: 5px;
          padding: 0 5px;
          font-size: 12px;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          gap: 3px;
          z-index: 9999;
          pointer-events: none;
          text-align:center;

      }

      .bili-video-card:hover .bilibili-blacklist-block-container,
      .card-box:hover .bilibili-blacklist-block-container {
          display: flex !important;
          pointer-events: none;
      }
      .card-box .bilibili-blacklist-block-container
      {
        flex-direction: column;
        align-items: flex-start;
        height: 100%;
      }
      .card-box .bilibili-blacklist-tname-group
      {
        flex-direction: column;
        align-items: flex-end;
        bottom: 0;
      }
      .card-box .bilibili-blacklist-tname-group .bilibili-blacklist-tname
      {
        background-color:rgba(255, 255, 255, 0.87);
        color: #9499A0;
        border: 1px solid #9499A0;
      }

      .bilibili-blacklist-block-btn {
          position: static;
          display: flex;
          width: 40px;
          height: 20px;
          justify-content: center;
          align-items: center;
          pointer-events: auto !important;
          background-color: #fb7299dd;
          color: white;
          border-radius: 10%;
          cursor: pointer;
          text-align: center;
      }

      .bilibili-blacklist-tname-group {
          display: flex;
          flex-direction: row;
          padding:0 5px;
          gap: 3px;
          align-items: center;
          margin-left: auto;
          max-width: 80%;
          pointer-events: none;
      }

      .bilibili-blacklist-tname {
          background-color: #fb7299dd;
          color: white;
          height: 20px;
          padding: 0 5px;
          border-radius: 10%;
          cursor: pointer;
          border-radius: 2px;
          pointer-events: auto;
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: center;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }


        /* 修复视频卡片布局 */
        .bili-video-card__cover {
            contain: layout !important;
        }
        /* 面板样式 */
        #bilibili-blacklist-manager-panel {
            font-size: 15px;
        }
        /* 按钮悬停效果 */
        #bilibili-blacklist-manager-panel button {
            transition: background-color 0.2s;
        }
        #bilibili-blacklist-manager-panel button:hover {
            opacity: 0.9;
        }
        /* 管理按钮悬停效果 */
        #bilibili-blacklist-manager-button:hover svg {
            transform: scale(1.1);
        }
        #bilibili-blacklist-manager-button svg {
            transition: transform 0.2s;
        }
        /* 输入框聚焦效果 */
        #"bilibili-blacklist-manager-panel input:focus {
            outline: none;
            border-color: #fb7299 !important;
        }
        /*灰度效果*/
        .bilibili-blacklist-grayscale {
           filter: grayscale(95%);
        }
    `);

  /**
   * 返回卡比图标的SVG代码。
   * @returns {string} SVG字符串。
   */
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

  /**
   * 为视频卡片添加卡比主题的覆盖层。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   */
  function addKirbyOverlayToCard(cardElement) {
    const kirbyWrapper = document.createElement("div");
    // 如果已经有Kirby覆盖层，则不重复添加
    if (cardElement.querySelector("#bilibili-blacklist-kirby") != null) return;
    kirbyWrapper.innerHTML = getKirbySVG();
    kirbyWrapper.id = "bilibili-blacklist-kirby";

    const justifyContent = isCurrentPageVideo() ? "flex-start" : "center";
    const alignItems = isCurrentPageVideo() ? "flex-start" : "center";
    Object.assign(kirbyWrapper.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      display: "flex",
      justifyContent: `${justifyContent}`,
      alignItems: `${alignItems}`,
      zIndex: "10",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      backdropFilter: "blur(5px)",
      WebkitBackdropFilter: "blur(5px)", // 兼容性
      borderRadius: "inherit",
      border: "1px solid rgba(255, 255, 255, 0.5)",
    });

    const svg = kirbyWrapper.querySelector("svg");
    if (svg) {
      const cardRect = cardElement.getBoundingClientRect();
      const size = Math.min(cardRect.width, cardRect.height) * 1.0;
      svg.setAttribute("width", `${size}px`);
      svg.setAttribute("height", `${size}px`);
      svg.setAttribute("bottom", `${cardRect.height - size}px`);
      svg.style.opacity = "0.15";
      svg.style.filter = "none";
      if (isCurrentPageVideo()) {
        svg.style.marginTop = "-10px"; // 视频播放页的微调
      } else {
        svg.style.marginTop = "-40px"; // 其他页面的微调
      }
    }

    // 确保卡片有position属性以便子元素绝对定位
    const cardStyle = getComputedStyle(cardElement);
    if (cardStyle.position === "static" || !cardStyle.position) {
      cardElement.style.position = "relative";
    }

    cardElement.appendChild(kirbyWrapper);
  }

  /**
   * 从视频卡片中移除卡比覆盖层。
   * @param {HTMLElement} cardElement - 视频卡片元素。
   */
  function removeKirbyOverlay(cardElement) {
    const kirbyWrapper = cardElement.querySelector("#bilibili-blacklist-kirby");
    if (kirbyWrapper) {
      kirbyWrapper.remove();
    }
  }
}