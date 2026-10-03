'use strict';

/*
 * 最小 DOM 桩 + 沙箱（零依赖，无需浏览器 / jsdom）
 * ===========================================================
 * 本仓库的构建方式是「多个 src 模块按配置顺序拼进同一个 IIFE、共享全局作用域」，
 * 因此最容易出错的地方不是语法，而是：
 *   - 模块求值顺序（TDZ：`const` 在定义前被另一个模块在求值期读到）；
 *   - 文件拆分/搬运时的漏搬、重搬（同一个函数被搬了两份，后者静默覆盖前者）；
 *   - 顶层代码引用了未定义的标识符。
 *
 * 这里把「DOM 桩 + GM_* 沙箱」抽成可复用的工厂：每个 `createHarness()` 调用都得到
 * **互相隔离的一套 DOM 与作用域**，因此同一个构建产物可以在不同页面场景下分别装载、
 * 分别断言（例如主页初始化 + 空间页初始化各跑一次）。
 *
 * 不覆盖：真实选择器、接口请求、视觉排版（那些需要浏览器）。
 */

/**
 * 创建一个隔离的 DOM 桩 + 沙箱，用来装载构建产物。
 * @param {object} [options]
 * @param {string} [options.code] - 构建产物源码；给了就顺便求值。
 * @param {object} [options.location] - 覆盖 location 字段（hostname / pathname / href …）。
 * @param {string} [options.upNameText] - 空间页的 UP 名。给了就模拟
 *   `document.querySelector("#h-name, .nickname")` 命中该元素（即空间页已渲染头部）。
 * @returns {object} 桩与断言辅助。
 */
function createHarness(options) {
  const opts = options || {};

  /* ------------------------------ DOM 桩 ------------------------------ */

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

  // 空间页的 UP 名元素：只有传了 upNameText 才存在（模拟头部已渲染）
  const upNameElement = opts.upNameText ? createElement('h1') : null;
  if (upNameElement) upNameElement.textContent = opts.upNameText;

  const documentListeners = {};
  const fakeDocument = {
    readyState: 'loading',
    hidden: false,
    visibilityState: 'visible',
    documentElement: createElement('html'),
    body: createElement('body'),
    createElement,
    getElementById: () => null,
    querySelector: (selector) =>
      upNameElement && String(selector).indexOf('h-name') !== -1 ? upNameElement : null,
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      (documentListeners[type] = documentListeners[type] || []).push(fn);
    },
    removeEventListener() {},
  };

  /* --------------------------- GM_* 沙箱 --------------------------- */

  const styles = [];
  const logged = { warn: [], error: [] };
  const gmStore = {};

  const location = Object.assign(
    {
      hostname: 'www.bilibili.com',
      pathname: '/',
      search: '',
      hash: '',
      href: 'https://www.bilibili.com/',
    },
    opts.location || {}
  );

  const sandbox = {
    console: {
      log: () => {},
      debug: () => {},
      info: () => {},
      warn: (...args) => logged.warn.push(args.join(' ')),
      error: (...args) => logged.error.push(args.join(' ')),
    },
    document: fakeDocument,
    location,
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

  const vm = require('vm');
  const context = vm.createContext(sandbox);

  return {
    sandbox,
    context,
    document: fakeDocument,
    location,
    styles,
    logged,
    gmStore,
    CREATED,
    createElement,
    upNameElement,
    /** 整包求值；返回抛出的错误（没抛就返回 null）。 */
    evaluate(code, filename) {
      try {
        vm.runInContext(code, context, { filename: filename || 'bundle.js' });
        return null;
      } catch (error) {
        return error;
      }
    },
    /** 触发 DOMContentLoaded（即 initializeScript）。返回抛出的错误。 */
    init() {
      const listeners = documentListeners.DOMContentLoaded || [];
      try {
        listeners.forEach((fn) => fn());
        return null;
      } catch (error) {
        return error;
      }
    },
    /** 已注册的 DOMContentLoaded 监听器数量。 */
    domContentLoadedListenerCount() {
      return (documentListeners.DOMContentLoaded || []).length;
    },
    /** 统计被创建出来、带某个 class 的元素个数。 */
    countByClass(name) {
      return CREATED.filter((el) => el.classList.contains(name)).length;
    },
    /** 找到第一个带某个 class 的已创建元素。 */
    findByClass(name) {
      return CREATED.filter((el) => el.classList.contains(name))[0] || null;
    },
    /** 全部注入样式（GM_addStyle）拼接后的文本。 */
    injectedCss() {
      return styles.join('\n');
    },
    /** 注入样式去掉注释后的文本 —— 断言「规则真的存在」时必须用它，
     *  否则只描述该规则的注释也会让断言通过。 */
    injectedCssWithoutComments() {
      return styles.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    },
  };
}

module.exports = { createHarness };
