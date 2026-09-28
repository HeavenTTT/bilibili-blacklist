/*
 * 顶栏入口模块
 * -----------------------------------------------------------
 * B 站顶栏右侧的「卡比」入口按钮 + 油猴菜单（显示/隐藏按钮、打开管理面板）。
 *
 * 与时序相关的两个坑（都写在注释里，勿删）：
 *   - 视频页的 header 是 Vue 延迟渲染的：容器存在 ≠ 导航项渲染完成，
 *     过早插入会被整块重渲染顶掉 → 由 videoHeaderReady 闸门 + 重试轮询兜住；
 *   - 隐藏按钮必须「摘掉元素」而不是只改 display，否则存在性判断会让它再也回不来。
 */

/**
 * 解析右侧导航条的「导航项容器」。
 *
 * B 站顶栏改版后结构变为 `.right-entry > .right-entry__main > [导航项…]`：
 * `.right-entry` 仍在，但只剩外框，导航项搬进了 `.right-entry__main`。
 * 所以优先取新宿主；旧页面（A/B 未改版）再退回 `.right-entry`。
 * 返回 null 表示顶栏还没渲染出来。
 */
function resolveHeaderEntryHost() {
  return (
    document.querySelector(".right-entry__main") ||
    document.querySelector(".right-entry") ||
    null
  );
}

/**
 * 顶栏按钮挂载失败的自我重试（合并调度，幂等）。
 *
 * 只在「容器已出现但导航项还没渲染完」这一种情况下排一次重试。
 * 因为这种情况下 B 站**不一定会再触发 DOM 变更**，观察器的
 * `scheduleHeaderButtonRefresh()` 兜底可能等不到 mutation；只靠观察器
 * 会让按钮一直缺席。用 `waitForContainer` 轮询到导航项出现再挂。
 *
 * 刻意不在「容器还没出现」时排重试：那种情况观察器兜底会覆盖，
 * 而且视频页已有 5s 静默 + 等 `.right-entry`（最长 15s）+ 21s 强制启动那一套时序，
 * 再叠一层轮询只会加重 header 附近的渲染竞争。
 */
let headerButtonRetryScheduled = false;
function scheduleHeaderButtonRetry() {
  if (headerButtonRetryScheduled) return;
  headerButtonRetryScheduled = true;
  waitForContainer(".right-entry__main, .right-entry", () => {
    headerButtonRetryScheduled = false;
    addBlacklistManagerButton();
  }, 250, 15000);
}

/**
 * 将黑名单管理器按钮添加到右侧导航条。
 */
function addBlacklistManagerButton() {
  if (!globalPluginConfig.flagHeaderButton) return; // 油猴菜单可关闭顶部按钮
  // B 站顶栏改版后，导航项容器从 `.right-entry` 换成了 `.right-entry__main`
  // （`.right-entry` 只剩外框）。优先用新宿主，同时保留旧宿主兜底。
  const rightEntry = resolveHeaderEntryHost();
  if (!rightEntry) {
    console.warn("[🫥BlackList] 未找到右侧导航栏(.right-entry__main / .right-entry)");
    return;
  }
  // 幂等：已经挂过就直接返回，避免重复插入。
  if (rightEntry.querySelector("#bilibili-blacklist-manager-button")) return;
  // ⚠️ 视频页的 header 时序闸门（**有意设计，勿删**）。
  //
  // videoHeaderReady 由 pages.js 在「5s 静默 + 轮询到 .right-entry 出现」之后置为 true；
  // 在那之前，视频页的顶栏可能只是骨架，插进去的按钮会被随后的整块重渲染顶掉。
  // 关键点：这个闸门必须放在**这里面**，不能只在调用点判断 ——
  // 观察器的兜底重挂（scheduleHeaderButtonRefresh）也会调用本函数，
  // 而它的触发时机与 5s 静默期完全无关，光靠调用点过滤拦不住它。
  if (isCurrentPageVideo() && !videoHeaderReady) return;
  // 顶栏由 Vue 延迟渲染：容器存在 ≠ 导航项渲染完成，过早插入会被重渲染顶掉。
  // 注意**只等"有内容"**，不再用旧的「li 数量 > 6」经验值判断 —— 改版后导航项
  // 既不是 li、数量也变了，旧阈值会让本函数永远提前 return（按钮静默消失）。
  if (!rightEntry.querySelector("a, li, .right-entry__item")) {
    scheduleHeaderButtonRetry();
    return;
  }

  const listItem = document.createElement("li");
  listItem.id = "bilibili-blacklist-manager-button";
  listItem.className = "v-popover-wrap";

  const button = document.createElement("div");
  button.className = "right-entry-item";

  const icon = document.createElement("div");
  icon.className = "right-entry__outside";
  icon.innerHTML = getKirbySVG(); // 获取卡比SVG图标

  blockCountDisplayElement = document.createElement("span");
  blockCountDisplayElement.textContent = `0`;

  button.appendChild(icon);
  button.appendChild(blockCountDisplayElement);
  listItem.appendChild(button);

  // 将按钮插入到导航栏的特定位置（跟旧版一致：插到第 2 个导航项之前）
  if (rightEntry.children.length > 1) {
    rightEntry.insertBefore(listItem, rightEntry.children[1]);
  } else {
    rightEntry.appendChild(listItem);
  }

  // 点击按钮显示/隐藏管理面板
  listItem.addEventListener("click", () => {
    managerPanel.style.display =
      managerPanel.style.display === "flex" ? "none" : "flex";
  });
}

