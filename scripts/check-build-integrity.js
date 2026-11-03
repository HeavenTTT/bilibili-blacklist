#!/usr/bin/env node
'use strict';

/*
 * 构建完整性检查（golden 测试，零依赖）
 * -----------------------------------------------------------
 * 解决的问题：build.js 的 stripComments 是**手写状态机**，它不识别正则字面量 ——
 * 一旦源码里出现 /https?:\/\// 这类含 "//" 的正则，尾部会被当成行注释删掉；
 * 出现 /["']/ 这类含引号的正则会误入字符串状态吞掉后续代码。更糟的是
 * 改坏后的产物通常**仍是合法 JS**，`node --check` 与“整包求值能跑通”都拦不住，
 * 只有真正跑到那段代码才会炸（历史上已经因此整段丢过 defaultGlobalPluginConfig）。
 *
 * 这个脚本用“源码里有什么，产物里就必须有什么”来做断言：
 *   1) src.modules 里每个文件的**顶层 function / const / let / var 名**都必须出现在产物里；
 *   2) data/settings.js 的 defaultGlobalPluginConfig 每个键都必须出现在产物里；
 *   3) 发布产物不得含任何 dev 调试入口（发布安全）；
 *   4) 产物只有一个 IIFE 包裹、`"use strict"` 存在、元数据头版本与 package.json 一致。
 *
 * 用法：
 *   node scripts/check-build-integrity.js            # 检查发布产物（默认）
 *   node scripts/check-build-integrity.js --dev      # 检查开发产物（含 dev-test.js）
 *
 * 注意：本脚本**不重建产物**，只校验磁盘上已有的产物；请先 npm run build。
 * `npm run verify` 已经把“构建 + 本检查 + 语法检查 + dist 无漂移”串起来。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const isDev = process.argv.includes('--dev');
const src = config.src || {};
const userscript = config.userscript || {};
const releaseModules = Array.isArray(src.modules) ? src.modules : [];
const devModules = Array.isArray(src.devModules) ? src.devModules : [];
const modules = isDev ? releaseModules.concat(devModules) : releaseModules;
const outputDir = src.outputDir || 'dist';
const outputBase = isDev ? src.devOutputBase : src.outputBase;
const outputFile = path.join(ROOT, outputDir, outputBase);

const failures = [];
let checkedIdentifiers = 0;
let checkedConfigKeys = 0;

function fail(message) {
  failures.push(message);
}

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/* ---------- 0) 产物存在 ---------- */
if (!fs.existsSync(outputFile)) {
  console.error(
    '[check:build] 找不到产物：' +
      path.relative(ROOT, outputFile) +
      '\n  请先运行 `npm run build`' +
      (isDev ? '（dev 产物用 `npm run build:dev`）' : '') +
      '。'
  );
  process.exit(1);
}
const dist = readUtf8(outputFile);

/* ---------- 1) 顶层标识符：源码有 → 产物必须有 ---------- */
const TOP_FUNCTION_RE = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
const TOP_BINDING_RE = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)/gm;

/** 词边界匹配（标识符可能被当作属性名/字符串使用，所以用“出现即算存在”即可）。 */
function containsIdentifier(haystack, name) {
  return haystack.indexOf(name) !== -1;
}

const missing = [];
modules.forEach((rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail('模块文件不存在：' + rel);
    return;
  }
  const code = readUtf8(full);
  const names = new Set();
  let match;
  while ((match = TOP_FUNCTION_RE.exec(code))) names.add(match[1]);
  TOP_FUNCTION_RE.lastIndex = 0;
  while ((match = TOP_BINDING_RE.exec(code))) names.add(match[1]);
  TOP_BINDING_RE.lastIndex = 0;
  names.forEach((name) => {
    checkedIdentifiers++;
    if (!containsIdentifier(dist, name)) missing.push(rel + ' → ' + name);
  });
});
if (missing.length > 0) {
  fail(
    '产物里缺少这些顶层标识符（去注释状态机可能误删了代码）：\n    ' +
      missing.slice(0, 20).join('\n    ') +
      (missing.length > 20 ? '\n    …共 ' + missing.length + ' 个' : '')
  );
}

