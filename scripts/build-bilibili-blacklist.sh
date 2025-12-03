#!/bin/bash

# Bilibili-BlackList 自动整合脚本
# 该脚本将模块化的源代码整合为单个用户脚本文件

set -e  # 遇到错误时退出

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "开始构建 Bilibili-BlackList 用户脚本..."

# 检查必要目录是否存在
if [ ! -d "$SCRIPT_DIR/../src" ]; then
    echo "错误: 源代码目录 $SCRIPT_DIR/../src 不存在"
    exit 1
fi

# 创建输出目录（如果不存在）
mkdir -p "$SCRIPT_DIR/../dist"

# 定义源文件列表（不包括main.js，因为需要保留其头部信息）
source_files=(
    "$SCRIPT_DIR/../src/storage.js"
    "$SCRIPT_DIR/../src/core.js"
    "$SCRIPT_DIR/../src/video_data.js"
    "$SCRIPT_DIR/../src/ui.js"
    "$SCRIPT_DIR/../src/page_detection.js"
    "$SCRIPT_DIR/../src/ad_blocker.js"
)

# 输出文件
output_file="$SCRIPT_DIR/../dist/bilibili-blacklist.user.js"

# 清空输出文件
> "$output_file"

# 添加用户脚本头部信息
cat << 'EOF' >> "$output_file"
// ==UserScript==
// @name         Bilibili-BlackList
// @namespace    https://github.com/HeavenTTT/bilibili-blacklist
// @version      1.1.8
// @author       HeavenTTT
// @description  Bilibili UP屏蔽插件 - 屏蔽UP主视频卡片，支持精确匹配和正则匹配，支持视频页面、分类页面、搜索页面等。
// @match        *://*.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         https://www.bilibili.com/favicon.ico
// @license      MIT
// @run-at       document-start
// ==/UserScript==

// 由Qwen Coder重构的Bilibili-BlackList用户脚本
// 重构说明：
// - 将原脚本拆分为多个模块：storage.js, core.js, video_data.js, ui.js, page_detection.js, ad_blocker.js
// - 添加了常量定义到各文件顶部
// - 优化了代码结构和可维护性
// - 保留了所有原始功能
EOF

echo "已添加用户脚本头部信息"

# 合并所有源文件（不包括main.js，因为头部信息已经添加）
for file in "${source_files[@]}"; do
    if [ -f "$file" ]; then
        echo "正在添加: $file"
        # 跳过头部信息（如果有），避免重复
        if head -n 1 "$file" | grep -q "@name"; then
            # 如果文件包含用户脚本头部，则跳过头部部分
            sed '1,/^\/\/ ==\/UserScript==/d' "$file" >> "$output_file"
        else
            cat "$file" >> "$output_file"
        fi
        echo "" >> "$output_file"  # 添加空行作为分隔
    else
        echo "警告: 文件 $file 不存在"
    fi
done

# 最后添加main.js的内容（跳过其头部信息）
main_js_file="$SCRIPT_DIR/../src/main.js"
if [ -f "$main_js_file" ]; then
    echo "正在添加: $main_js_file (跳过头部信息)"
    sed '1,/^\/\/ ==\/UserScript==/d' "$main_js_file" >> "$output_file"
else
    echo "警告: 文件 $main_js_file 不存在"
fi

echo "构建完成！输出文件: $output_file"

# 验证输出文件是否生成成功
if [ -s "$output_file" ]; then
    echo "文件大小: $(wc -c < "$output_file") 字节"
    echo "构建成功！"
else
    echo "错误: 输出文件为空或未生成"
    exit 1
fi

# 可选：复制到 scripts 目录作为备份
cp "$output_file" "$SCRIPT_DIR/bilibili-blacklist-refactored.user.js"
echo "已复制到当前目录: $SCRIPT_DIR/bilibili-blacklist-refactored.user.js"