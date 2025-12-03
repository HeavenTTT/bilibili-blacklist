#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 定义源文件路径
const srcDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'dist');
const outputFile = path.join(outputDir, 'bilibili-blacklist.user.js');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 定义模块加载顺序
const moduleOrder = [
  'main.js',
  'storage/storage.js',
  'core/core.js',
  'core/video-data.js',
  'ui/ui.js',
  'observer/observer.js',
  'pages/pages.js',
  'ads/ads.js',
  'utils/utils.js'
];

// 读取所有模块文件并按顺序合并
let outputContent = '';

for (const modulePath of moduleOrder) {
  const fullPath = path.join(srcDir, modulePath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    outputContent += content + '\n';
  } else {
    console.warn(`Warning: Module file not found: ${fullPath}`);
  }
}

// 将合并后的内容写入输出文件
fs.writeFileSync(outputFile, outputContent);

console.log(`Build completed: ${outputFile}`);
console.log(`Total modules processed: ${moduleOrder.length}`);