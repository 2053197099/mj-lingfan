# MJ 灵帆

一个用于 Midjourney 网页端的本地轻量浏览器扩展，聚焦文生图提示词排队、变量展开、翻译、自动发送和图片下载。

支持 Microsoft Edge 和 Google Chrome，使用 Manifest V3，无需构建步骤，加载项目目录即可使用。

![面板总览](docs/images/panel-overview.svg)

## 安装

1. 打开 `edge://extensions/` 或 `chrome://extensions/`
2. 打开“开发人员模式”
3. 点击“加载解压缩的扩展”
4. 选择本项目目录
5. 打开或刷新 `https://www.midjourney.com/imagine`

首次安装、更新或重新加载扩展后，需要刷新一次 Midjourney 页面，页面脚本才会生效。

## 默认设置

| 项目 | 默认值 | 说明 |
| --- | --- | --- |
| 发送模式 | `Relax` | 发送时追加 `--relax` |
| 图片尺寸 | `1:1` | 发送时追加 `--ar 1:1` |
| 重复次数 | `1` | 每条提示词生成 1 个任务 |
| 发送间隔 | `10-30 秒` | 每次发送后随机等待 |
| 队列上限 | `500 条` | 防止变量展开过多导致页面卡死 |
| 自动下载 | 关闭 | 开启后尝试下载新出现的可见图片 |

## 默认命令规则

![默认命令规则](docs/images/command-rules.svg)

### 示例 1：只输入数字

输入：

```text
1
```

默认发送：

```text
1 --sref random --relax --ar 1:1
```

### 示例 2：切换尺寸

输入：

```text
sacred snowy mountain
```

选择 `9:16` 后发送：

```text
sacred snowy mountain --relax --ar 9:16
```

### 示例 3：后缀输入数字

提示词：

```text
masked assassin
```

提示词后缀：

```text
201824100
```

默认发送：

```text
masked assassin --sref 201824100 --relax --ar 1:1
```

## 按钮说明

### 顶部按钮

| 按钮 | 作用 |
| --- | --- |
| `?` | 打开插件内置使用说明 |
| `← / →` | 把面板切换到浏览器左侧或右侧 |
| `×` | 收起为侧边小图标，再点图标可打开 |

### 发送控制

| 按钮/控件 | 作用 | 示例 |
| --- | --- | --- |
| `开始` | 如果队列为空，会先把当前提示词加入队列，再开始发送 | 输入 `1` 后点开始，会发送默认命令 |
| `暂停` | 停止后续任务，不清空队列 | 正在等待间隔时可暂停 |
| `加入队列` | 只添加任务，不立即发送 | 先准备 50 条，再统一点开始 |
| `Relax` | 使用 Midjourney 慢速模式 | 追加 `--relax` |
| `Fast` | 使用 Midjourney 快速模式 | 追加 `--fast` |
| `自动下载` | 尝试下载新出现的可见图片 | 下载位置由浏览器决定 |
| `重复次数` | 每条提示词重复加入几次 | `3` 表示每条提示词加入 3 个任务 |
| `间隔` | 每次发送后的随机等待区间 | `10-30 秒` 表示随机等待 |

### 工具按钮

| 按钮 | 作用 |
| --- | --- |
| `变量` | 管理提示词变量，可用 `@变量名` 调用 |
| `↻` | 重置面板设置和输入框 |
| `🧹` | 清空日志，不影响正在运行的任务 |
| `文A` | 把提示词中的中文翻译为英文 |

### 提示词区域

| 控件 | 作用 | 示例 |
| --- | --- | --- |
| 尺寸按钮 | 选择 Midjourney `--ar` 参数 | `1:1`、`9:16`、`16:9` |
| 提示词 | 每行一个任务 | 一行 `cat`，一行 `dog` |
| 提示词前缀 | 自动加在每条提示词前面 | `cinematic lighting` |
| 提示词后缀 | 自动加在每条提示词后面 | `--style raw` 或 `201824100` |

### 队列按钮

| 按钮 | 作用 |
| --- | --- |
| `复制队列` | 复制队列中的提示词文本 |
| `导出提示词` | 导出纯提示词 `.txt` |
| `导出完整队列` | 导出包含状态的 `.json` |
| `清空` | 清空队列、日志和运行状态 |
| `下载可见图片` | 下载当前页面可见的 Midjourney 图片 |
| `重试失败` | 把失败任务重新设为待发送 |
| `清理已完成` | 删除已发送任务 |
| `↑ / ↓` | 调整单个任务顺序 |
| `↻` | 重试单个任务 |
| `×` | 删除单个任务 |

## 变量用法

![变量使用流程](docs/images/variable-flow.svg)

变量适合保存常用人物、风格、场景、参数。变量值建议使用英文，每行一个。

示例变量：

```text
东方自然风景=golden ginkgo forest|ink wash mountains|eastern sea of clouds
```

在提示词中输入：

```text
@东方自然风景
```

会展开为多条任务：

```text
golden ginkgo forest --relax --ar 1:1
ink wash mountains --relax --ar 1:1
eastern sea of clouds --relax --ar 1:1
```

支持三种写法：

```text
@东方自然风景
{东方自然风景}
[东方自然风景]
```

## 翻译说明

`文A` 会把当前中文提示词翻译为英文，并回填到提示词输入框。

翻译依赖第三方免费接口 `api.mymemory.translated.net`，可能会因网络、频率限制或接口状态不稳定而失败。失败时插件会保留原始提示词，并提示稍后重试。

## 使用建议

- 长队列发送时，建议单独开一个 Edge 或 Chrome 窗口放 Midjourney 页面。
- 不要最小化 Midjourney 窗口，避免浏览器休眠页面。
- 如果出现失败，先看失败分类：输入框、超时、页面休眠、页面关闭、其他。
- 更新扩展后，一定要刷新 Midjourney 页面。

## 浏览器兼容

- Microsoft Edge：支持，推荐使用最新版
- Google Chrome：支持，推荐使用最新版
- 其他 Chromium 内核浏览器：理论上可用，但未作为主要目标测试

## 权限说明

- `storage`：保存队列、变量、面板位置和用户设置
- `alarms`：让队列间隔在浏览器后台更稳定地继续计时
- `downloads`：下载 Midjourney 页面图片和导出的队列文件
- `https://www.midjourney.com/*`：在 Midjourney 页面注入助手面板
- `https://api.mymemory.translated.net/*`：调用免费翻译接口

## 开发检查

```bash
node --check content.js
node --check background.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```
