#!/usr/bin/env node
'use strict';

/*
 * 构建产物冒烟检查（零依赖，无需浏览器 / jsdom）
 * ===========================================================
 * 本仓库的构建方式是「多个 src 模块按配置顺序拼进同一个 IIFE、共享全局作用域」，
 * 因此最容易出错的地方不是语法，而是：
 *   - 模块求值顺序（TDZ：`const` 在定义前被另一个模块在求值期读到）；
 *   - 文件拆分/搬运时的漏搬、重搬（同一个函数被搬了两份，后者静默覆盖前者）；
 *   - 顶层代码引用了未定义的标识符。
 *
 * DOM 桩与 GM_* 沙箱在 scripts/lib/harness.js，每个场景一套隔离实例：
 *
 *   1. 主页场景：整包 eval 不抛错（语法 + 求值顺序 + 顶层标识符）；
 *   2. 顶层声明唯一（扫描产物里重复的 function/let/const/var）；
 *   3. 初始化路径：触发 DOMContentLoaded → initializeScript → 观察器 / 面板 /
 *      黑名单列表 / 设置页 / 延迟补扫，并断言面板结构；
 *   4. **空间页场景（回归保护）**：被屏蔽 UP 的空间页必须给 document.body 加整页灰度，
 *      且灰度规则真的存在于注入样式里；未命中黑名单时不得加。
 *      该行为 2.0.1 被整块删除过（见 CHANGELOG 的 [2.0.2] 条目），这里用机器断言钉住，
 *      避免下次又只凭「会误伤收藏夹」的理由把它删掉。
 *   5. **面板半透明滤镜场景**：默认关闭（面板无玻璃类、内联 --…-opacity: 1 /
 *      --…-blur: 0.01px）→ 点开关生效（类 + 变量 = panelGlassOpacity / 8px）→
 *      拖动滑块 input 实时改 opacity → change 落盘 → 再点关闭回到 1 / 0.01px；
 *      并断言注入 CSS 里面板规则只引用 CSS 变量、不再有常开的 opacity: 0.85。
 *   6. **滤镜配置归一化回归**：预置 GM 存储 panelGlassOpacity = 99 / 0.0001，
 *      加载后必须 clamp 到 1 / 0.2（走 harness 的 gmStore 选项）。
 *
 * 不覆盖：真实选择器、接口请求、视觉与屏蔽行为（那些需要浏览器）。
 * 用法：npm run build && npm run check
 *       node scripts/check-bundle.js --dev                # 检查 dev 产物
 *       node scripts/check-bundle.js --bundle <path>      # 检查指定的 .user.js
 */
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./lib/harness');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8')
);
const src = config.src || {};
const outputDir = src.outputDir || 'dist';
const outputBase = process.argv.includes('--dev')
  ? src.devOutputBase || 'bilibili-blacklist.dev.user.js'
  : src.outputBase || 'bilibili-blacklist.user.js';
// --bundle <path>：显式指定要检查的产物（相对仓库根解析），用于对比历史产物。
const bundleFlagAt = process.argv.indexOf('--bundle');
const explicitBundle = bundleFlagAt !== -1 ? process.argv[bundleFlagAt + 1] : null;
if (bundleFlagAt !== -1 && !explicitBundle) {
  console.error('[check] --bundle 后面要跟产物路径');
  process.exit(1);
}
const bundlePath = explicitBundle
  ? path.resolve(ROOT, explicitBundle)
  : path.join(ROOT, outputDir, outputBase);

if (!fs.existsSync(bundlePath)) {
  console.error('[check] 找不到构建产物：' + bundlePath + '\n        请先运行 npm run build');
  process.exit(1);
}
const code = fs.readFileSync(bundlePath, 'utf8');
const bundleName = path.basename(bundlePath);

/* ============================== 检查项 ============================== */

const failures = [];
const notes = [];
function check(name, ok, detail) {
  if (ok) notes.push('PASS ' + name);
  else failures.push('FAIL ' + name + (detail === undefined ? '' : ' -> ' + detail));
}

/** 灰度规则：selector 与 filter 必须落在**同一条规则**里，不能只是注释里出现过。 */
const GRAYSCALE_RULE_RE = /\.bilibili-blacklist-grayscale\s*\{[^}]*filter\s*:\s*grayscale\(\s*95%\s*\)/;

/* ============ 面板半透明滤镜（task-1 契约）的定位 / 读取辅助 ============ */

const PANEL_ID = 'bilibili-blacklist-manager-panel';
const GLASS_CLASS = 'bilibili-blacklist-panel-glass';
const VAR_OPACITY = '--bilibili-blacklist-panel-opacity';
const VAR_BLUR = '--bilibili-blacklist-panel-blur';
const RANGE_CLASS = 'bilibili-blacklist-panel-opacity-range';
const VALUE_CLASS = 'bilibili-blacklist-panel-opacity-value';
const GLASS_LABEL = '面板半透明滤镜';