/* ---------- 2) 配置默认值：每个键都要出现在产物里 ---------- */
function extractDefaultConfigKeys() {
  const file = path.join(ROOT, 'src/data/settings.js');
  if (!fs.existsSync(file)) return [];
  const code = readUtf8(file);
  const start = code.indexOf('const defaultGlobalPluginConfig = {');
  if (start === -1) return [];
  const end = code.indexOf('\n};', start);
  if (end === -1) return [];
  const block = code.slice(start, end);
  const keys = [];
  // 顶层键缩进固定为 2 个空格（本文件风格），值里没有嵌套对象，正则足够稳。
  block.replace(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm, (whole, key) => {
    keys.push(key);
    return whole;
  });
  return keys;
}

const configKeys = extractDefaultConfigKeys();
const missingKeys = configKeys.filter((key) => !containsIdentifier(dist, key));
checkedConfigKeys = configKeys.length;
if (configKeys.length === 0) {
  fail('未能从 src/data/settings.js 解析出任何配置键（解析逻辑需要更新）');
} else if (missingKeys.length > 0) {
  fail('产物里缺少这些配置项（defaultGlobalPluginConfig 可能被整段删掉）：' + missingKeys.join(', '));
}

/* ---------- 3) 发布安全：release 不得含 dev 调试入口 ---------- */
if (!isDev) {
  const devOnlyMarkers = [
    '__DSH_DEV__',
    '__blacklistExpose',
    '__blacklistConfig',
    '__blacklistInterceptors',
    '__blockTestRun',
    '__panelSelfCheck',
    '__probeDom',
  ];
  const leaked = devOnlyMarkers.filter((marker) => dist.indexOf(marker) !== -1);
  if (leaked.length > 0) {
    fail('发布产物里出现了仅 dev 构建才该有的调试入口：' + leaked.join(', '));
  }
}

/* ---------- 4) 产物结构 / 元数据头 ---------- */
const iifeCount = (dist.match(/^\(function \(\) \{/gm) || []).length;
if (iifeCount !== 1) {
  fail('产物应恰好有 1 个 IIFE 包裹，实际 ' + iifeCount + ' 个');
}
if (dist.indexOf('"use strict";') === -1) {
  fail('产物缺少 "use strict";');
}
if (dist.indexOf('// ==UserScript==') !== 0) {
  fail('产物开头不是 userscript 元数据头（构建拼接顺序可能被破坏）');
}
const versionInHeader = (dist.match(/^\/\/ @version\s+(.+)$/m) || [])[1];
if (versionInHeader !== pkg.version) {
  fail(
    '产物 @version（' +
      String(versionInHeader) +
      '）与 package.json 的 version（' +
      pkg.version +
      '）不一致，说明产物是旧构建'
  );
}
if (!isDev) {
  const expectedName = userscript.name || pkg.name;
  const nameInHeader = (dist.match(/^\/\/ @name\s+(.+)$/m) || [])[1];
  if (nameInHeader !== expectedName) {
    fail('发布产物 @name（' + String(nameInHeader) + '）应为 "' + expectedName + '"');
  }
  ['@match', '@grant', '@downloadURL', '@updateURL'].forEach((key) => {
    if (dist.indexOf('// ' + key) === -1) fail('发布产物元数据头缺少 ' + key);
  });
} else if (dist.indexOf('-Dev') === -1) {
  fail('dev 产物 @name 缺少 " -Dev" 后缀，无法与正式脚本区分');
}

/* ---------- 汇总 ---------- */
const label = isDev ? 'dev' : 'release';
if (failures.length > 0) {
  console.error('[check:build] 失败（' + label + ' 产物）：');
  failures.forEach((message) => console.error('  ✗ ' + message));
  process.exit(1);
}

console.log(
  '[check:build] 通过（' +
    label +
    '）：' +
    modules.length +
    ' 个模块 / ' +
    checkedIdentifiers +
    ' 个顶层标识符 / ' +
    checkedConfigKeys +
    ' 个配置键；产物 ' +
    path.relative(ROOT, outputFile) +
    '（' +
    dist.split('\n').length +
    ' 行）'
);
