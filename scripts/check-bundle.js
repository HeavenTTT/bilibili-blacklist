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
 * 这个脚本用最小 DOM 桩把**真实构建产物**跑起来，覆盖上面三类问题：
 *
 *   1. 整包 eval 不抛错（语法 + 求值顺序 + 顶层标识符）；
 *   2. 顶层声明唯一（扫描产物里重复的 function/let/const/var）；
 *   3. 初始化路径：触发 DOMContentLoaded → initializeScript → 观察器 / 面板 /
 *      黑名单列表 / 设置页 / 延迟补扫，并断言面板结构。
 *
 * 不覆盖：真实选择器、接口请求、视觉与屏蔽行为（那些需要浏览器）。
 * 用法：npm run build && npm run check
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8')
);
const src = config.src || {};
const outputDir = src.outputDir || 'dist';
const outputBase = process.argv.includes('--dev')
  ? src.devOutputBase || 'bilibili-blacklist.dev.user.js'
  : src.outputBase || 'bilibili-blacklist.user.js';
const bundlePath = path.join(ROOT, outputDir, outputBase);

if (!fs.existsSync(bundlePath)) {
  console.error('[check] 找不到构建产物：' + bundlePath + '\n        请先运行 npm run build');
  process.exit(1);
}
const code = fs.readFileSync(bundlePath, 'utf8');

/* ============================ 最小 DOM 桩 ============================ */

/** 所有被 createElement 出来的元素，供断言查询。 */
const CREATED = [];

function createClassList(el) {
  const names = new Set();
  return {
    add: (...list) => list.forEach((n) => names.add(n)),
    remove: (...list) => list.forEach((n) => names.delete(n)),
    contains: (n) => names.has(String(n)),
    toggle: (n, force) => {
      const on = force === undefined ? !names.has(n) : !!force;
      if (on) names.add(n);
      else names.delete(n);
      el.__touched = true;
      return on;
    },
    toString: () => Array.from(names).join(' '),
    clear: () => names.clear(),
  };
}

function createElement(tagName) {
  const el = {
    tagName: String(tagName).toUpperCase(),
    nodeType: 1,
    nodeName: String(tagName).toUpperCase(),
    childNodes: [],
    parentElement: null,
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    title: '',
    value: '',
    placeholder: '',
    type: '',
    id: '',
    min: '',
    max: '',
    step: '',
    selected: false,
    offsetWidth: 0,
    offsetHeight: 0,
    isConnected: true,
    attributes: {},
    __listeners: {},
  };
  Object.assign(el, {
    get children() {
      return el.childNodes.filter((n) => n.nodeType === 1);
    },
    get firstChild() {
      return el.childNodes[0] || null;
    },
    appendChild(child) {
      if (child.parentElement) child.parentElement.removeChild(child);
      el.childNodes.push(child);
      child.parentElement = el;
      return child;
    },
    insertBefore(child, ref) {
      if (child.parentElement) child.parentElement.removeChild(child);
      const at = ref ? el.childNodes.indexOf(ref) : -1;
      if (at === -1) el.childNodes.push(child);
      else el.childNodes.splice(at, 0, child);
      child.parentElement = el;
      return child;
    },
    removeChild(child) {
      const at = el.childNodes.indexOf(child);
      if (at !== -1) el.childNodes.splice(at, 1);
      child.parentElement = null;
      return child;
    },
    remove() {
      if (el.parentElement) el.parentElement.removeChild(el);
    },
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    getAttribute(name) {
      return el.attributes[name] === undefined ? null : el.attributes[name];
    },
    hasAttribute(name) {
      return el.attributes[name] !== undefined;
    },
    removeAttribute(name) {
      delete el.attributes[name];
    },
    addEventListener(type, fn) {
      (el.__listeners[type] = el.__listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = el.__listeners[type] || [];
      const at = list.indexOf(fn);
      if (at !== -1) list.splice(at, 1);
    },
    dispatchEvent(event) {
      (el.__listeners[event.type] || []).forEach((fn) => fn(event));
      return true;
    },
    click() {
      el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} });
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  });
  const classList = createClassList(el);
  el.classList = classList;
  Object.defineProperty(el, 'className', {
    get: () => classList.toString(),
    set: (value) => {
      classList.clear();
      String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classList.add(name));
    },
  });
  CREATED.push(el);
  return el;
}

const documentListeners = {};
const fakeDocument = {
  readyState: 'loading',
  hidden: false,
  visibilityState: 'visible',
  documentElement: createElement('html'),
  body: createElement('body'),
  createElement,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener(type, fn) {
    (documentListeners[type] = documentListeners[type] || []).push(fn);
  },
  removeEventListener() {},
};

/* ==================== 沙箱：只提供产物真正需要的东西 ==================== */

const styles = [];
const logged = { warn: [], error: [] };
const gmStore = {};