/** 找出注入 CSS 里**选择器精确等于 selector** 的全部规则声明块（CSS 已先去注释）。
 *  精确 = 整条选择器就是它：`#id { … }` 匹配，`#id h3 { … }` / `#id button:hover { … }` 不匹配。
 *  边界用「事后校验前一个非空白字符」而不是把 `}`/`;` 写进正则：写成 `(?:^|[};])` 时，
 *  带 g 标志的 exec 会把分界符吃掉，**连续两条同选择器规则**只会被找到第一条。
 *  返回空数组表示该规则不存在。 */
function extractRuleBlocks(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g');
  const blocks = [];
  let m;
  while ((m = re.exec(css)) !== null) {
    const before = css.slice(0, m.index).replace(/\s+$/, '');
    const prev = before.slice(-1);
    // 选择器前面（跳过空白）只能是行首 / 上一条规则的 } / 规则块的起点
    if (prev === '' || prev === '{' || prev === '}' || prev === ';') blocks.push(m[1]);
  }
  return blocks;
}

/** 读元素上的内联 CSS 变量的值；没设置时返回 null（把「没设置」和「设成了字符串 undefined」区分开）。 */
function styleVar(el, name) {
  if (!el || !el.style) return null;
  const raw =
    el.style[name] !== undefined
      ? el.style[name]
      : typeof el.style.getPropertyValue === 'function'
        ? el.style.getPropertyValue(name)
        : undefined;
  return raw === undefined || raw === null ? null : String(raw);
}

/** 最后一个带某 class 的已创建元素：设置页若重渲染，最新那个才是「活」元素。 */
function lastByClass(h, name) {
  const list = h.CREATED.filter((el) => el.classList.contains(name));
  return list[list.length - 1] || null;
}

/** disabled 的两种写法（property / attribute）都算禁用。 */
function isDisabled(el) {
  return !!el && (el.disabled === true || el.hasAttribute('disabled'));
}

/** classList 安全读：元素不存在时返回 false，让断言脚本本身不抛异常（缺元素 = 该条 FAIL）。 */
function hasClass(el, name) {
  return !!el && el.classList.contains(name);
}

/** classList 文本，用于断言 detail 里给证据。 */
function classOf(el) {
  return el ? el.classList.toString() : '(元素未创建)';
}

/** 「面板半透明滤镜」开关按钮：优先按「设置行里的 label 文案 + 行内 button」定位，
 *  退化为按按钮自身文案定位（实现方式不同也能找到）。 */
function findGlassToggleButton(h) {
  const rows = h.CREATED.filter((el) =>
    el.classList.contains('bilibili-blacklist-setting-toggle')
  );
  for (const row of rows) {
    const hasLabel = row.children.some(
      (child) => String(child.textContent).indexOf(GLASS_LABEL) !== -1
    );
    if (!hasLabel) continue;
    const button = row.children.filter((child) => child.tagName === 'BUTTON')[0];
    if (button) return button;
  }
  const buttons = h.CREATED.filter(
    (el) =>
      el.tagName === 'BUTTON' && String(el.textContent).indexOf(GLASS_LABEL) !== -1
  );
  return buttons[buttons.length - 1] || null;
}

/** 透明度滑块所在行的「重置」按钮：优先该行内的 button 子元素，退化按文案「重置/恢复默认」找。
 *  文案契约未规定，所以只用来做 disabled 联动断言；找不到时由调用方给出明确证据。 */
function findOpacityResetButton(h, range) {
  const row = range && range.parentElement;
  if (row) {
    const buttons = row.children.filter((child) => child.tagName === 'BUTTON');
    if (buttons.length) return buttons[buttons.length - 1];
  }
  const named = h.CREATED.filter(
    (el) =>
      el.tagName === 'BUTTON' && /重置|恢复默认/.test(String(el.textContent))
  );
  return named[named.length - 1] || null;
}

/** 点一下按钮但不让异常炸掉整个检查脚本；返回错误或 null。 */
function clickSafely(el) {
  try {
    el.click();
    return null;
  } catch (error) {
    return error;
  }
}

/** 派发事件（桩里事件就是普通对象，带上 target 以便监听器读 e.target.value）。 */
function dispatchSafely(el, type) {
  try {
    el.dispatchEvent({
      type,
      target: el,
      preventDefault() {},
      stopPropagation() {},
    });
    return null;
  } catch (error) {
    return error;
  }
}

