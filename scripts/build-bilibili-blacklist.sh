#!/bin/bash

# Bilibili-BlackList 自动整合脚本
# 该脚本将模块化的源代码整合为单个用户脚本文件

set -e  # 遇到错误时退出

echo "开始构建 Bilibili-BlackList 用户脚本..."

# 检查必要目录是否存在
if [ ! -d "../src" ]; then
    echo "错误: 源代码目录 ../src 不存在"
    exit 1
fi

# 创建输出目录（如果不存在）
mkdir -p ../dist

# 定义源文件列表
source_files=(
    "../src/storage.js"
    "../src/core.js"
    "../src/video_data.js"
    "../src/ui.js"
    "../src/page_detection.js"
    "../src/ad_blocker.js"
    "../src/main.js"
)

# 输出文件
output_file="../dist/bilibili-blacklist-refactored.user.js"

# 清空输出文件
> "$output_file"

# 合并所有源文件
for file in "${source_files[@]}"; do
    if [ -f "$file" ]; then
        echo "正在添加: $file"
        cat "$file" >> "$output_file"
        echo "" >> "$output_file"  # 添加空行作为分隔
    else
        echo "警告: 文件 $file 不存在"
    fi
done

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
cp "$output_file" "./bilibili-blacklist-refactored.user.js"
echo "已复制到当前目录: bilibili-blacklist-refactored.user.js"