/**
 * 通过油猴菜单切换顶部管理按钮的显示/隐藏。
 *
 * ⚠️ 这里必须**双向**都生效，不能只写 style.display：
 * `addBlacklistManagerButton()` 的存在性判断用的是 `querySelector(...)`（只看"在不在 DOM 里"，
 * 不看是否被我隐藏），所以一旦按钮被 `display:none` 留在 DOM 里，它就会一直提前 return，
 * 那个元素将永远停在隐藏状态 —— 表现就是「菜单能关、但再也开不回来」。
 * 因此关闭时**把元素摘掉**，让后续 `addBlacklistManagerButton()` 能重新创建。
 * 注意：另一个调用点 `addBlacklistManagerButton()` 内部虽然也会读同一个标志，
 * 但它只负责「隐藏」，绝不能让它去移除元素，否则会被高频调用的兜底逻辑反复摘除/重建。
 */
function toggleHeaderButtonVisibility() {
  const btn = document.querySelector("#bilibili-blacklist-manager-button");
  if (globalPluginConfig.flagHeaderButton) {
    // 打开：元素在就显示（并清掉可能残留的行内 display），不在就补建一个。
    if (btn) {
      btn.style.display = "";
    } else {
      addBlacklistManagerButton();
    }
  } else if (btn) {
    // 关闭：连元素一起摘掉（只 display:none 的话就再也开不回来了，见上）。
    btn.remove();
  }
}

/**
 * 注册 Tampermonkey 菜单项（需 @grant GM_registerMenuCommand）。
 *
 * ⚠️ 这里的 console 输出是**排查用的一手证据，不要删**：
 * `GM_registerMenuCommand` 由油猴按脚本的 @grant 注入。1.2.4 只声明了 3 个 grant，
 * 2.0.0 才加入它 —— 而 Tampermonkey 在「脚本被更新」时**不会自动重新批准新增的 @grant**，
 * 表现就是菜单里既没有我们的项、页面上也毫无提示（旧实现在这里静默 return，
 * 完全无从判断）。所以缺授权时明确报出来，并给出可执行的解决办法。
 */
function initTampermonkeyMenu() {
  if (typeof GM_registerMenuCommand !== "function") {
    console.warn(
      "[🫥BlackList] 当前未获得 GM_registerMenuCommand 授权，油猴菜单里的" +
        "「显示/隐藏顶部管理按钮」「打开黑名单管理面板」不会出现。" +
        "这是油猴在脚本更新后没有重新批准新增 @grant 导致的（不是脚本错误）：" +
        "请在 Tampermonkey 里删除本脚本后重新安装一次（或在该脚本的设置里重新确认权限）。"
    );
    return;
  }
  GM_registerMenuCommand("显示/隐藏顶部管理按钮", () => {
    globalPluginConfig.flagHeaderButton = !globalPluginConfig.flagHeaderButton;
    saveGlobalConfigToStorage();
    toggleHeaderButtonVisibility();
  });
  GM_registerMenuCommand("打开黑名单管理面板", () => {
    // 按需创建：面板通常在 initializeScript() 里就建好了，但「不支持的页面」
    // （如 /bangumi/、/account/*）会在那之前就 return，此时 managerPanel 还是
    // undefined —— 旧写法会让这个菜单项**静默什么都不做**。这里补建一次，
    // 让菜单在任何页面上都能打开面板（createBlacklistPanel 自身幂等）。
    if (!managerPanel) createBlacklistPanel();
    if (managerPanel) managerPanel.style.display = "flex";
  });
  blInfo(
    "[🫥BlackList] 已注册油猴菜单：显示/隐藏顶部管理按钮、打开黑名单管理面板"
  );
}