/* 1) 顶层声明唯一：文件拆分后最容易出现"同一函数被搬了两份" */
function checkDuplicateDeclarations() {
  const seen = new Map();
  const duplicates = [];
  const lines = code.split('\n');
  const re = /^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:let|const|var)\s+([A-Za-z_$][\w$]*))/;
  lines.forEach((line, index) => {
    const m = re.exec(line);
    const name = m && (m[1] || m[2]);
    if (!name) return;
    if (seen.has(name)) duplicates.push(name + ' (行 ' + seen.get(name) + ' 与 ' + (index + 1) + ')');
    else seen.set(name, index + 1);
  });
  check('产物顶层声明无重复', duplicates.length === 0, duplicates.join('; '));
  check('顶层声明数量合理（> 120）', seen.size > 120, String(seen.size));
}

/* 2) 主页场景：整包求值 + 初始化到面板建成 */
async function runMainPageScenario() {
  const h = createHarness({
    location: { hostname: 'www.bilibili.com', pathname: '/', hash: '', search: '', href: 'https://www.bilibili.com/' },
  });

  const evalError = h.evaluate(code, bundleName);
  check('产物可整包求值（无语法/求值顺序错误）', !evalError, evalError && evalError.stack);
  check(
    '主样式已注入',
    h.styles.length >= 2 && h.styles[0].length > 5000,
    'styles=' + h.styles.length + ' len0=' + (h.styles[0] || '').length
  );
  if (evalError) return h;

  check('已注册 DOMContentLoaded 监听', h.domContentLoadedListenerCount() === 1, String(h.domContentLoadedListenerCount()));
  const initError = h.init();
  check('initializeScript 不抛异常', !initError, initError && initError.stack);
  // 主页会在 800ms 后补扫一次，等它跑完（同时覆盖 scanAndBlockVideoCards 路径）
  await new Promise((resolve) => setTimeout(resolve, 1000));

  check(
    '管理面板已创建',
    h.CREATED.filter((el) => el.id === 'bilibili-blacklist-manager-panel').length === 1,
    String(h.CREATED.filter((el) => el.id === 'bilibili-blacklist-manager-panel').length)
  );
  check('面板页签 5 个', h.countByClass('bilibili-blacklist-tab') === 5, String(h.countByClass('bilibili-blacklist-tab')));
  // 6 屏蔽类型 + 6 网络与请求 + 6 累计与趋势 = 18 行（与 dev 自检同口径）
  check('统计明细 18 行', h.countByClass('bilibili-blacklist-stat-row') === 18, String(h.countByClass('bilibili-blacklist-stat-row')));
  check('趋势柱 7 根', h.countByClass('bilibili-blacklist-trend-bar') === 7, String(h.countByClass('bilibili-blacklist-trend-bar')));
  check('设置行已渲染', h.countByClass('bilibili-blacklist-panel-row') >= 12, String(h.countByClass('bilibili-blacklist-panel-row')));
  check('设置控件已渲染', h.countByClass('bilibili-blacklist-config-btn') >= 10, String(h.countByClass('bilibili-blacklist-config-btn')));
  return h;
}

/**
 * 3) 空间页场景：被屏蔽 UP → 整页灰度；未命中 → 不加。
 *
 * 「原神」在 storage.js 的默认精确黑名单里，直接用它当被屏蔽的 UP 名，
 * 不需要预置 GM 存储。
 */
function runSpacePageScenario() {
  const h = createHarness({
    location: { hostname: 'space.bilibili.com', pathname: '/123456', hash: '', search: '', href: 'https://space.bilibili.com/123456' },
    upNameText: '原神',
  });

  const evalError = h.evaluate(code, bundleName + ' [space]');
  check('空间页场景：产物可整包求值', !evalError, evalError && evalError.stack);
  if (evalError) return;

  const initError = h.init();
  check('空间页场景：initializeScript 不抛异常', !initError, initError && initError.stack);

  const bodyHasClass = () => h.document.body.classList.contains('bilibili-blacklist-grayscale');

  check(
    '空间页：命中黑名单的 UP 给 document.body 加整页灰度类',
    bodyHasClass(),
    'document.body classList = "' + h.document.body.classList.toString() + '"'
  );

  // 断言的是**注入样式去掉注释后**的文本：只描述该规则的注释不算数
  check(
    '空间页：.bilibili-blacklist-grayscale 灰度规则真实存在于注入样式（非注释）',
    GRAYSCALE_RULE_RE.test(h.injectedCssWithoutComments()),
    '注入样式 ' + h.styles.length + ' 段，剔除注释后未匹配到该规则'
  );

  const button = h.findByClass('bilibili-blacklist-up-block-btn');
  check('空间页：UP 名旁生成了屏蔽按钮', !!button);
  if (!button) return;

  button.click(); // 已屏蔽 → 点击即取消屏蔽
  check(
    '空间页：取消屏蔽后整页灰度类被移除',
    !bodyHasClass(),
    'document.body classList = "' + h.document.body.classList.toString() + '"'
  );

  button.click(); // 重新加入黑名单
  check(
    '空间页：重新屏蔽后整页灰度类恢复',
    bodyHasClass(),
    'document.body classList = "' + h.document.body.classList.toString() + '"'
  );
}

