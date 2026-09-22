#!/usr/bin/env node
'use strict';

/*
 * 构建脚本 —— 完全重写版
 * -----------------------------------------------------------
 * 与旧版（bilibili-blacklist/build.js）相比的改进：
 *   1. 模块顺序不再硬编码，改由 build.config.json 的 src.modules 管理；
 *   2. userscript 元数据（@name / @match / @grant / @icon 等）集中到配置；
 *   3. 所有 src 模块统一为“纯代码”，由构建器包进同一个 IIFE，不再依赖
 *      src/main.js 里特殊的去包装逻辑，风格更干净；
 *   4. 输出文件名 / 目录由配置驱动，构建结果可预测、可复用。
 * -----------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8'));

const { userscript = {}, src = {} } = config;
const VERSION = pkg.version;
const outputDir = path.join(ROOT, src.outputDir || 'dist');
const outputBase = src.outputBase || `${pkg.name}.user.js`;
const modules = Array.isArray(src.modules) ? src.modules : [];
const devModules = Array.isArray(src.devModules) ? src.devModules : [];
const isDevBuild = process.argv.includes('--dev');

/* 生成 userscript 元数据头 */
function buildHeader() {
  const meta = {
    name: userscript.name || pkg.name,
    namespace: userscript.namespace || '',
    version: VERSION,
    author: userscript.author || pkg.author,
    description: userscript.description || pkg.description,
    match: userscript.match || [],
    grant: userscript.grant || [],
    icon: userscript.icon,
    license: userscript.license || pkg.license,
    noframes: userscript.noframes === true,
    'run-at': userscript.runAt || '',
    downloadURL: userscript.downloadURL,
    updateURL: userscript.updateURL,
  };

  const entries = Object.entries(meta).filter(
    ([, value]) => value !== undefined && value !== null && value !== '' && value !== false
  );
  const keyWidth = Math.max(...entries.map(([key]) => key.length));
  const lines = ['// ==UserScript=='];
  for (const [key, value] of entries) {
    const label = ('// @' + key).padEnd('// @'.length + keyWidth + 1);
    if (value === true) {
      lines.push(label.trimEnd());
    } else if (Array.isArray(value)) {
      for (const item of value) lines.push(label + item);
    } else {
      lines.push(label + value);
    }
  }
  lines.push('// ==/UserScript==', '');
  return lines.join('\n');
}



/* 移除代码中的注释（保留字符串/模板字面量里的内容，避免破坏 URL/CSS 等）。
 * 只作用于合并后的模块体；userscript 元数据头（// ==UserScript==）不经过这里。 */
