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

/* ============================== 执行 ============================== */

(async () => {
  checkDuplicateDeclarations();
  const main = await runMainPageScenario();
  runSpacePageScenario();
  runSpacePageNotBlockedScenario();

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