const sandbox = {
  console: {
    log: () => {},
    debug: () => {},
    info: () => {},
    warn: (...args) => logged.warn.push(args.join(' ')),
    error: (...args) => logged.error.push(args.join(' ')),
  },
  document: fakeDocument,
  location: {
    hostname: 'www.bilibili.com',
    pathname: '/',
    search: '',
    hash: '',
    href: 'https://www.bilibili.com/',
  },
  history: { pushState() {}, replaceState() {} },
  getComputedStyle: () => ({ position: 'static', backgroundColor: '', filter: '' }),
  MutationObserver: class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
  GM_getValue: (key, fallback) => (gmStore[key] === undefined ? fallback : gmStore[key]),
  GM_setValue: (key, value) => {
    gmStore[key] = value;
  },
  GM_addStyle: (css) => {
    styles.push(String(css));
  },
  GM_registerMenuCommand: () => {},
  alert: () => {},
  confirm: () => false,
  fetch: () => Promise.reject(new Error('smoke-check: 初始化阶段不应发起网络请求')),
  AbortController: class {
    constructor() {
      this.signal = {};
    }
    abort() {}
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URLSearchParams,
};
// window / unsafeWindow / 顶层 addEventListener 都指向沙箱自身
sandbox.window = sandbox;
sandbox.unsafeWindow = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = (type, fn) => {
  (sandbox.__listeners = sandbox.__listeners || {});
  (sandbox.__listeners[type] = sandbox.__listeners[type] || []).push(fn);
};
sandbox.removeEventListener = () => {};

/* ============================== 检查项 ============================== */

const failures = [];
const notes = [];
function check(name, ok, detail) {
  if (ok) notes.push('PASS ' + name);
  else failures.push('FAIL ' + name + (detail === undefined ? '' : ' -> ' + detail));
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

/* 2) 整包求值 */
let evalError = null;
const context = vm.createContext(sandbox);
try {
  vm.runInContext(code, context, { filename: path.basename(bundlePath) });
} catch (error) {
  evalError = error;
}
check('产物可整包求值（无语法/求值顺序错误）', !evalError, evalError && evalError.stack);
check('主样式已注入', styles.length >= 2 && styles[0].length > 5000, 'styles=' + styles.length + ' len0=' + (styles[0] || '').length);

/* 3) 初始化：模拟 DOMContentLoaded */
async function runInit() {
  const listeners = documentListeners.DOMContentLoaded || [];
  check('已注册 DOMContentLoaded 监听', listeners.length === 1, String(listeners.length));
  try {
    listeners.forEach((fn) => fn());
  } catch (error) {
    check('initializeScript 不抛异常', false, error && error.stack);
    return;
  }
  check('initializeScript 不抛异常', true);
  // 主页会在 800ms 后补扫一次，等它跑完（同时覆盖 scanAndBlockVideoCards 路径）
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

function countByClass(name) {
  return CREATED.filter((el) => el.classList.contains(name)).length;
}

/* ============================== 执行 ============================== */

(async () => {
  checkDuplicateDeclarations();
  if (!evalError) await runInit();

  check(
    '管理面板已创建',
    CREATED.filter((el) => el.id === 'bilibili-blacklist-manager-panel').length === 1,
    String(CREATED.filter((el) => el.id === 'bilibili-blacklist-manager-panel').length)
  );
  check('面板页签 5 个', countByClass('bilibili-blacklist-tab') === 5, String(countByClass('bilibili-blacklist-tab')));
  // 6 屏蔽类型 + 6 网络与请求 + 6 累计与趋势 = 18 行（与 dev 自检同口径）
  check('统计明细 18 行', countByClass('bilibili-blacklist-stat-row') === 18, String(countByClass('bilibili-blacklist-stat-row')));
  check('趋势柱 7 根', countByClass('bilibili-blacklist-trend-bar') === 7, String(countByClass('bilibili-blacklist-trend-bar')));
  check('设置行已渲染', countByClass('bilibili-blacklist-panel-row') >= 12, String(countByClass('bilibili-blacklist-panel-row')));
  check('设置控件已渲染', countByClass('bilibili-blacklist-config-btn') >= 10, String(countByClass('bilibili-blacklist-config-btn')));

  const header = '[' + path.basename(bundlePath) + '] ';
  if (failures.length === 0) {
    console.log(header + '冒烟检查通过（' + notes.length + ' 项）');
    console.log('  ' + notes.join('\n  '));
    if (logged.warn.length) console.log('  WARN(' + logged.warn.length + '): ' + logged.warn.join(' | ').slice(0, 400));
    process.exit(0);
  }
  console.error(header + '冒烟检查失败：');
  failures.forEach((line) => console.error('  ' + line));
  if (logged.error.length) console.error('  console.error: ' + logged.error.join(' | ').slice(0, 800));
  if (logged.warn.length) console.error('  console.warn: ' + logged.warn.join(' | ').slice(0, 400));
  process.exit(1);
})();
