#!/usr/bin/env node
'use strict';

/*
 * 一键开发脚本 —— 完全重写版
 * -----------------------------------------------------------
 * 沿用旧版（bilibili-blacklist/scripts/dev.js）的开发方式：
 *   首次构建 → 监听 src/ 变化自动重建 → 本地静态服务器（no-cache + CORS）。
 * 改进点：
 *   1. 构建产物文件名/目录从 build.config.json 读取，不再硬编码；
 *   2. 日志更清晰，构建失败不会破坏开发服务器；
 *   3. 递归监听不可用时自动降级为轮询（500ms），跨平台自适应。
 * -----------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const PORT = Number(process.env.PORT) || 5173;
// 默认双栈监听（::），同时接受 IPv4/IPv6 —— 避免浏览器把 localhost 解析到 ::1 时连接被拒
const HOST = process.env.HOST || '::';
const DISPLAY_HOST = process.env.HOST || 'localhost';

/* 读取构建配置，得到产物文件名与目录 */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8'));

function loadBuildTarget() {
  const outputDir = config.src.outputDir || 'dist';
  const outputBase = config.src.outputBase || `${pkg.name}.user.js`;
  return { outputDir, outputBase };
}

const BUILD_TARGET = loadBuildTarget();
const BUILD_URL = `http://${DISPLAY_HOST}:${PORT}/${BUILD_TARGET.outputDir}/${BUILD_TARGET.outputBase}`;
// 加载器文件名与 package.json 的 name 对齐：test/<name>.dev.user.js
// （早期写法在 const pkg 之前调用 pkgName()，靠函数提升才没崩，且名字一改就指错文件）
const LOADER_URL = `http://${DISPLAY_HOST}:${PORT}/test/${pkg.name}.dev.user.js`;

/* ---------------- 构建 ---------------- */
function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'build.js'), '--dev'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`build.js 退出码 ${code}`))
    );
  });
}

/* ---------------- 监听 src/ 变化 ---------------- */
function watchSrc() {
  let timer = null;
  const scheduleRebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log('\n[dev] 检测到 src/ 变更，重新构建...');
      build()
        .then(() => console.log('[dev] 构建完成，刷新页面即可生效\n'))
        .catch((e) => console.error('[dev] 构建失败：', e.message));
    }, 150);
  };

  try {
    fs.watch(SRC_DIR, { recursive: true }, (_event, filename) => {
      if (filename) scheduleRebuild();
    });
    console.log('[dev] 已监听 src/ 目录（fs.watch recursive）');
  } catch (_e) {
    console.log('[dev] 递归监听不可用，降级为轮询模式（500ms）');
    let snapshot = '';
    const scan = () => {
      const parts = [];
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const p = path.join(dir, name);
          let st;
          try {
            st = fs.statSync(p);
          } catch (_e2) {
            continue;
          }
          if (st.isDirectory()) walk(p);
          else parts.push(name + ':' + st.mtimeMs);
        }
      };
      walk(SRC_DIR);
      const sig = parts.join('|');
      if (snapshot && sig !== snapshot) scheduleRebuild();
      snapshot = sig;
    };
    scan();
    setInterval(scan, 500);
  }
}

/* ---------------- 静态服务器（no-cache + CORS） ---------------- */
const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (_e) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.normalize(path.join(ROOT, urlPath));
    const insideRoot = filePath === ROOT || filePath.startsWith(ROOT + path.sep);
    if (!insideRoot) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + urlPath);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log('\n==============================================');
    console.log('[dev] 本地服务器已启动:   http://localhost:' + PORT);
    console.log('[dev] 构建产物地址:       ' + BUILD_URL);
    console.log('[dev] 构建类型: dev（注入调试/测试入口，仅开发环境生效）');
    console.log('[dev] 油猴加载器(装一次): ' + LOADER_URL);
    console.log('[dev] 流程: 改代码 -> 自动重建 -> 刷新页面');
    console.log('==============================================\n');
  });
}

/* ---------------- 启动 ---------------- */
async function main() {
  console.log('[dev] 首次构建...');
  try {
    await build();
  } catch (e) {
    console.error('[dev] 首次构建失败：', e.message);
    process.exit(1);
  }
  watchSrc();
  startServer();
}

main();
