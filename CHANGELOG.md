# 更新记录 (Changelog)

## [重构版] - 2025-12-04

### 重构变更
- 将原单一文件脚本拆分为多个模块，提高代码可维护性
- 创建了以下模块：
  - `src/main.js`: 主入口文件
  - `src/storage/storage.js`: 存储管理模块
  - `src/core/core.js`: 核心屏蔽功能模块
  - `src/core/video-data.js`: 视频数据获取模块
  - `src/ui/ui.js`: 用户界面模块
  - `src/observer/observer.js`: 变动观察器模块
  - `src/pages/pages.js`: 页面检测和初始化模块
  - `src/ads/ads.js`: 广告屏蔽模块
  - `src/utils/utils.js`: 工具函数模块
- 添加构建脚本 `build.js`，自动合并所有模块到单个文件
- 添加 `package.json` 配置文件
- 添加 `README.md` 说明文档

### 重构优点
- 代码结构更清晰，便于维护和扩展
- 各功能模块职责明确，降低耦合性
- 自动化构建流程，确保发布版本一致性
- 保留了原脚本的所有功能和特性