# MJ 灵帆

一个用于 Midjourney 网页端的轻量浏览器扩展，聚焦文生图提示词排队、变量展开、翻译、自动发送和图片下载。

支持 Microsoft Edge 和 Google Chrome，使用 Manifest V3，无需构建步骤。

## 功能

- 文生图批量提示词队列
- 提示词前缀、后缀和尺寸选择
- `Fast` / `Relax` 发送模式
- 提示词输入纯数字时默认追加 `--sref random`，例如 `1` 会变成 `1 --sref random`
- 提示词后缀输入纯数字时会自动转换成 `--sref 数字`
- 变量预设管理，支持在提示词里输入 `@变量名`、`{变量名}` 或 `[变量名]`
- 内置东方美学核能词变量预设
- 中文提示词翻译为英文
- 队列暂停、重试、删除、上下移动
- 导出提示词、导出完整队列、复制队列
- 鼠标悬停 Midjourney 图片时显示单张/批量下载按钮
- 可选自动下载当前页面新出现的可见图片

## 安装

1. 打开 `edge://extensions/` 或 `chrome://extensions/`
2. 打开“开发人员模式”
3. 点击“加载解压缩的扩展”
4. 选择本项目目录
5. 打开或刷新 `https://www.midjourney.com/imagine`

## 浏览器兼容

- Microsoft Edge：支持，推荐使用最新版
- Google Chrome：支持，推荐使用最新版
- 其他 Chromium 内核浏览器：理论上可用，但未作为主要目标测试

## 权限说明

- `storage`：保存队列、变量、面板位置和用户设置
- `downloads`：下载 Midjourney 页面图片和导出的队列文件
- `https://www.midjourney.com/*`：在 Midjourney 页面注入助手面板
- `https://api.mymemory.translated.net/*`：调用免费翻译接口

## 开发检查

```bash
node --check content.js
node --check background.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```