/** 反向场景：没被屏蔽的 UP 不得让整页变灰。 */
function runSpacePageNotBlockedScenario() {
  const h = createHarness({
    location: { hostname: 'space.bilibili.com', pathname: '/999999', hash: '', search: '', href: 'https://space.bilibili.com/999999' },
    upNameText: '这个UP主没被屏蔽',
  });

  const evalError = h.evaluate(code, bundleName + ' [space/clean]');
  check('空间页反向场景：产物可整包求值', !evalError, evalError && evalError.stack);
  if (evalError) return;

  const initError = h.init();
  check('空间页反向场景：initializeScript 不抛异常', !initError, initError && initError.stack);
  check(
    '空间页：未命中黑名单的 UP 不会给整页加灰度',
    !h.document.body.classList.contains('bilibili-blacklist-grayscale'),
    'document.body classList = "' + h.document.body.classList.toString() + '"'
  );
}

/* ========== 4/5) 面板半透明滤镜：默认关闭 + 开关 + 可拖动滑块 + 归一化 ========== */

const MAIN_PAGE_LOCATION = {
  hostname: 'www.bilibili.com',
  pathname: '/',
  hash: '',
  search: '',
  href: 'https://www.bilibili.com/',
};

/* 契约（task-1）里逐字规定的三条面板声明：变量引用 + !important 都必须落在**同一条**面板规则里。
   前导边界用 (?:^|[;{\s]) 而不是裸匹配，避免 `-webkit-backdrop-filter` 冒充 `backdrop-filter`。 */