function stripComments(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let state = 'normal'; // normal | single | double | template | line | block
  let hasContent = false;        // 当前行是否已有非空白字符
  let lineHadContent = false;    // 进入行注释前 hasContent 的快照
  let blockHadContent = false;   // 进入块注释前 hasContent 的快照
  let skipNextNewline = false;   // 块注释结束后是否跳过下一个换行
  let lineStart = 0;             // 当前行在输出 out 中的起始位置（用于清掉独立注释行的缩进/行尾空白）

  function isWhitespace(c) {
    return c === ' ' || c === '\t' || c === '\r' || c === '\n';
  }

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    if (state === 'normal') {
      if (c === '/' && next === '/') {
        // 进入行注释，记录当前行是否有内容
        lineHadContent = hasContent;
        if (!lineHadContent && out.length > lineStart) {
          // 独立注释行：其前导空白属于注释行本身，应随注释一起丢弃；
          // 否则会残留成缩进噪音（连续注释行的空白还会叠加到下一行代码上，
          // 例如配置对象里相邻两行注释会让下一行多出 4 个空格）。
          out = out.slice(0, lineStart);
        } else if (lineHadContent) {
          // 行内注释（代码后跟 // 注释）：代码与注释之间的空白属于注释分隔符，
          // 随注释一起移除，避免行尾残留空格
          out = out.replace(/[ \t]+$/, '');
        }
        state = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        // 进入块注释，记录当前行是否有内容
        blockHadContent = hasContent;
        if (!blockHadContent && out.length > lineStart) {
          // 独立块注释行同样丢弃其前导空白
          out = out.slice(0, lineStart);
        } else if (blockHadContent) {
          out = out.replace(/[ \t]+$/, '');
        }
        state = 'block';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'single';
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        state = 'double';
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        state = 'template';
        out += c;
        i++;
        continue;
      }

      // 处理普通字符
      if (c === '\n') {
        // 如果标记了跳过换行（块注释独立行），则跳过此换行
        if (skipNextNewline) {
          skipNextNewline = false;
          i++;
          // 换行被跳过，hasContent 应当重置（因为新行尚未开始）
          hasContent = false;
          // 独立块注释行的行尾可能残留空白（如 "/* x */  "）：
          // 本行自 lineStart 起只有空白则整体清掉；若后面还有代码则保留
          if (out.slice(lineStart).trim() === '') {
            out = out.slice(0, lineStart);
          }
          lineStart = out.length;
          continue;
        }
        out += c;
        hasContent = false; // 新行开始
        lineStart = out.length;
        i++;
      } else {
        // 非换行普通字符
        if (!isWhitespace(c)) {
          hasContent = true;
        }
        out += c;
        i++;
      }
    } else if (state === 'line') {
      if (c === '\n') {
        // 行注释结束：如果是独立注释行（进入前无内容），则不输出换行
        if (!lineHadContent) {
          // 不输出换行，同时重置 hasContent（新行开始）
          hasContent = false;
        } else {
          out += c;
          hasContent = false;
          // 关键：行内注释行输出换行后必须同步 lineStart。
          // 否则下一行若是独立注释行，其"前导空白截断"会按过期的 lineStart
          // 把本行（以及更早的代码）一并删除 —— 曾导致 defaultGlobalPluginConfig
          // 里带行内注释的配置项整段丢失。
          lineStart = out.length;
        }
        state = 'normal';
        i++;
      } else {
        i++; // 跳过注释内容
      }
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        // 块注释结束：若进入前无内容（独立块注释），则标记跳过随后一个换行
        if (!blockHadContent) {
          skipNextNewline = true;
        }
        state = 'normal';
        i += 2;
      } else {
        i++; // 跳过注释内容
      }
    } else if (state === 'single' || state === 'double') {
      out += c;
      if (c === '\\') {
        out += (code[i + 1] || '');
        i += 2;
        continue;
      }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) {
        state = 'normal';
      }
      i++;
    } else if (state === 'template') {
      out += c;
      if (c === '\\') {
        out += (code[i + 1] || '');
        i += 2;
        continue;
      }
      // 模板字面量里的换行同样要同步 lineStart（内部含 CSS/SVG 多行内容，
      // 若后面紧跟独立注释行，截断逻辑需要正确的行起点）
      if (c === '\n') {
        lineStart = out.length;
      }
      if (c === '`') {
        state = 'normal';
      }
      i++;
    }
  }
  return out;
}

/* 按配置顺序读取并合并模块。
 * 发布构建只合并 src.modules；dev 构建（--dev）会追加 src.devModules。 */
function buildBody() {
  const parts = [];
  const list = isDevBuild ? modules.concat(devModules) : modules;
  for (const rel of list) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`模块文件不存在: ${full}`);
    }
    const content = fs.readFileSync(full, 'utf8').trim();
    parts.push(content);
  }
  return parts.join('\n\n') + '\n';
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputFile = path.join(outputDir, outputBase);
const mergedBody = stripComments(buildBody());
const output = [
  buildHeader(),
  '(function () {',
  '  "use strict";',
  isDevBuild ? '  const __DSH_DEV__ = true;':
  '',
  mergedBody,
  '})();',
  '',
].join('\n');

fs.writeFileSync(outputFile, output, 'utf8');

console.log('Build completed: ' + outputFile);
console.log('Version: ' + VERSION);
console.log('Build type: ' + (isDevBuild ? 'dev (含 debug/dev-test 模块)' : 'release'));
console.log('Modules merged: ' + (isDevBuild ? modules.length + devModules.length : modules.length));