// ==UserScript==
// @name         Bilibili-BlackList -Dev (Loader)
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      2.0.0
// @author       HeavenTTT
// @description  [开发专用] 每次打开 B 站页面自动拉取 localhost:5173 的最新构建产物并执行。本加载器只需安装一次。
// @match        *://*.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // 127.0.0.1 优先（保证 IPv4），localhost 作为备用（双栈下等价）
  var TS = Date.now();
  var DEV_URLS = [
    'http://127.0.0.1:5173/dist/bilibili-blacklist.user.js?t=' + TS,
    'http://localhost:5173/dist/bilibili-blacklist.user.js?t=' + TS
  ];
  var MAX_ATTEMPTS = 6;

  function fail(msg) {
    console.error('[Bilibili-BlackList Dev] ' + msg + '（请确认已在项目根目录运行 npm run dev）');
  }

  // 诊断标记：把加载过程写到页面角落，便于确认“加载器是否运行 / 失败原因”
  function mark(type, msg) {
    try {
      var el = document.getElementById('bilibili-blacklist-dev-marker');
      if (!el) {
        el = document.createElement('div');
        el.id = 'bilibili-blacklist-dev-marker';
        el.style.cssText =
          'position:fixed;left:8px;bottom:8px;z-index:2147483647;' +
          'font:12px/1.4 monospace;color:#fff;background:#333;padding:6px 10px;' +
          'border-radius:4px;max-width:70vw;white-space:pre-wrap;';
        document.documentElement.appendChild(el);
      }
      el.textContent = '[BlackList Dev] ' + type + ': ' + (msg || '');
    } catch (e) { /* 页面环境异常时忽略 */ }
  }

  // 拉取失败/超时/执行出错自动重试（最多 MAX_ATTEMPTS 次），并交替 127.0.0.1 / localhost
  function fetchAndRun(attempt) {
    var url = DEV_URLS[attempt % DEV_URLS.length];
    mark('try', (attempt + 1) + '/' + MAX_ATTEMPTS + ' ' + url.replace(/\?t=.*/, ''));
    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      timeout: 8000,
      onload: function (res) {
        if (res.status !== 200) {
          if (attempt < MAX_ATTEMPTS - 1) {
            setTimeout(function () { fetchAndRun(attempt + 1); }, 800);
            return;
          }
          mark('FAIL', 'HTTP ' + res.status);
          fail('拉取构建产物失败，HTTP ' + res.status);
          return;
        }
        var code = res.responseText.replace(/^\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/, '');
        try {
          eval(code);
          mark('OK', '已加载 (try ' + (attempt + 1) + ')');
          console.log('[Bilibili-BlackList Dev] 已加载最新构建 ' + new Date().toLocaleTimeString() + ' (try ' + (attempt + 1) + ')');
        } catch (e) {
          mark('EVAL_ERR', String(e && e.message));
          console.error('[Bilibili-BlackList Dev] 执行最新构建时出错：', e);
          if (attempt < MAX_ATTEMPTS - 1) {
            setTimeout(function () { fetchAndRun(attempt + 1); }, 800);
            return;
          }
        }
      },
      onerror: function () {
        if (attempt < MAX_ATTEMPTS - 1) {
          setTimeout(function () { fetchAndRun(attempt + 1); }, 800);
          return;
        }
        mark('FAIL', '无法连接 dev server');
        fail('无法连接本地 dev server');
      },
      ontimeout: function () {
        if (attempt < MAX_ATTEMPTS - 1) {
          setTimeout(function () { fetchAndRun(attempt + 1); }, 800);
          return;
        }
        mark('FAIL', '请求超时');
        fail('请求超时');
      }
    });
  }
  fetchAndRun(0);
})();