const PANEL_OPACITY_DECL_RE =
  /(?:^|[;{\s])opacity\s*:\s*var\(\s*--bilibili-blacklist-panel-opacity\s*,\s*1\s*\)\s*!important/;
const PANEL_BLUR_DECL_RE =
  /(?:^|[;{\s])backdrop-filter\s*:\s*blur\(\s*var\(\s*--bilibili-blacklist-panel-blur\s*,\s*0\.01px\s*\)\s*\)\s*!important/;
const PANEL_WEBKIT_BLUR_DECL_RE =
  /(?:^|[;{\s])-webkit-backdrop-filter\s*:\s*blur\(\s*var\(\s*--bilibili-blacklist-panel-blur\s*,\s*0\.01px\s*\)\s*\)\s*!important/;
/* 负向：面板规则里不得再出现常开的裸透明度（前导边界避免命中 `--…-panel-opacity: 0.85`）。 */
const PANEL_BARE_OPACITY_RE = /(?:^|[;{\s])opacity\s*:\s*0\.85\b/;
const GLASS_OPACITY_VAR_RE = /--bilibili-blacklist-panel-opacity\s*:\s*0\.85\b/;
const GLASS_BLUR_VAR_RE = /--bilibili-blacklist-panel-blur\s*:\s*8px\b/;

/**
 * 4) 面板半透明滤镜场景（契约见 task-1）：
 *    a. 默认（空存储）→ 关闭态：无玻璃类、内联 --…-opacity = 1、--…-blur = 0.01px；
 *    b. 注入 CSS：面板规则只引用 CSS 变量、玻璃类规则存在、不再有裸的 opacity: 0.85；
 *    c. 配置页控件：range 的 min/max/step/初始值 + 百分比文案 + 关闭态 disabled；
 *    d. 交互：点开关生效 → 拖滑块 input 实时生效 → change 落盘 → 再点关闭回到关闭态。
 */
function runPanelGlassScenario() {
  const h = createHarness({ location: MAIN_PAGE_LOCATION });

  const evalError = h.evaluate(code, bundleName + ' [panel-glass]');
  check('半透明滤镜：产物可整包求值', !evalError, evalError && evalError.stack);
  if (evalError) return;

  const initError = h.init();
  check('半透明滤镜：initializeScript 不抛异常', !initError, initError && initError.stack);

  const panels = h.CREATED.filter((el) => el.id === PANEL_ID);
  check('半透明滤镜：管理面板唯一', panels.length === 1, 'count=' + panels.length);
  const panel = panels[0] || null;

  /* ---------- a. 默认关闭 ---------- */
  check(
    '滤镜默认关闭：面板无 ' + GLASS_CLASS + ' 类',
    !hasClass(panel, GLASS_CLASS),
    'panel.classList = "' + classOf(panel) + '"'
  );
  check(
    '滤镜默认关闭：内联 ' + VAR_OPACITY + ' = "1"',
    styleVar(panel, VAR_OPACITY) === '1',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_OPACITY)) + '（期望 "1"）'
  );
  check(
    '滤镜默认关闭：内联 ' + VAR_BLUR + ' = "0.01px"',
    styleVar(panel, VAR_BLUR) === '0.01px',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_BLUR)) + '（期望 "0.01px"）'
  );

  /* ---------- b. 注入 CSS（去注释；规则内匹配，不吃注释） ---------- */
  const css = h.injectedCssWithoutComments();
  const panelBlocks = extractRuleBlocks(css, '#' + PANEL_ID);
  const panelEvidence = panelBlocks
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .join(' || ')
    .slice(0, 400);
  check(
    'CSS：存在 #' + PANEL_ID + ' 规则（非注释）',
    panelBlocks.length >= 1,
    '注入样式 ' + h.styles.length + ' 段，去注释后未匹配到该规则'
  );
  check(
    'CSS：面板规则同条内含 opacity: var(--…-opacity, 1) !important 与 backdrop-filter/-webkit-: blur(var(--…-blur, 0.01px)) !important',
    panelBlocks.some(
      (b) =>
        PANEL_OPACITY_DECL_RE.test(b) &&
        PANEL_BLUR_DECL_RE.test(b) &&
        PANEL_WEBKIT_BLUR_DECL_RE.test(b)
    ),
    '面板规则声明块 = ' + panelEvidence
  );
  check(
    'CSS：面板规则不再有常开的裸 opacity: 0.85',
    panelBlocks.length >= 1 && panelBlocks.every((b) => !PANEL_BARE_OPACITY_RE.test(b)),
    '面板规则声明块 = ' + panelEvidence
  );
  check(
    'CSS：面板规则仍保留 background-color: var(--bg1, #fff)',
    panelBlocks.some((b) =>
      /background-color\s*:\s*var\(\s*--bg1\s*,\s*#fff\s*\)/.test(b)
    ),
    '面板规则声明块 = ' + panelEvidence
  );
  const glassBlocks = extractRuleBlocks(css, '.' + GLASS_CLASS);
  check('CSS：.' + GLASS_CLASS + ' 规则存在（非注释）', glassBlocks.length >= 1, '去注释后未找到该规则');
  check(
    'CSS：玻璃类规则同时设 ' + VAR_OPACITY + ': 0.85 与 ' + VAR_BLUR + ': 8px',
    glassBlocks.some((b) => GLASS_OPACITY_VAR_RE.test(b) && GLASS_BLUR_VAR_RE.test(b)),
    '玻璃类声明块 = ' +
      glassBlocks
        .map((b) => b.replace(/\s+/g, ' ').trim())
        .join(' || ')
        .slice(0, 300)
  );

  /* ---------- c. 配置页控件（点开关之前，必须看到「初始」状态） ---------- */
  const range0 = lastByClass(h, RANGE_CLASS);
  check(
    '配置页：存在透明度滑块（.' + RANGE_CLASS + '）',
    !!range0 && range0.tagName === 'INPUT',
    range0 ? 'tagName=' + range0.tagName : '未找到'
  );
  check('配置页：滑块 type = "range"', !!range0 && String(range0.type) === 'range', 'type=' + JSON.stringify(range0 && range0.type));
  check('配置页：滑块 min = "0.2"（来自 SETTING_CONSTRAINTS）', !!range0 && String(range0.min) === '0.2', 'min=' + JSON.stringify(range0 && range0.min));
  check('配置页：滑块 max = "1"', !!range0 && String(range0.max) === '1', 'max=' + JSON.stringify(range0 && range0.max));
  check('配置页：滑块 step = "0.05"', !!range0 && String(range0.step) === '0.05', 'step=' + JSON.stringify(range0 && range0.step));
  check('配置页：滑块初始 value = "0.85"', !!range0 && String(range0.value) === '0.85', 'value=' + JSON.stringify(range0 && range0.value));
  check(
    '配置页：默认关闭时滑块 disabled',
    isDisabled(range0),
    range0
      ? 'disabled=' + String(range0.disabled) + ' attr=' + String(range0.getAttribute('disabled'))
      : '未找到滑块'
  );
  const percent0 = lastByClass(h, VALUE_CLASS);
  check(
    '配置页：存在百分比显示元素（.' + VALUE_CLASS + '）',
    !!percent0,
    percent0 ? 'textContent=' + JSON.stringify(percent0.textContent) : '未找到'
  );
  check(
    '配置页：百分比初始为 "85%"',
    !!percent0 && String(percent0.textContent).trim() === '85%',
    'textContent=' + JSON.stringify(percent0 && percent0.textContent)
  );
  const reset0 = findOpacityResetButton(h, range0);
  check(
    '配置页：默认关闭时重置按钮 disabled',
    isDisabled(reset0),
    reset0
      ? 'textContent=' + JSON.stringify(reset0.textContent) + ' disabled=' + String(reset0.disabled)
      : '未找到重置按钮'
  );
  const toggle = findGlassToggleButton(h);
  check(
    '配置页：存在「' + GLASS_LABEL + '」开关按钮',
    !!toggle,
    toggle ? 'classList="' + toggle.classList.toString() + '"' : '未找到'
  );
  check(
    '配置页：开关按钮带 bilibili-blacklist-config-btn 类',
    !!toggle && toggle.classList.contains('bilibili-blacklist-config-btn'),
    'classList="' + classOf(toggle) + '"'
  );

  /* ---------- d. 交互：开关 → 拖动 → 松手落盘 → 再关闭 ----------
     注意：这里**不做提前 return**。控件缺失时后续断言必须照样跑并 FAIL，
     否则「找不到元素」会变成静默跳过，检查项数量随实现变化，等于放水。 */
  const clickError = toggle ? clickSafely(toggle) : null;
  check(
    '交互：点击开关（开启）不抛异常',
    !!toggle && !clickError,
    toggle ? clickError && clickError.stack : '未找到开关按钮（无法点击）'
  );
  check(
    '交互：开启后面板获得玻璃类',
    hasClass(panel, GLASS_CLASS),
    'panel.classList = "' + classOf(panel) + '"'
  );
  check(
    '交互：开启后 ' + VAR_OPACITY + ' = "0.85"（= panelGlassOpacity 默认值）',
    styleVar(panel, VAR_OPACITY) === '0.85',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_OPACITY))
  );
  check(
    '交互：开启后 ' + VAR_BLUR + ' = "8px"',
    styleVar(panel, VAR_BLUR) === '8px',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_BLUR))
  );

  const rangeOn = lastByClass(h, RANGE_CLASS);
  check(
    '交互：开启后滑块可用（disabled 解除）',
    !!rangeOn && !isDisabled(rangeOn),
    rangeOn ? 'disabled=' + String(rangeOn.disabled) : '滑块丢失'
  );
  const resetOn = findOpacityResetButton(h, rangeOn);
  check(
    '交互：开启后重置按钮可用（disabled 解除）',
    !!resetOn && !isDisabled(resetOn),
    resetOn ? 'disabled=' + String(resetOn.disabled) : '未找到重置按钮'
  );

  if (rangeOn) rangeOn.value = '0.4';
  const inputError = rangeOn ? dispatchSafely(rangeOn, 'input') : null;
  check(
    '交互：派发 input 事件不抛异常',
    !!rangeOn && !inputError,
    rangeOn ? inputError && inputError.stack : '滑块丢失（未派发）'
  );
  check(
    '交互：拖动（input）后面板 ' + VAR_OPACITY + ' 实时变 "0.4"',
    styleVar(panel, VAR_OPACITY) === '0.4',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_OPACITY))
  );
  const percentLive = lastByClass(h, VALUE_CLASS);
  check(
    '交互：拖动后百分比显示 "40%"',
    !!percentLive && String(percentLive.textContent).trim() === '40%',
    'textContent=' + JSON.stringify(percentLive && percentLive.textContent)
  );

  const changeError = rangeOn ? dispatchSafely(rangeOn, 'change') : null;
  check(
    '交互：派发 change 事件不抛异常',
    !!rangeOn && !changeError,
    rangeOn ? changeError && changeError.stack : '滑块丢失（未派发）'
  );
  const stored = h.getGmValue('globalConfig');
  check(
    '交互：松手（change）后 globalConfig.panelGlassOpacity 落盘 = 0.4',
    !!stored && stored.panelGlassOpacity === 0.4,
    '实际 = ' + (stored ? JSON.stringify(stored.panelGlassOpacity) : '(globalConfig 未落盘)')
  );
  check(
    '交互：松手后 globalConfig.flagPanelGlass 落盘 = true',
    !!stored && stored.flagPanelGlass === true,
    '实际 = ' + (stored ? JSON.stringify(stored.flagPanelGlass) : '(globalConfig 未落盘)')
  );

  /* harness 护栏：getGmValue 必须给副本，否则测试改一下就读脏了插件内部状态 */
  const clone = h.getGmValue('globalConfig');
  if (clone && typeof clone === 'object') clone.panelGlassOpacity = 12345;
  const cloneAgain = h.getGmValue('globalConfig');
  check(
    'harness：getGmValue 返回副本（改副本不影响存储）',
    !!cloneAgain && cloneAgain.panelGlassOpacity === 0.4,
    '再次读取 = ' + (cloneAgain ? JSON.stringify(cloneAgain.panelGlassOpacity) : '(空)')
  );

  const toggle2 = findGlassToggleButton(h) || toggle;
  const clickError2 = toggle2 ? clickSafely(toggle2) : null;
  check(
    '交互：再点开关（关闭）不抛异常',
    !!toggle2 && !clickError2,
    toggle2 ? clickError2 && clickError2.stack : '未找到开关按钮（无法点击）'
  );
  check(
    '交互：关闭后玻璃类被移除',
    !hasClass(panel, GLASS_CLASS),
    'panel.classList = "' + classOf(panel) + '"'
  );
  check(
    '交互：关闭后 ' + VAR_OPACITY + ' 回到 "1"',
    styleVar(panel, VAR_OPACITY) === '1',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_OPACITY))
  );
  check(
    '交互：关闭后 ' + VAR_BLUR + ' 回到 "0.01px"',
    styleVar(panel, VAR_BLUR) === '0.01px',
    '实际 = ' + JSON.stringify(styleVar(panel, VAR_BLUR))
  );
  const storedOff = h.getGmValue('globalConfig');
  check(
    '交互：关闭同样落盘 globalConfig.flagPanelGlass = false',
    !!storedOff && storedOff.flagPanelGlass === false,
    '实际 = ' + (storedOff ? JSON.stringify(storedOff.flagPanelGlass) : '(globalConfig 未落盘)')
  );
  const rangeOff = lastByClass(h, RANGE_CLASS);
  check(
    '交互：关闭后滑块重新 disabled',
    isDisabled(rangeOff),
    rangeOff ? 'disabled=' + String(rangeOff.disabled) : '滑块丢失'
  );
  const resetOff = findOpacityResetButton(h, rangeOff);
  check(
    '交互：关闭后重置按钮重新 disabled',
    isDisabled(resetOff),
    resetOff ? 'disabled=' + String(resetOff.disabled) : '未找到重置按钮'
  );
}

