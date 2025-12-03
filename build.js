// 构建脚本：将模块化的代码整合为单个用户脚本文件
const fs = require('fs');
const path = require('path');

// 读取所有模块文件
const modules = [
  'src/storage.js',
  'src/core.js',
  'src/video_data.js',
  'src/ui.js',
  'src/page_detection.js',
  'src/ad_blocker.js',
  'src/main.js'
];

// 读取各模块内容并整合
let combinedCode = '';
combinedCode += fs.readFileSync('src/storage.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/core.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/video_data.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/ui.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/page_detection.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/ad_blocker.js', 'utf8') + '\n';
combinedCode += fs.readFileSync('src/main.js', 'utf8') + '\n';

// 写入整合后的文件
fs.writeFileSync('scripts/bilibili-blacklist-refactored.user.js', combinedCode);
console.log('重构后的脚本已生成到 scripts/bilibili-blacklist-refactored.user.js');