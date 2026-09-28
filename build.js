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
const releaseOutputBase = src.outputBase || `${pkg.name}.user.js`;
/* dev 产物必须与发布产物**分开文件**：
 * 两者同名会互相覆盖，而 dist/ 是有意入库的（GreasyFork 的 downloadURL 指向发布产物），
 * 于是跑一次 `npm run build:dev` / `npm run dev` 就能把带 window.__blacklistExpose 的
 * 调试版写进发布渠道，且很难在 diff 里发现。 */
const devOutputBase = src.devOutputBase || `${pkg.name}.dev.user.js`;
const modules = Array.isArray(src.modules) ? src.modules : [];
const devModules = Array.isArray(src.devModules) ? src.devModules : [];
const isDevBuild = process.argv.includes('--dev');
const outputBase = isDevBuild ? devOutputBase : releaseOutputBase;

/* 生成 userscript 元数据头 */
function buildHeader() {
  const meta = {
    // dev 产物带 -Dev 后缀：装进油猴后与正式版是两个独立脚本，不会互相覆盖，
    // 也便于一眼分辨当前跑的是哪个构建。
    name: (userscript.name || pkg.name) + (isDevBuild ? ' -Dev' : ''),
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
    // dev 产物不写 @downloadURL/@updateURL：它只由本地 dev server + 油猴加载器热更，
    // 若带上正式渠道的更新地址，装进油猴后可能被当成正式脚本去检查更新。
    downloadURL: isDevBuild ? undefined : userscript.downloadURL,
    updateURL: isDevBuild ? undefined : userscript.updateURL,
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
    // 行尾统一为 LF：个别源文件是 CRLF（observer / pages / utils），原样拼接会让产物
    // 变成 CRLF/LF 混杂，而 .gitattributes 要求 LF（eol=lf）—— 后果是每次构建后 git
    // 都把已入库的 dist 判成“已改动”，并提示 “CRLF will be replaced by LF”。
    const content = fs
      .readFileSync(full, 'utf8')
      .replace(/\r\n/g, '\n')
      .trim();
    parts.push(content);
  }
  return parts.join('\n\n') + '\n';
}

/* 校验 src/ 下的每个 .js 都已登记在配置里。
 * 新增模块忘记写进 build.config.json 时它不会参与打包，而症状是运行时“某函数未定义”
 * 或某个行为悄悄缺失 —— 属于最难排查的一类问题（本仓库的扁平 IIFE + 全局作用域尤其如此）。 */
function assertAllModulesListed() {
  const listed = new Set(
    modules.concat(devModules).map((rel) => path.resolve(ROOT, rel))
  );
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) found.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));

  const unlisted = found
    .filter((full) => !listed.has(full))
    .map((full) => path.relative(ROOT, full).split(path.sep).join('/'));
  if (unlisted.length > 0) {
    throw new Error(
      '以下 src 模块未登记在 build.config.json 的 src.modules / src.devModules 中，' +
        '不会参与打包：\n  ' +
        unlisted.join('\n  ')
    );
  }
}

assertAllModulesListed();

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