/**
 * 5) 滤镜配置归一化回归：预置 GM 存储里的越界值必须在加载时被 clamp。
 *    - panelGlassOpacity: 99     → clamp 到 max = 1（开启态下直接读面板 opacity 变量）；
 *    - panelGlassOpacity: 0.0001 → clamp 到 min = 0.2（关闭态下面板变量被强制为 1，
 *      所以从配置页滑块的 value / 百分比文案上读 clamp 结果）。
 */
function runPanelGlassNormalizationScenario() {
  /* ---- 上界 ---- */
  const seedMax = { globalConfig: { panelGlassOpacity: 99, flagPanelGlass: true } };
  const hMax = createHarness({ location: MAIN_PAGE_LOCATION, gmStore: seedMax });
  const evalErrorMax = hMax.evaluate(code, bundleName + ' [panel-glass/clamp-max]');
  check('归一化(max)：产物可整包求值', !evalErrorMax, evalErrorMax && evalErrorMax.stack);
  if (!evalErrorMax) {
    const initErrorMax = hMax.init();
    check('归一化(max)：initializeScript 不抛异常', !initErrorMax, initErrorMax && initErrorMax.stack);
    const panelMax = hMax.CREATED.filter((el) => el.id === PANEL_ID)[0] || null;
    check(
      '归一化(max)：flagPanelGlass=true → 面板有玻璃类',
      !!panelMax && panelMax.classList.contains(GLASS_CLASS),
      panelMax ? 'classList="' + panelMax.classList.toString() + '"' : '未创建面板'
    );
    check(
      '归一化(max)：panelGlassOpacity=99 加载后 clamp 到 1（面板 opacity 变量 = "1"）',
      styleVar(panelMax, VAR_OPACITY) === '1',
      '实际 = ' + JSON.stringify(styleVar(panelMax, VAR_OPACITY)) + '（期望 "1"）'
    );
  }
  check(
    '归一化(max)：harness 对预置 gmStore 做了浅拷贝（沙箱 store ≠ 调用方对象）',
    hMax.gmStore !== seedMax,
    hMax.gmStore === seedMax
      ? '同一个对象引用：GM_setValue 会直接写回调用方数据'
      : '不同对象（ok）'
  );
  // 触发一次真实落盘（点一下滤镜开关 → saveGlobalConfigToStorage）再复查：
  // 若上面是同一个对象，调用方的 globalConfig 会被换成插件内部的归一化对象（99 → clamp 成 1），
  // 这条断言就会抓到「污染调用方」。没有这次写操作，光比 key 名是抓不到污染的（恒真）。
  const toggleClamp = findGlassToggleButton(hMax);
  if (toggleClamp) clickSafely(toggleClamp);
  check(
    '归一化(max)：落盘只写沙箱副本，调用方 seed.globalConfig 未被替换（仍是 99）',
    seedMax.globalConfig.panelGlassOpacity === 99,
    'seed.globalConfig.panelGlassOpacity = ' +
      JSON.stringify(seedMax.globalConfig.panelGlassOpacity) +
      (toggleClamp ? '' : '（未找到开关，未触发落盘）')
  );
  check(
    '归一化(max)：沙箱 store 的 key 集合不变（没有被写进别的 key）',
    Object.keys(seedMax).join(',') === 'globalConfig',
    'seed keys = ' + Object.keys(seedMax).join(',') + '; 沙箱 store keys = ' + Object.keys(hMax.gmStore).join(',')
  );

  /* ---- 下界 ---- */
  const seedMin = { globalConfig: { panelGlassOpacity: 0.0001 } };
  const hMin = createHarness({ location: MAIN_PAGE_LOCATION, gmStore: seedMin });
  const evalErrorMin = hMin.evaluate(code, bundleName + ' [panel-glass/clamp-min]');
  check('归一化(min)：产物可整包求值', !evalErrorMin, evalErrorMin && evalErrorMin.stack);
  if (evalErrorMin) return;

  const initErrorMin = hMin.init();
  check('归一化(min)：initializeScript 不抛异常', !initErrorMin, initErrorMin && initErrorMin.stack);
  const panelMin = hMin.CREATED.filter((el) => el.id === PANEL_ID)[0] || null;
  check(
    '归一化(min)：flagPanelGlass 缺省 false → 面板仍无玻璃类',
    !!panelMin && !panelMin.classList.contains(GLASS_CLASS),
    panelMin ? 'classList="' + panelMin.classList.toString() + '"' : '未创建面板'
  );
  const rangeMin = lastByClass(hMin, RANGE_CLASS);
  check(
    '归一化(min)：panelGlassOpacity=0.0001 加载后 clamp 到 0.2（滑块 value = "0.2"）',
    !!rangeMin && String(rangeMin.value) === '0.2',
    '实际 value = ' + JSON.stringify(rangeMin && rangeMin.value) + '（期望 "0.2"）'
  );
  const percentMin = lastByClass(hMin, VALUE_CLASS);
  check(
    '归一化(min)：百分比显示 "20%"',
    !!percentMin && String(percentMin.textContent).trim() === '20%',
    'textContent=' + JSON.stringify(percentMin && percentMin.textContent)
  );
  // 同上：先触发一次真实落盘（点开关 → saveGlobalConfigToStorage），再验证调用方对象没被写回
  const toggleMin = findGlassToggleButton(hMin);
  if (toggleMin) clickSafely(toggleMin);
  check(
    '归一化(min)：harness 对预置 gmStore 做了浅拷贝（沙箱 store ≠ 调用方对象）',
    hMin.gmStore !== seedMin,
    hMin.gmStore === seedMin
      ? '同一个对象引用：GM_setValue 会直接写回调用方数据'
      : '不同对象（ok）'
  );
  check(
    '归一化(min)：落盘只写沙箱副本，调用方 seed.globalConfig 未被替换（仍是 0.0001）',
    seedMin.globalConfig.panelGlassOpacity === 0.0001,
    'seed.globalConfig.panelGlassOpacity = ' +
      JSON.stringify(seedMin.globalConfig.panelGlassOpacity) +
      (toggleMin ? '' : '（未找到开关，未触发落盘）')
  );
}

/* ============================== 执行 ============================== */

(async () => {
  checkDuplicateDeclarations();
  const main = await runMainPageScenario();
  runSpacePageScenario();
  runSpacePageNotBlockedScenario();
  runPanelGlassScenario();
  runPanelGlassNormalizationScenario();

  const header = '[' + bundleName + '] ';
  const warns = (main && main.logged.warn) || [];
  if (failures.length === 0) {
    console.log(header + '冒烟检查通过（' + notes.length + ' 项）');
    console.log('  ' + notes.join('\n  '));
    if (warns.length) console.log('  WARN(' + warns.length + '): ' + warns.join(' | ').slice(0, 400));
    process.exit(0);
  }
  console.error(header + '冒烟检查失败：');
  failures.forEach((line) => console.error('  ' + line));
  const errors = (main && main.logged.error) || [];
  if (errors.length) console.error('  console.error: ' + errors.join(' | ').slice(0, 800));
  if (warns.length) console.error('  console.warn: ' + warns.join(' | ').slice(0, 400));
  process.exit(1);
})();
