# Bilibili-BlackList 重构说明文档

## 项目结构

```
/workspace/
├── README.md                 # 项目说明文档
├── REFACTORING_PLAN.md       # 重构计划
├── DEVELOPMENT.md            # 本文件，开发说明文档
├── build.js                  # 构建脚本
├── dist/                     # 构建输出目录
│   └── bilibili-blacklist.user.js
├── scripts/                  # 原始用户脚本
│   └── bilibili-blacklist.user.js
└── src/                      # 模块化源代码
    ├── main.js              # 主入口文件
    ├── adblock/             # 广告屏蔽模块
    │   └── main.js
    ├── core/                # 核心屏蔽逻辑模块
    │   └── blocker.js
    ├── observers/           # 观察器模块
    │   └── page-observers.js
    ├── storage/             # 存储管理模块
    │   └── manager.js
    ├── ui/                  # UI管理模块
    │   └── manager.js
    └── utils/               # 工具函数模块
        └── helpers.js
```

## 模块说明

### 1. 核心模块 (`/src/core/blocker.js`)
- 处理视频卡片的屏蔽逻辑
- 包含核心的视频屏蔽算法
- 管理屏蔽队列和处理流程

### 2. 存储模块 (`/src/storage/manager.js`)
- 管理黑名单数据和配置项
- 处理数据的持久化存储
- 提供默认值管理

### 3. UI模块 (`/src/ui/manager.js`)
- 管理用户界面和管理面板
- 处理黑名单管理界面
- 提供配置选项界面

### 4. 观察器模块 (`/src/observers/page-observers.js`)
- 处理不同页面的初始化
- 监听页面内容变化
- 管理页面特定的逻辑

### 5. 广告屏蔽模块 (`/src/adblock/main.js`)
- 专门处理广告识别和屏蔽
- 管理广告选择器和规则

### 6. 工具函数模块 (`/src/utils/helpers.js`)
- 提供通用的辅助函数
- 包含DOM操作、页面检测等工具

### 7. 主入口 (`/src/main.js`)
- 整合所有模块并初始化脚本
- 设置全局事件监听器

## 开发工作流

### 开发阶段
1. 在 `/src/` 目录下的相应模块中进行开发
2. 每个模块负责特定的功能，保持职责单一
3. 使用ES6模块语法进行模块导入/导出

### 构建阶段
运行构建脚本将所有模块合并成单个用户脚本：

```bash
node build.js
```

构建后的文件会输出到 `./dist/bilibili-blacklist.user.js`

### 构建脚本功能
- 读取原始用户脚本的元数据头部
- 按顺序合并所有模块
- 移除ES6模块语法（import/export）
- 将所有代码包装在IIFE中
- 保持代码结构清晰，便于调试

## 重构改进

### 代码结构
- ✅ 实现模块化设计，提高可维护性
- ✅ 职责分离，每个模块专注特定功能
- ✅ 减少全局变量污染
- ✅ 改进代码可读性

### 功能完整性
- ✅ 保持原有所有功能
- ✅ 优化性能瓶颈
- ✅ 改进错误处理
- ✅ 添加类型注释

### 开发体验
- ✅ 便于单独测试和调试模块
- ✅ 降低代码耦合度
- ✅ 提高代码复用性
- ✅ 简化新功能添加流程

## 注意事项

1. 修改源代码后需要重新运行构建脚本
2. 构建脚本会自动处理模块导入/导出语法
3. 保持模块间的依赖关系清晰
4. 避免循环依赖