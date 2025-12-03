# Bilibili-BlackList

> Bilibili UP 主视频屏蔽插件 —— 支持精确匹配 / 正则匹配，屏蔽主页 / 播放页 / 搜索页 / 分类页 / 用户空间中的指定内容。  
> 代码主要由 AI 辅助生成，持续优化中。

---

## 📌 插件简介

**Bilibili-BlackList** 是一款油猴（Tampermonkey）用户脚本，支持自定义屏蔽 B 站上的不感兴趣 UP 主和视频内容，提升个人使用体验。  
支持**全站主要页面**，并提供**图形化黑名单管理界面**，无需修改代码即可编辑黑名单。

### 特色功能

- ✅ **视频卡片屏蔽**，支持 主页 / 播放页 / 分类页 / 搜索页。
- ✅ **用户空间支持**，直接屏蔽当前访问的 UP 主。
- ✅ **屏蔽策略**：
  - **精确匹配黑名单**（UP 主名称匹配）。
  - **正则匹配黑名单**（UP 主 / 视频标题匹配）。
- ✅ **黑名单管理面板**，支持一键添加 / 移除黑名单项，切换“取消屏蔽 / 恢复屏蔽”。
- ✅ **已屏蔽视频计数展示**，方便查看效果。
- ✅ **广告屏蔽**，屏蔽部分推广卡片。
- ✅ **自动适配动态内容加载**，无需手动刷新。

---

## 🚀 安装方式

### 1️⃣ 安装 Tampermonkey

👉 [https://tampermonkey.net/](https://tampermonkey.net/)

### 2️⃣ 安装脚本

👉 [GreasyFork 脚本地址](https://update.greasyfork.org/scripts/533940/Bilibili-BlackList.user.js)  
👉 或直接在 [GitHub Releases](https://github.com/HeavenTTT/bilibili-blacklist/releases) 下载 `.user.js` 脚本手动安装。

### 3️⃣ 打开 Bilibili 网站，右上角将出现插件入口，开始使用。

---

## 🖼 使用截图

（可在这里插入使用截图，示意管理面板、屏蔽效果等）

---

## 📒 使用说明

### 页面支持

| 页面类型 | 是否支持 |
| -------- | -------- |
| B 站主页 | ✅ |
| 播放页 `/video/` | ✅ |
| 分类页 `/c/` | ✅ |
| 搜索页 `search.bilibili.com` | ✅ |
| 用户空间页 `space.bilibili.com` | ✅ |

### 黑名单管理

- 右上角盾牌图标 → 打开管理面板。
- 添加 / 移除 **精确匹配** UP 主。
- 添加 / 移除 **正则匹配**规则，匹配 UP 主 / 视频标题。
- 切换 **取消屏蔽 / 恢复屏蔽**，查看当前屏蔽数量。

### 用户空间增强

- 用户空间页昵称旁直接增加 "屏蔽" 按钮。
- 已屏蔽状态下昵称加删除线，全站页面灰度提示。

### 广告屏蔽

- 部分主页推广、直播推广。
- 播放页推广 / 游戏推广等广告元素。

---

## 📋 更新记录

详见 [CHANGELOG.md](./CHANGELOG.md)

---

## ⚠️ 注意事项

- 代码主要由 AI 工具（ChatGPT / Gemini / DeepSeek）辅助生成，作者不保证稳定性，欢迎反馈问题。
- 如有 B 站页面结构调整，可能需要更新脚本适配。
- 脚本完全本地运行，不上传任何用户数据，黑名单保存在浏览器中。

---

## 📜 开源许可

MIT License.

---

## 🤝 致谢

感谢以下工具 / 项目：

- ChatGPT / Gemini / DeepSeek AI 辅助代码生成
- Tampermonkey 油猴脚本平台
- Bilibili 官方页面结构

---

**Enjoy a clean and personalized Bilibili! 🚀**

