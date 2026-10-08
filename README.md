# Image Collector

[下载最新版](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest/download/image-collector.zip) · [版本记录](https://github.com/fangxiaoxingit/image-collection-chrome/releases) · [发布指南](docs/RELEASING.md)

一个用于收集、预览和批量下载网页图片的 Chrome 扩展。支持右键收集单张图片，也可以解析页面后挑选需要的图片。

## 功能

- **图片采集**：右键收集、解析当前标签页、输入网址解析。
- **候选筛选**：查看图片分辨率和文件大小，勾选后添加到收集列表。
- **图片管理**：大图预览、上一张 / 下一张切换、全选、单项或批量删除。
- **日期分组**：按添加日期从新到旧排列，支持按日、周、月查看。
- **批量下载**：按年月目录保存，支持自定义子目录和下载 URL 参数。
- **数据备份**：JSON 导入 / 导出，按完整 URL 自动去重。

## 安装

1. 从 [最新 Release](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest) 下载 `image-collector.zip` 并解压。
2. 在 Chrome 地址栏打开 `chrome://extensions/`。
3. 开启右上角的“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择解压后包含 `manifest.json` 的目录；若通过源码安装，则选择仓库下的 `extension` 目录。
5. 在浏览器扩展菜单中将 **Image Collector** 固定到工具栏，方便使用。

无需安装依赖或运行构建命令。加载步骤也可参考 [Chrome 官方说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)。

更新时解压新版本，重新加载扩展并刷新已打开的插件页面。当前通过 GitHub 分发。

## 使用

### 收集图片

- **单张收集**：在网页图片上右键，选择“收集图片”。
- **当前页面**：点击插件图标 → “解析页面”，在候选页勾选图片并点击“添加已选”。
- **指定网址**：在解析页输入网址，点击“解析网址”，再勾选并添加图片。解析时会临时打开后台标签页，完成后关闭。

### 管理与下载

点击插件图标 → “收集列表”。勾选图片后可批量下载或删除，点击图片可打开大图预览。预览支持左右方向键切换、`Esc` 关闭。

顶部“日期排序”默认按日分组，可切换为按周或按月，并记住上次选择。日期按浏览器本地时区计算，每周从周一开始；分组及组内图片均为最新添加在前。

“发送邮件”会打开默认邮件客户端，将选中图片的 URL 填入正文，实际发送由你完成。“刷新”用于重新读取本地列表与配置。

### 下载设置

在收集列表点击“更多功能”：

| 设置 | 说明 |
| --- | --- |
| 下载目录 | 填写相对于浏览器默认下载目录的子目录，例如 `image-collector`；留空则直接在默认下载目录下按年月保存。 |
| URL 参数 | 默认值为 `format=jpg&name=large`。填写后会整体替换下载链接原有的查询参数；留空则保留原链接。 |

保存路径示例：

```text
默认下载目录/
└── image-collector/       # 自定义子目录，可留空
    └── YYYY-MM/
        └── 图片文件
```

**使用普通图片链接或带签名参数的链接时，建议将“URL 参数”留空，避免替换原参数导致下载失败。** 该设置只影响下载，不修改收集列表中的原始 URL。

批量下载将图片分别保存为独立文件，不生成 ZIP。页面提示统计的是下载任务启动结果，最终完成情况以 Chrome 下载记录为准。若出现保存位置提示，可在 `chrome://settings/downloads` 中调整相关设置。下载路径范围参见 [Chrome 下载 API 说明](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadOptions)。

## 数据与权限

采集记录、解析候选和配置保存在当前浏览器的本地扩展存储中，不上传至项目服务器。预览、文件大小检测和下载会请求图片原站；解析指定网址会访问对应页面。

JSON 导出包含完整图片 URL 和下载配置，可通过“更多功能”导入恢复。分享导出文件前，请检查 URL 中是否含私人访问参数。

| 权限 | 用途 |
| --- | --- |
| `contextMenus` | 提供“收集图片”右键菜单。 |
| `storage` | 保存采集记录、候选结果与配置。 |
| `downloads` | 发起图片下载。 |
| `tabs` | 获取页面信息、打开列表页及临时解析标签页。 |
| `scripting` | 在目标页面执行图片提取脚本。 |
| `activeTab` | 点击插件时，临时获得当前标签页的访问权限。 |
| `<all_urls>` | 允许解析不同网站，并向图片原站请求文件大小。 |

## 已知限制

- 页面解析只提取当时已有的 HTTP(S) `<img>`，宽高均需至少 120px。不提取 CSS 背景、Canvas 或 `data:` / `blob:` 图片，也不会自动滚动加载更多内容；可先滚动页面，再使用“解析页面”。
- “刷新候选”只重新读取上一次解析结果；页面内容变化后，需要重新解析。
- 右键采集不验证目标是否为图片，在非图片位置使用时可能保存网页、链接或媒体地址。
- 去重依据完整 URL，不比较图片内容；同一图片的不同 URL 仍可能分别保存。
- 文件大小无法获取时显示“未知”；链接过期或原站访问限制可能导致预览或下载失败。

## 开发

使用原生 JavaScript、HTML / CSS 和 Manifest V3，无框架或构建步骤。

```text
extension/
├── manifest.json       # 扩展配置与权限
├── background.js       # 右键菜单与单张采集
├── assets/             # 图标
├── pages/
│   ├── popup.*         # 插件入口菜单
│   ├── list.*          # 收集列表、预览与配置
│   └── parse.*         # 页面解析与候选筛选
└── utils/              # 本地存储、下载及辅助工具
```

修改代码后，在 `chrome://extensions/` 点击扩展的“重新加载”，并刷新已打开的插件页面。页面交互可通过开发者工具调试；后台日志可在扩展详情的 Service Worker 调试入口查看。

提交改动前，建议验证右键去重、页面解析、候选添加、下载、删除及 JSON 导入 / 导出。

## 自动发布

推送 `main` 或提交 PR 时，GitHub Actions 自动校验并生成安装包。推送与 `manifest.json` 版本匹配的 `v*` 标签后，自动发布 Release，上传固定名 ZIP、版本名 ZIP 和 SHA-256 校验文件。

本地打包运行 `python3 scripts/package.py`，产物位于 `dist/`。完整步骤和手动发布方式见 [发布指南](docs/RELEASING.md)。

## 许可

本项目使用 [MIT License](LICENSE)。
