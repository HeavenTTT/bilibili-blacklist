/**
 * 全局环境声明（供编辑器 / tsc 的 JS 类型检查使用；不参与构建）
 * -----------------------------------------------------------
 * 本仓库的 src/ 模块**没有 import/export**，由 build.js 拼进同一个 IIFE，
 * 因此 TypeScript 会把它们视为同一全局作用域 —— 跨文件引用的变量/函数能被正确解析。
 * 这正是本项目最容易踩的坑（拼错变量名只在运行时炸），所以保留这份声明文件，
 * 编辑器打开任一 src 文件即可获得「未定义变量 / 拼写错误 / 参数不匹配」提示。
 *
 * 想跑完整检查需要 typescript（本仓库刻意零依赖，未安装）：
 *   npx tsc -p jsconfig.json
 * 只做编辑期提示时，VS Code 内置 TS 语言服务会直接读取 jsconfig.json + 本文件。
 */

/* ===== Tampermonkey GM_* API（同步版本，见 build.config.json 的 @grant）===== */
declare function GM_getValue<T = any>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: any): void;
declare function GM_addStyle(css: string): void;
declare function GM_registerMenuCommand(name: string, fn: () => void): void;

/** 页面上下文（@grant unsafeWindow 提供），用于读取 B 站的 __INITIAL_STATE__ / patch fetch */
declare const unsafeWindow: any;

/* ===== 构建期注入 ===== */
/** 仅 --dev 构建会在 IIFE 顶部注入 `const __DSH_DEV__ = true;`，发布构建没有该标识符。 */
declare const __DSH_DEV__: boolean | undefined;
